#pragma once

#include "html_to_text.hpp"
#include "json.hpp"
#include "reflect.hpp"

#include <algorithm>
#include <cstdint>
#include <optional>
#include <regex>
#include <string>
#include <string_view>
#include <vector>

namespace gws {

struct GmailAttachment {
    slimr::Desc<std::string, "Attachment file name."> filename;
    slimr::Desc<std::string, "Attachment MIME type."> mimeType{"application/octet-stream"};
    slimr::Desc<int64_t, "Attachment size in bytes."> size{0};
    slimr::OptField<std::optional<std::string>, "Pass to gmail users.messages.attachments.get (with the message id) to download the bytes."> attachmentId;

    bool operator==(const GmailAttachment& o) const = default;
};

struct GmailMessageSummary {
    slimr::Desc<std::string, "Message id."> id;
    slimr::Desc<std::string, "Thread id."> threadId;
    slimr::Desc<std::vector<std::string>, "Gmail label ids (e.g. INBOX, UNREAD)."> labelIds;
    slimr::OptField<std::optional<std::string>, "Gmail's short snippet."> snippet;
    slimr::OptField<std::optional<std::string>, "Subject header."> subject;
    slimr::OptField<std::optional<std::string>, "From header."> from;
    slimr::OptField<std::optional<std::string>, "To header."> to;
    slimr::OptField<std::optional<std::string>, "Cc header."> cc;
    slimr::OptField<std::optional<std::string>, "Date header."> date;
    slimr::Desc<std::string, "Body as plain text (text/plain part, else HTML converted to text)."> body;
    slimr::Desc<std::string, "Which MIME part the body came from."> bodySource{"none"}; // "text/plain", "text/html", "none"
    slimr::Desc<bool, "True when the body was cut to the character limit."> bodyTruncated{false};
    slimr::Desc<std::vector<GmailAttachment>, "Attachments (parts with a filename)."> attachments;

    bool operator==(const GmailMessageSummary& o) const = default;
};

struct GmailHeader {
    std::string name;
    std::string value;
};

struct GmailBody {
    std::optional<std::string> attachmentId;
    std::optional<std::string> data;
    std::optional<int64_t> size;
};

struct GmailPart {
    std::optional<GmailBody> body;
    std::optional<std::string> filename;
    std::optional<std::vector<GmailHeader>> headers;
    std::optional<std::string> mimeType;
    std::optional<std::vector<GmailPart>> parts;
};

struct GmailRawMessage {
    std::string id;
    std::string threadId;
    std::optional<std::vector<std::string>> labelIds;
    std::optional<std::string> snippet;
    std::optional<GmailPart> payload;
};

inline int b64_char_value(unsigned char c) {
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (c == '+' || c == '-') return 62;
    if (c == '/' || c == '_') return 63;
    return -1;
}

inline std::string decode_base64url(std::string_view input) {
    std::string out;
    out.reserve(input.size() * 3 / 4);
    uint32_t val = 0;
    int valb = -8;
    for (char c : input) {
        if (c == '=') break;
        int d = b64_char_value(static_cast<unsigned char>(c));
        if (d == -1) continue;
        val = (val << 6) | d;
        valb += 6;
        if (valb >= 0) {
            out.push_back(static_cast<char>((val >> valb) & 0xFF));
            valb -= 8;
        }
    }
    return out;
}

inline std::string encode_base64url(std::string_view input) {
    static const char* chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    std::string out;
    size_t i = 0;
    while (i < input.size()) {
        size_t remaining = input.size() - i;
        uint32_t a = static_cast<unsigned char>(input[i++]);
        uint32_t b = (remaining > 1) ? static_cast<unsigned char>(input[i++]) : 0;
        uint32_t c = (remaining > 2) ? static_cast<unsigned char>(input[i++]) : 0;
        uint32_t triple = (a << 16) | (b << 8) | c;

        out.push_back(chars[(triple >> 18) & 0x3F]);
        out.push_back(chars[(triple >> 12) & 0x3F]);
        if (remaining > 1) {
            out.push_back(chars[(triple >> 6) & 0x3F]);
        }
        if (remaining > 2) {
            out.push_back(chars[triple & 0x3F]);
        }
    }
    return out;
}

inline std::optional<std::string> header_value(const std::optional<std::vector<GmailHeader>>& headers, std::string_view name) {
    if (!headers) return std::nullopt;
    std::string lower_name = to_lower(name);
    for (const auto& h : *headers) {
        if (to_lower(h.name) == lower_name) {
            return h.value;
        }
    }
    return std::nullopt;
}

inline std::vector<GmailAttachment> collect_attachments(const std::optional<GmailPart>& part) {
    if (!part) return {};
    std::vector<GmailAttachment> list;
    if (part->filename.has_value() && !part->filename->empty()) {
        GmailAttachment att;
        att.filename = *part->filename;
        att.mimeType = part->mimeType.value_or("application/octet-stream");
        att.size = part->body && part->body->size ? *part->body->size : 0;
        if (part->body && part->body->attachmentId) {
            att.attachmentId = part->body->attachmentId;
        }
        list.push_back(std::move(att));
    }
    if (part->parts) {
        for (const auto& child : *part->parts) {
            auto sub = collect_attachments(child);
            list.insert(list.end(), sub.begin(), sub.end());
        }
    }
    return list;
}

inline std::string decode_part_body(const GmailPart& part) {
    std::string raw_data = part.body && part.body->data ? *part.body->data : "";
    std::string bytes = decode_base64url(raw_data);
    std::string ct = header_value(part.headers, "content-type").value_or("");
    static const std::regex charset_re(R"RAW(charset="?([^";\s]+)"?)RAW", std::regex::icase);
    std::smatch m;
    std::string charset = "utf-8";
    if (std::regex_search(ct, m, charset_re)) {
        charset = to_lower(m[1].str());
    }

    if (charset == "iso-8859-1" || charset == "latin1") {
        std::string utf8;
        utf8.reserve(bytes.size() * 2);
        for (unsigned char b : bytes) {
            if (b < 128) {
                utf8.push_back(static_cast<char>(b));
            } else {
                utf8.push_back(static_cast<char>(0xC0 | (b >> 6)));
                utf8.push_back(static_cast<char>(0x80 | (b & 0x3F)));
            }
        }
        return utf8;
    }
    return bytes;
}

inline const GmailPart* find_body_part(const GmailPart* part, std::string_view mimeType) {
    if (!part) return nullptr;
    bool is_match = part->mimeType.has_value() && *part->mimeType == mimeType;
    bool has_data = part->body.has_value() && part->body->data.has_value() && !part->body->data->empty();
    bool no_filename = !part->filename.has_value() || part->filename->empty();

    if (is_match && has_data && no_filename) {
        return part;
    }

    if (part->parts) {
        for (const auto& child : *part->parts) {
            const GmailPart* hit = find_body_part(&child, mimeType);
            if (hit) return hit;
        }
    }
    return nullptr;
}

inline GmailMessageSummary summarize_message(const GmailRawMessage& message, size_t maxBodyChars) {
    const GmailPart* payload_ptr = message.payload ? &(*message.payload) : nullptr;
    const GmailPart* plain = find_body_part(payload_ptr, "text/plain");
    const GmailPart* html = plain ? nullptr : find_body_part(payload_ptr, "text/html");

    std::string body;
    std::string bodySource = "none";

    if (plain) {
        std::string decoded = decode_part_body(*plain);
        // Replace \r with empty
        std::string no_r;
        no_r.reserve(decoded.size());
        for (char c : decoded) if (c != '\r') no_r.push_back(c);

        // Replace \n{3,} with \n\n
        static const std::regex multi_nl(R"RAW(\n{3,})RAW");
        body = std::regex_replace(no_r, multi_nl, "\n\n");
        body = trim(body);
        bodySource = "text/plain";
    } else if (html) {
        body = html_to_text(decode_part_body(*html));
        bodySource = "text/html";
    }

    bool bodyTruncated = (body.size() > maxBodyChars);
    if (bodyTruncated) {
        body = body.substr(0, maxBodyChars) + "\n…[truncated]";
    }

    GmailMessageSummary summary;
    summary.id = message.id;
    summary.threadId = message.threadId;
    summary.labelIds = message.labelIds.value_or(std::vector<std::string>{});
    summary.snippet = message.snippet;
    summary.body = std::move(body);
    summary.bodySource = std::move(bodySource);
    summary.bodyTruncated = bodyTruncated;

    if (message.payload) {
        summary.attachments = collect_attachments(message.payload);
        summary.subject = header_value(message.payload->headers, "subject");
        summary.from = header_value(message.payload->headers, "from");
        summary.to = header_value(message.payload->headers, "to");
        summary.cc = header_value(message.payload->headers, "cc");
        summary.date = header_value(message.payload->headers, "date");
    }

    return summary;
}

} // namespace gws
