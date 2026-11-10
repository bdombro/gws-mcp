#pragma once

#include <algorithm>
#include <cctype>
#include <regex>
#include <set>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

namespace gws {

inline std::string to_lower(std::string_view s) {
    std::string out;
    out.reserve(s.size());
    for (char c : s) out.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
    return out;
}

inline std::string trim(std::string_view s) {
    size_t start = 0;
    while (start < s.size() && (s[start] == ' ' || s[start] == '\t' || s[start] == '\r' || s[start] == '\n')) {
        start++;
    }
    size_t end = s.size();
    while (end > start && (s[end - 1] == ' ' || s[end - 1] == '\t' || s[end - 1] == '\r' || s[end - 1] == '\n')) {
        end--;
    }
    return std::string(s.substr(start, end - start));
}

inline std::string codepoint_to_utf8(uint32_t cp) {
    std::string out;
    if (cp <= 0x7F) {
        out.push_back(static_cast<char>(cp));
    } else if (cp <= 0x7FF) {
        out.push_back(static_cast<char>(0xC0 | ((cp >> 6) & 0x1F)));
        out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else if (cp <= 0xFFFF) {
        out.push_back(static_cast<char>(0xE0 | ((cp >> 12) & 0x0F)));
        out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else if (cp <= 0x10FFFF) {
        out.push_back(static_cast<char>(0xF0 | ((cp >> 18) & 0x07)));
        out.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
        out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    }
    return out;
}

inline const std::unordered_map<std::string, std::string>& get_html_entities() {
    static const std::unordered_map<std::string, std::string> ENTITIES = {
        {"amp", "&"},
        {"apos", "'"},
        {"copy", "\xc2\xa9"},     // ©
        {"euro", "\xe2\x82\xac"}, // €
        {"gt", ">"},
        {"hellip", "\xe2\x80\xa6"}, // …
        {"ldquo", "\xe2\x80\x9c"},  // “
        {"lsquo", "\xe2\x80\x98"},  // ‘
        {"lt", "<"},
        {"mdash", "\xe2\x80\x94"}, // —
        {"nbsp", " "},
        {"ndash", "\xe2\x80\x93"}, // –
        {"pound", "\xc2\xa3"},     // £
        {"quot", "\""},
        {"rdquo", "\xe2\x80\x9d"}, // ”
        {"rsquo", "\xe2\x80\x99"}, // ’
        {"zwnj", ""},
    };
    return ENTITIES;
}

inline std::string decode_entities(const std::string& text) {
    static const std::regex entity_re(R"RAW(&(#x?[0-9a-fA-F]+|\w+);)RAW");
    const auto& entities = get_html_entities();

    std::string out;
    auto begin = std::sregex_iterator(text.begin(), text.end(), entity_re);
    auto end = std::sregex_iterator();
    size_t last_pos = 0;

    for (auto it = begin; it != end; ++it) {
        std::smatch m = *it;
        out.append(text, last_pos, m.position() - last_pos);
        std::string raw_match = m.str();
        std::string ent = m[1].str();

        if (ent.front() == '#') {
            bool hex = (ent.size() > 1 && (ent[1] == 'x' || ent[1] == 'X'));
            size_t start_idx = hex ? 2 : 1;
            try {
                uint32_t code = std::stoul(ent.substr(start_idx), nullptr, hex ? 16 : 10);
                if (code <= 0x10ffff) {
                    out.append(codepoint_to_utf8(code));
                } else {
                    out.append(raw_match);
                }
            } catch (...) {
                out.append(raw_match);
            }
        } else {
            std::string lower_ent = to_lower(ent);
            auto hit = entities.find(lower_ent);
            if (hit != entities.end()) {
                out.append(hit->second);
            } else {
                out.append(raw_match);
            }
        }
        last_pos = m.position() + m.length();
    }
    out.append(text, last_pos, text.size() - last_pos);
    return out;
}

inline std::string strip_utm(const std::string& href) {
    size_t qpos = href.find('?');
    if (qpos == std::string::npos) return href;

    std::string base = href.substr(0, qpos);
    size_t hash_pos = href.find('#', qpos);
    std::string query = (hash_pos == std::string::npos) ? href.substr(qpos + 1) : href.substr(qpos + 1, hash_pos - (qpos + 1));
    std::string fragment = (hash_pos == std::string::npos) ? "" : href.substr(hash_pos);

    std::vector<std::string> kept;
    size_t start = 0;
    while (start < query.size()) {
        size_t amp = query.find('&', start);
        std::string param = (amp == std::string::npos) ? query.substr(start) : query.substr(start, amp - start);
        if (!param.starts_with("utm_")) {
            kept.push_back(param);
        }
        if (amp == std::string::npos) break;
        start = amp + 1;
    }

    if (kept.empty()) return base + fragment;
    std::string new_query;
    for (size_t i = 0; i < kept.size(); ++i) {
        if (i > 0) new_query += '&';
        new_query += kept[i];
    }
    return base + "?" + new_query + fragment;
}

inline const std::set<std::string>& get_void_tags() {
    static const std::set<std::string> VOID_TAGS = {
        "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "wbr"
    };
    return VOID_TAGS;
}

inline const std::set<std::string>& get_zero_properties() {
    static const std::set<std::string> ZERO_PROPERTIES = {
        "font-size", "height", "max-height", "max-width", "opacity", "width"
    };
    return ZERO_PROPERTIES;
}

inline bool is_zero_value(std::string_view val) {
    static const std::regex zero_re(R"RAW(^(?:0+(?:\.0*)?|\.0+)[a-z%]*$)RAW", std::regex::icase);
    return std::regex_match(val.begin(), val.end(), zero_re);
}

inline bool is_hidden(const std::string& attrs) {
    static const std::regex quoted_re(R"RAW("[^"]*"|'[^']*')RAW");
    std::string unquoted = std::regex_replace(attrs, quoted_re, "\"\"");
    static const std::regex hidden_attr_re(R"RAW((?:^|\s)hidden(?=[\s=/]|$))RAW", std::regex::icase);
    if (std::regex_search(unquoted, hidden_attr_re)) return true;

    static const std::regex style_re(R"RAW((?:^|\s)style\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))RAW", std::regex::icase);
    std::smatch m;
    if (!std::regex_search(attrs, m, style_re)) return false;

    std::string raw_style;
    if (m[1].matched) raw_style = m[1].str();
    else if (m[2].matched) raw_style = m[2].str();
    else if (m[3].matched) raw_style = m[3].str();

    std::string css = decode_entities(raw_style);
    static const std::regex comment_re(R"RAW(/\*[\s\S]*?\*/)RAW");
    css = std::regex_replace(css, comment_re, "");

    const auto& zero_props = get_zero_properties();
    size_t start = 0;
    while (start < css.size()) {
        size_t semi = css.find(';', start);
        std::string decl = (semi == std::string::npos) ? css.substr(start) : css.substr(start, semi - start);
        size_t colon = decl.find(':');
        if (colon != std::string::npos) {
            std::string prop = to_lower(trim(decl.substr(0, colon)));
            std::string val = decl.substr(colon + 1);
            static const std::regex important_re(R"RAW(!\s*important)RAW", std::regex::icase);
            val = std::regex_replace(val, important_re, "");
            val = to_lower(trim(val));

            if (prop == "display" && val == "none") return true;
            if (prop == "visibility" && (val == "hidden" || val == "collapse")) return true;
            if (zero_props.contains(prop) && is_zero_value(val)) return true;
        }
        if (semi == std::string::npos) break;
        start = semi + 1;
    }
    return false;
}

inline size_t element_end(const std::string& html, const std::string& name, size_t from) {
    static const std::regex any_tag_re(R"RAW(<(\/?)([a-z][a-z0-9]*)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>)RAW", std::regex::icase);

    auto begin = std::sregex_iterator(html.begin() + from, html.end(), any_tag_re);
    auto end = std::sregex_iterator();
    int depth = 1;

    for (auto it = begin; it != end; ++it) {
        std::smatch m = *it;
        std::string tag_name = to_lower(m[2].str());
        if (tag_name != name) continue;

        bool is_close = (m[1].length() > 0);
        std::string full_match = m[0].str();
        bool is_self_closing = (full_match.size() >= 2 && full_match[full_match.size() - 2] == '/');

        if (is_close) {
            depth -= 1;
        } else if (is_self_closing) {
            depth += 0;
        } else {
            depth += 1;
        }

        if (depth == 0) {
            size_t match_pos = from + m.position();
            return match_pos + m.length();
        }
    }
    return html.size();
}

inline std::string drop_hidden_elements(const std::string& html) {
    static const std::regex open_tag_re(R"RAW(<([a-z][a-z0-9]*)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>)RAW", std::regex::icase);
    const auto& void_tags = get_void_tags();
    std::string out;
    size_t pos = 0;

    auto it = std::sregex_iterator(html.begin(), html.end(), open_tag_re);
    auto end = std::sregex_iterator();

    for (; it != end; ++it) {
        std::smatch m = *it;
        size_t m_index = m.position();
        if (m_index < pos) continue;

        std::string name = to_lower(m[1].str());
        std::string attrs = m[2].str();
        std::string full = m[0].str();
        bool self_close = (full.size() >= 2 && full[full.size() - 2] == '/') || (!attrs.empty() && attrs.back() == '/');

        if (void_tags.contains(name) || self_close || !is_hidden(attrs)) {
            continue;
        }

        out.append(html, pos, m_index - pos);
        pos = element_end(html, name, m_index + m.length());
    }
    out.append(html, pos, html.size() - pos);
    return out;
}

inline std::string html_to_text(const std::string& html) {
    // 1. Drop comments <!--...-->
    static const std::regex comment_re(R"RAW(<!--[\s\S]*?-->)RAW");
    std::string s = std::regex_replace(html, comment_re, "");

    // 2. Drop head|style|script|title
    static const std::regex head_style_re(R"RAW(<(head|style|script|title)\b[\s\S]*?<\/\1>)RAW", std::regex::icase);
    s = std::regex_replace(s, head_style_re, "");

    // 3. Drop hidden elements
    s = drop_hidden_elements(s);

    // 4. Links: <a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>
    static const std::regex link_re(R"RAW(<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>)RAW", std::regex::icase);
    static const std::regex strip_tags_re(R"RAW(<[^>]+>)RAW");

    std::string link_processed;
    auto l_begin = std::sregex_iterator(s.begin(), s.end(), link_re);
    auto l_end = std::sregex_iterator();
    size_t last_pos = 0;

    for (auto it = l_begin; it != l_end; ++it) {
        std::smatch m = *it;
        link_processed.append(s, last_pos, m.position() - last_pos);
        std::string href = m[1].str();
        std::string inner = m[2].str();
        std::string text = trim(std::regex_replace(inner, strip_tags_re, ""));

        if (text.empty() || href.starts_with("mailto:") || href.size() > 300) {
            link_processed.append(text);
        } else {
            link_processed.append(text + " (" + strip_utm(decode_entities(href)) + ")");
        }
        last_pos = m.position() + m.length();
    }
    link_processed.append(s, last_pos, s.size() - last_pos);
    s = std::move(link_processed);

    // 5. Block tags to newline: <(br|/p|/div|/tr|/h[1-6]|/li|/table)...> -> \n
    static const std::regex block_re(R"RAW(<(br|\/p|\/div|\/tr|\/h[1-6]|\/li|\/table)\b[^>]*>)RAW", std::regex::icase);
    s = std::regex_replace(s, block_re, "\n");

    // 6. </t[dh]> to space
    static const std::regex td_re(R"RAW(<\/t[dh]>)RAW", std::regex::icase);
    s = std::regex_replace(s, td_re, " ");

    // 7. Strip other HTML tags
    s = std::regex_replace(s, strip_tags_re, "");

    // 8. Decode entities
    s = decode_entities(s);

    // 9. Strip zero-width and invisible characters
    // U+200B..U+200F (\xe2\x80[\x8b-\x8f]), U+00AD (\xc2\xad), U+2060 (\xe2\x81\xa0), U+FEFF (\xef\xbb\xbf), U+034F (\xcd\x8f)
    static const std::regex invisible_re(R"RAW(\xe2\x80[\x8b-\x8f]|\xc2\xad|\xe2\x81\xa0|\xef\xbb\xbf|\xcd\x8f)RAW");
    s = std::regex_replace(s, invisible_re, "");

    // 10. Strip \r
    std::string no_r;
    no_r.reserve(s.size());
    for (char c : s) if (c != '\r') no_r.push_back(c);
    s = std::move(no_r);

    // 11. Replace non-breaking spaces (\xc2\xa0) with regular spaces
    std::string no_nbsp;
    no_nbsp.reserve(s.size());
    for (size_t i = 0; i < s.size(); ++i) {
        if (static_cast<unsigned char>(s[i]) == 0xC2 && i + 1 < s.size() && static_cast<unsigned char>(s[i + 1]) == 0xA0) {
            no_nbsp.push_back(' ');
            i++;
        } else {
            no_nbsp.push_back(s[i]);
        }
    }
    s = std::move(no_nbsp);

    // 12. Collapse spaces and tabs
    static const std::regex space_re(R"RAW([ \t]+)RAW");
    s = std::regex_replace(s, space_re, " ");

    // 13. Collapse  *\n * to \n
    static const std::regex nl_space_re(R"RAW( *\n *)RAW");
    s = std::regex_replace(s, nl_space_re, "\n");

    // 14. Collapse 3 or more newlines to \n\n
    static const std::regex multi_nl_re(R"RAW(\n{3,})RAW");
    s = std::regex_replace(s, multi_nl_re, "\n\n");

    // 15. Split by \n\n, filter out identical consecutive paragraphs
    std::vector<std::string> paras;
    size_t p_start = 0;
    while (p_start < s.size()) {
        size_t p_end = s.find("\n\n", p_start);
        std::string p = (p_end == std::string::npos) ? s.substr(p_start) : s.substr(p_start, p_end - p_start);
        if (paras.empty() || p != paras.back()) {
            paras.push_back(p);
        }
        if (p_end == std::string::npos) break;
        p_start = p_end + 2;
    }

    std::string out;
    for (size_t i = 0; i < paras.size(); ++i) {
        if (i > 0) out += "\n\n";
        out += paras[i];
    }
    return trim(out);
}

} // namespace gws
