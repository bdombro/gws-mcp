#define SLIMR_TEST_MAIN
#include "test.hpp"

#include "app.hpp"
#include "client.hpp"
#include "html_to_text.hpp"
#include "mime.hpp"

#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

namespace fs = std::filesystem;
using namespace gws;

TEST_CASE("subprocess working directory is applied without invoking gws") {
    slimr::testing::TempDirGuard temp;
    struct RestoreBinary {
        std::optional<std::string> previous;
        RestoreBinary() {
            if (const char* value = getenv("GWS_BIN")) previous = value;
            setenv("GWS_BIN", "/bin/pwd", 1);
        }
        RestoreBinary(const RestoreBinary&) = delete;
        RestoreBinary& operator=(const RestoreBinary&) = delete;
        ~RestoreBinary() {
            if (previous) setenv("GWS_BIN", previous->c_str(), 1);
            else unsetenv("GWS_BIN");
        }
    } restore;
    const auto run = exec_gws({}, temp.path.string());
    CHECK(run.exitCode == 0);
    CHECK(fs::weakly_canonical(run.stdoutStr.substr(0, run.stdoutStr.find('\n'))) ==
          fs::weakly_canonical(temp.path));
    CHECK_THROWS_AS(exec_gws({}, (temp.path / "missing").string()), GwsError);
}

// Mock runner helper
struct MockGws {
    std::vector<std::vector<std::string>> calls;
    std::function<GwsRun(const std::vector<std::string>&, const std::string&)> reply;

    GwsRun operator()(const std::vector<std::string>& args, const std::string& cwd) {
        calls.push_back(args);
        if (reply) {
            return reply(args, cwd);
        }
        return GwsRun{.exitCode = 0, .stderrStr = "Using keyring backend: keyring\n", .stdoutStr = "{}"};
    }

    GwsRunner runner() {
        return [this](const std::vector<std::string>& args, const std::string& cwd) {
            return (*this)(args, cwd);
        };
    }
};

const std::string NEWSLETTER = []() {
    std::string s = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Weekly Update</title>\n"
"<style type=\"text/css\">body{margin:0;padding:0} .btn{color:#fff;background:#06c}</style>\n"
"<!--[if mso]><xml><o:OfficeDocumentSettings></o:OfficeDocumentSettings></xml><![endif]-->\n"
"</head><body>\n"
"<div style=\"color:#fff\">Your weekly roundup&#847;&zwnj;&nbsp;&#8203;&#8203;&#xFEFF;</div>\n"
"<table role=\"presentation\" width=\"100%\"><tr><td align=\"center\">\n"
"<table width=\"600\"><tr><td><h1>Hi Brian,</h1></td></tr>\n"
"<tr><td><p>Here&rsquo;s what&#39;s new this week &mdash; 3 updates.</p></td></tr>\n"
"<tr><td><a href=\"https://example.com/post?id=42&amp;utm_source=newsletter&amp;utm_medium=email\" class=\"btn\"><span>Read the post</span></a></td></tr>\n"
"<tr><td><a href=\"https://click.example.com/ls/click?upn=" + std::string(400, 'x') + "\">View in browser</a></td></tr>\n"
"<tr><td><a href=\"mailto:help@example.com\">Contact support</a> | <a href=\"https://example.com/u\"><img src=\"logo.png\"></a></td></tr>\n"
"<tr><td>Price</td><td>&pound;10 &amp; &euro;12</td></tr>\n"
"<tr><td><p>Unsubscribe</p></td></tr>\n"
"<tr><td><p>Unsubscribe</p></td></tr>\n"
"</table></td></tr></table>\n"
"<script>track()</script>\n"
"</body></html>";
    return s;
}();

TEST_SUITE("htmlToText") {
    TEST_CASE("drops head, style, title, comments and script") {
        std::string text = html_to_text(NEWSLETTER);
        CHECK(text.find("Weekly Update") == std::string::npos);
        CHECK(text.find("margin:0") == std::string::npos);
        CHECK(text.find("OfficeDocument") == std::string::npos);
        CHECK(text.find("track()") == std::string::npos);
    }

    TEST_CASE("keeps links as text (url) without utm params") {
        std::string text = html_to_text(NEWSLETTER);
        CHECK(text.find("Read the post (https://example.com/post?id=42)") != std::string::npos);
    }

    TEST_CASE("drops long tracking URLs, mailto URLs and image-only links") {
        std::string text = html_to_text(NEWSLETTER);
        CHECK(text.find("View in browser") != std::string::npos);
        CHECK(text.find("click.example.com") == std::string::npos);
        CHECK(text.find("Contact support |") != std::string::npos);
        CHECK(text.find("mailto") == std::string::npos);
        CHECK(text.find("logo.png") == std::string::npos);
        CHECK(text.find("example.com/u") == std::string::npos);
    }

    TEST_CASE("decodes entities and strips zero-width characters") {
        std::string text = html_to_text(NEWSLETTER);
        CHECK(text.find("Here’s what's new this week — 3 updates.") != std::string::npos);
        CHECK(text.find("Price £10 & €12") != std::string::npos);
    }

    TEST_CASE("block tags become newlines, blank runs collapse, repeated paragraphs drop") {
        std::string text = html_to_text(NEWSLETTER);
        CHECK(text.starts_with("Your weekly roundup\n"));
        CHECK(text.find("\n\n\n") == std::string::npos);
        size_t count = 0;
        size_t pos = 0;
        while ((pos = text.find("Unsubscribe", pos)) != std::string::npos) {
            count++;
            pos += 11;
        }
        CHECK(count == 1);
        CHECK(text.find("Hi Brian,\n") != std::string::npos);
    }

    TEST_CASE("strips carriage returns and collapses spaces") {
        CHECK(html_to_text("<p>a\r\n   b</p>\r\n<p>c</p>") == "a\nb\n\nc");
    }

    TEST_CASE("leaves unknown entities and handles invalid code points") {
        CHECK(html_to_text("x &bogus; &#99999999; y") == "x &bogus; &#99999999; y");
    }

    TEST_CASE("strips utm when it is the first query param") {
        CHECK(html_to_text("<a href=\"https://ex.com/a?utm_source=x&amp;ref=1\">A</a>") == "A (https://ex.com/a?ref=1)");
    }

    TEST_CASE("drops elements hidden by inline style or the hidden attribute") {
        std::string hidden =
            "<div style=\"display:none\">IGNORE1</div><p>x</p>"
            "<span style=\"color:red; Display : NONE !important\">IGNORE2</span><p>x</p>"
            "<p style=\"visibility:hidden\">IGNORE3</p><p>x</p>"
            "<span style=\"font-size:0\">IGNORE4</span><p>x</p>"
            "<span style=\"font-size: 0px;line-height:0\">IGNORE5</span><p>x</p>"
            "<div style=\"width:0;overflow:hidden\">IGNORE6</div><p>x</p>"
            "<div style=\"max-height:0px\">IGNORE7</div><p>x</p>"
            "<div style=\"height:0\">IGNORE8</div><p>x</p>"
            "<span style=\"opacity:0\">IGNORE9</span><p>x</p>"
            "<span style=\"opacity:0.0\">IGNORE10</span><p>x</p>"
            "<div hidden>IGNORE11</div><p>x</p>"
            "<div hidden=\"hidden\">IGNORE12</div><p>x</p>"
            "<div style='display&#58;none'>IGNORE13</div><p>x</p>"
            "<div style=display:none>IGNORE14</div>";
        std::string out = html_to_text("<p>Visible</p>" + hidden + "<p>Also visible</p>");
        CHECK(out.find("IGNORE") == std::string::npos);
        CHECK(out.find("Visible") != std::string::npos);
        CHECK(out.find("Also visible") != std::string::npos);
    }

    TEST_CASE("hidden elements drop nested same-name children and keep what follows") {
        std::string out = html_to_text("<div>Before</div><div style=\"display:none\"><div>inner IGNORE</div>more IGNORE</div><div>After</div>");
        CHECK(out == "Before\nAfter");
    }

    TEST_CASE("hidden void and self-closing tags do not swallow content") {
        CHECK(html_to_text("<img style=\"display:none\" src=\"x\"><p>Kept</p><br hidden><p>Also</p>") == "Kept\n\nAlso");
    }

    TEST_CASE("keeps visible styles and attribute text that only mentions hidden") {
        std::string out = html_to_text("<div style=\"display:block;opacity:1;font-size:14px;line-height:0\">A</div><div class=\"hidden\" title=\"display:none\">B</div><div style=\"margin:0\">C</div>");
        CHECK(out.find("A\nB\nC") != std::string::npos);
    }

    TEST_CASE("an unclosed hidden element drops the rest of the document") {
        CHECK(html_to_text("<p>Kept</p><div style=\"display:none\">IGNORE <p>tail IGNORE") == "Kept");
    }
}

TEST_SUITE("gmail MIME walking") {
    const std::vector<GmailHeader> test_headers = {
        {"From", "Alice <alice@example.com>"},
        {"To", "brian@example.com"},
        {"CC", "bob@example.com"},
        {"Date", "Fri, 6 Nov 2026 10:00:00 -0600"},
        {"Subject", "Field trip"},
    };

    inline GmailRawMessage make_mixed_msg() {
        GmailRawMessage mixedMsg;
        mixedMsg.id = "m1";
        mixedMsg.threadId = "t1";
        mixedMsg.labelIds = std::vector<std::string>{"INBOX", "UNREAD"};
        mixedMsg.snippet = "Hi, See attached.";

        GmailPart p_plain;
        p_plain.mimeType = "text/plain";
        p_plain.headers = std::vector<GmailHeader>{{"Content-Type", "text/plain; charset=\"UTF-8\""}};
        p_plain.body = GmailBody{.data = encode_base64url("Hi,\r\n\r\n\r\n\r\nSee attached.\r\n"), .size = 20};

        GmailPart p_html;
        p_html.mimeType = "text/html";
        p_html.body = GmailBody{.data = encode_base64url("<p>Hi,</p><p>See <b>attached</b>.</p>")};

        GmailPart p_alt;
        p_alt.mimeType = "multipart/alternative";
        p_alt.parts = std::vector<GmailPart>{p_plain, p_html};

        GmailPart p_att;
        p_att.filename = "permission.pdf";
        p_att.mimeType = "application/pdf";
        p_att.body = GmailBody{.attachmentId = "ATT1", .size = 12345};

        GmailPart p_root;
        p_root.headers = test_headers;
        p_root.mimeType = "multipart/mixed";
        p_root.parts = std::vector<GmailPart>{p_alt, p_att};
        mixedMsg.payload = p_root;
        return mixedMsg;
    }

    TEST_CASE("prefers text/plain inside nested multiparts") {
        auto mixedMsg = make_mixed_msg();
        auto summary = summarize_message(mixedMsg, 1000);
        CHECK(summary.bodySource.get() == "text/plain");
        CHECK(summary.body.get() == "Hi,\n\nSee attached.");
    }

    TEST_CASE("extracts headers case-insensitively, labels and thread id") {
        auto mixedMsg = make_mixed_msg();
        auto s = summarize_message(mixedMsg, 1000);
        CHECK(s.from.get().value_or("") == "Alice <alice@example.com>");
        CHECK(s.cc.get().value_or("") == "bob@example.com");
        CHECK(s.subject.get().value_or("") == "Field trip");
        CHECK(s.labelIds.get() == std::vector<std::string>{"INBOX", "UNREAD"});
        CHECK(s.threadId.get() == "t1");
    }

    TEST_CASE("lists attachments with id, type and size") {
        auto mixedMsg = make_mixed_msg();
        auto atts = collect_attachments(mixedMsg.payload);
        CHECK(atts.size() == 1);
        CHECK(atts[0].attachmentId.get().value_or("") == "ATT1");
        CHECK(atts[0].filename.get() == "permission.pdf");
        CHECK(atts[0].mimeType.get() == "application/pdf");
        CHECK(atts[0].size.get() == 12345);
    }

    TEST_CASE("falls back to HTML converted to text") {
        GmailRawMessage htmlOnly;
        htmlOnly.id = "m2";
        htmlOnly.threadId = "t2";
        GmailPart p;
        p.headers = test_headers;
        p.mimeType = "text/html";
        p.body = GmailBody{.data = encode_base64url("<div>Hello&nbsp;there</div><div>Bye</div>")};
        htmlOnly.payload = p;

        auto s = summarize_message(htmlOnly, 1000);
        CHECK(s.bodySource.get() == "text/html");
        CHECK(s.body.get() == "Hello there\nBye");
        CHECK(s.labelIds.get().empty());
    }

    TEST_CASE("ignores text parts that are attachments") {
        GmailPart part;
        part.filename = "notes.txt";
        part.mimeType = "text/plain";
        part.body = GmailBody{.data = encode_base64url("notes")};

        GmailPart root;
        root.mimeType = "multipart/mixed";
        root.parts = std::vector<GmailPart>{part};

        CHECK(find_body_part(&root, "text/plain") == nullptr);
    }

    TEST_CASE("decodes declared non-UTF-8 charsets") {
        // "Caf\xe9" in Latin-1
        std::string latin1_bytes = "Caf\xe9";
        GmailRawMessage latin1;
        latin1.id = "m3";
        latin1.threadId = "t3";
        GmailPart p;
        p.mimeType = "text/plain";
        p.headers = std::vector<GmailHeader>{{"Content-Type", "text/plain; charset=ISO-8859-1"}};
        p.body = GmailBody{.data = encode_base64url(latin1_bytes)};
        latin1.payload = p;

        auto s = summarize_message(latin1, 100);
        CHECK(s.body.get() == "Café");
    }

    TEST_CASE("truncates long bodies and reports none when no text part") {
        GmailRawMessage longMsg;
        longMsg.id = "m4";
        longMsg.threadId = "t4";
        GmailPart p;
        p.mimeType = "text/plain";
        p.body = GmailBody{.data = encode_base64url(std::string(50, 'x'))};
        longMsg.payload = p;

        auto s = summarize_message(longMsg, 10);
        CHECK(s.bodyTruncated.get() == true);
        CHECK(s.body.get() == std::string(10, 'x') + "\n…[truncated]");

        GmailRawMessage emptyMsg;
        emptyMsg.id = "m5";
        emptyMsg.threadId = "t5";
        GmailPart emptyPart;
        emptyPart.mimeType = "multipart/mixed";
        emptyMsg.payload = emptyPart;

        auto sEmpty = summarize_message(emptyMsg, 10);
        CHECK(sEmpty.bodySource.get() == "none");
        CHECK(sEmpty.body.get() == "");
    }
}

TEST_SUITE("gws/client") {
    TEST_CASE("profile_args honors override and omits when empty") {
        CHECK(profile_args("example") == std::vector<std::string>{"--profile", "example"});
        CHECK(profile_args("ss") == std::vector<std::string>{"--profile", "ss"});
        CHECK(profile_args("").empty());
    }

    TEST_CASE("run_gws prepends profile flag and parses JSON") {
        MockGws gws;
        gws.reply = [](const auto&, const auto&) {
            return GwsRun{.exitCode = 0, .stderrStr = "", .stdoutStr = "{\"ok\":1}"};
        };
        auto res = run_gws(gws.runner(), {"drive", "about", "get"});
        CHECK(res["ok"].get<int64_t>() == 1);
        auto expected = profile_args();
        expected.insert(expected.end(), {"drive", "about", "get"});
        CHECK(gws.calls[0] == expected);
    }

    TEST_CASE("run_gws parses NDJSON pages") {
        MockGws gws;
        gws.reply = [](const auto&, const auto&) {
            return GwsRun{.exitCode = 0, .stderrStr = "", .stdoutStr = "{\"p\":1}\n{\"p\":2}\n"};
        };
        auto res = run_gws(gws.runner(), {"x"}, true);
        CHECK(res.is_array());
        auto arr = res.get<slimr::Json::array_t>();
        CHECK(arr.size() == 2);
        CHECK(arr[0]["p"].get<int64_t>() == 1);
        CHECK(arr[1]["p"].get<int64_t>() == 2);
    }

    TEST_CASE("run_gws returns {} for empty successful output") {
        MockGws gws;
        gws.reply = [](const auto&, const auto&) {
            return GwsRun{.exitCode = 0, .stderrStr = "", .stdoutStr = ""};
        };
        auto res = run_gws(gws.runner(), {"x"});
        CHECK(res.is_object());
        CHECK(res.empty());
    }

    TEST_CASE("run_gws surfaces gws JSON API errors") {
        MockGws gws;
        gws.reply = [](const auto&, const auto&) {
            return GwsRun{
                .exitCode = 1,
                .stderrStr = "Using keyring backend: keyring\nerror[api]: x",
                .stdoutStr = "{\"error\":{\"code\":400,\"message\":\"Invalid id value\",\"reason\":\"invalidArgument\"}}"
            };
        };
        CHECK_THROWS_AS(run_gws(gws.runner(), {"x"}), GwsError);
        try {
            run_gws(gws.runner(), {"x"});
        } catch (const GwsError& e) {
            CHECK(std::string(e.what()) == "gws error (400 invalidArgument): Invalid id value");
        }
    }

    TEST_CASE("run_gws falls back to stderr without keyring noise when killed") {
        MockGws gws;
        gws.reply = [](const auto&, const auto&) {
            return GwsRun{
                .exitCode = -1,
                .signal = "SIGABRT",
                .stderrStr = "Using keyring backend: keyring\nfatal runtime error: stack overflow",
                .stdoutStr = ""
            };
        };
        try {
            run_gws(gws.runner(), {"x"});
            CHECK(false);
        } catch (const GwsError& e) {
            std::string msg = e.what();
            CHECK(msg.find("gws failed (signal SIGABRT): fatal runtime error: stack overflow") != std::string::npos);
        }
    }

    TEST_CASE("cap_json passes small values through and truncates large values") {
        slimr::Json smallObj = slimr::Json::object_t{};
        smallObj["a"] = 1;
        auto resSmall = cap_json(smallObj, "hint");
        CHECK(resSmall["a"].get<int64_t>() == 1);

        slimr::Json bigObj = slimr::Json::object_t{};
        bigObj["big"] = std::string(500, 'x');
        auto resBig = cap_json(bigObj, "Use fields.", 100);
        CHECK(resBig.contains("truncated"));
        CHECK(resBig["truncated"].get<bool>() == true);
        CHECK(resBig["limitBytes"].get<int64_t>() == 100);
        CHECK(resBig["bytes"].get<int64_t>() > 100);
        std::string hint = resBig["hint"].get<std::string>();
        CHECK(hint.find("over the 100-byte limit. Use fields.") != std::string::npos);
        std::string preview = resBig["preview"].get<std::string>();
        CHECK(preview.starts_with("{\"big\":\"xxx"));
    }
}

TEST_SUITE("call command") {
    TEST_CASE("build_call_args builds service, resource path, method, params and body") {
        CallInput input;
        input.service = "tasks";
        input.resource = std::vector<std::string>{"tasks"};
        input.method = "insert";
        input.params = slimr::Json::object_t{{"tasklist", "@default"}};
        input.body = slimr::Json::object_t{{"title", "Buy milk"}};

        auto args = build_call_args(input);
        CHECK(args == std::vector<std::string>{
            "tasks", "tasks", "insert",
            "--params", "{\"tasklist\":\"@default\"}",
            "--json", "{\"title\":\"Buy milk\"}"
        });
    }

    TEST_CASE("build_call_args merges fields into params and omits empty params") {
        CallInput input;
        input.service = "people";
        input.resource = std::vector<std::string>{"people"};
        input.method = "get";
        input.params = slimr::Json::object_t{{"resourceName", "people/me"}};
        input.fields = "names,emailAddresses";

        auto args = build_call_args(input);
        CHECK(args.size() == 5);
        CHECK(args[0] == "people");
        CHECK(args[1] == "people");
        CHECK(args[2] == "get");
        CHECK(args[3] == "--params");
        CHECK(args[4].find("\"resourceName\":\"people/me\"") != std::string::npos);
        CHECK(args[4].find("\"fields\":\"names,emailAddresses\"") != std::string::npos);

        CallInput bare;
        bare.service = "calendar";
        bare.resource = std::vector<std::string>{"calendarList"};
        bare.method = "list";
        CHECK(build_call_args(bare) == std::vector<std::string>{"calendar", "calendarList", "list"});
    }

    TEST_CASE("build_call_args pageAll adds --page-all, page limit, and nextPageToken") {
        CallInput input;
        input.service = "people";
        input.resource = std::vector<std::string>{"people", "connections"};
        input.method = "list";
        input.params = slimr::Json::object_t{{"resourceName", "people/me"}};
        input.fields = "connections(names)";
        input.pageAll = true;
        input.pageLimit = 3;

        auto args = build_call_args(input);
        CHECK(args.size() == 9);
        CHECK(args[0] == "people");
        CHECK(args[1] == "people");
        CHECK(args[2] == "connections");
        CHECK(args[3] == "list");
        CHECK(args[4] == "--params");
        CHECK(args[5].find("\"resourceName\":\"people/me\"") != std::string::npos);
        CHECK(args[5].find("\"fields\":\"nextPageToken,connections(names)\"") != std::string::npos);
        CHECK(args[6] == "--page-all");
        CHECK(args[7] == "--page-limit");
        CHECK(args[8] == "3");
    }

    TEST_CASE("validation rejects flag-like segments and non-API services") {
        CallInput bad1;
        bad1.service = "drive";
        bad1.resource = std::vector<std::string>{"--upload"};
        bad1.method = "list";
        CHECK_THROWS(validate_call_input(bad1));

        CallInput bad2;
        bad2.service = "auth";
        bad2.resource = std::vector<std::string>{"x"};
        bad2.method = "export";
        CHECK_THROWS(validate_call_input(bad2));

        CallInput bad3;
        bad3.service = "gmail";
        bad3.resource = std::vector<std::string>{"users"};
        bad3.method = "+send";
        CHECK_THROWS(validate_call_input(bad3));
    }

    TEST_CASE("call command invokes gws with profile and returns parsed JSON") {
        MockGws gws;
        gws.reply = [](const auto&, const auto&) {
            return GwsRun{.exitCode = 0, .stderrStr = "", .stdoutStr = "{\"messages\":[{\"id\":\"a\"}]}"};
        };

        CallInput in;
        in.service = "gmail";
        in.resource = std::vector<std::string>{"users", "messages"};
        in.method = "list";
        in.params = slimr::Json::object_t{{"userId", "me"}};

        auto res = call(in, gws.runner());
        CHECK(res.contains("messages"));
        CHECK(gws.calls.size() == 1);
        auto expected = profile_args();
        expected.insert(expected.end(), {"gmail", "users", "messages", "list", "--params", "{\"userId\":\"me\"}"});
        CHECK(gws.calls[0] == expected);
    }

    TEST_CASE("call command wraps pageAll pages") {
        MockGws gws;
        gws.reply = [](const auto&, const auto&) {
            return GwsRun{.exitCode = 0, .stderrStr = "", .stdoutStr = "{\"items\":[1]}\n{\"items\":[2]}"};
        };

        CallInput in;
        in.service = "tasks";
        in.resource = std::vector<std::string>{"tasklists"};
        in.method = "list";
        in.pageAll = true;

        auto res = call(in, gws.runner());
        CHECK(res.contains("pages"));
        auto pages = res["pages"].get<slimr::Json::array_t>();
        CHECK(pages.size() == 2);
    }

    TEST_CASE("call command truncates oversized responses with fields hint") {
        MockGws gws;
        gws.reply = [](const auto&, const auto&) {
            slimr::Json big = slimr::Json::object_t{};
            slimr::Json::array_t arr;
            for (int i = 0; i < 3000; ++i) {
                arr.push_back(slimr::Json::object_t{{"id", "file-" + std::to_string(i)}, {"name", std::string(40, 'x')}});
            }
            big["files"] = arr;
            return GwsRun{.exitCode = 0, .stderrStr = "", .stdoutStr = slimr::write_json(big)};
        };

        CallInput in;
        in.service = "drive";
        in.resource = std::vector<std::string>{"files"};
        in.method = "list";

        auto res = call(in, gws.runner());
        CHECK(res.contains("truncated"));
        CHECK(res["truncated"].get<bool>() == true);
        CHECK(res["hint"].get<std::string>().find("fields") != std::string::npos);
    }

    TEST_CASE("blocked_method blocks every listed method") {
        auto b = [](std::string svc, std::vector<std::string> res, std::string m) {
            CallInput in;
            in.service = svc;
            in.resource = res;
            in.method = m;
            return blocked_method(in).has_value();
        };

        CHECK(b("gmail", {"users", "messages"}, "send"));
        CHECK(b("gmail", {"users", "drafts"}, "send"));
        CHECK(b("gmail", {"users", "settings", "filters"}, "create"));
        CHECK(b("gmail", {"users", "settings", "forwardingAddresses"}, "list"));
        CHECK(b("gmail", {"users", "settings", "delegates"}, "create"));
        CHECK(b("gmail", {"users", "settings"}, "updateAutoForwarding"));
        CHECK(b("drive", {"permissions"}, "create"));
        CHECK(b("drive", {"permissions"}, "update"));
        CHECK(b("drive", {"files"}, "delete"));
        CHECK(b("calendar", {"acl"}, "insert"));
        CHECK(b("script", {"scripts"}, "run"));

        // Normalized matching and shifted segments
        CHECK(b("gmail", {"Users", "Messages"}, "SEND"));
        CHECK(b("gmail", {"users", "settings", "forwarding-addresses"}, "get"));
        CHECK(b("gmail", {"users", "settings", "forwarding_addresses"}, "get"));
        CHECK(b("gmail", {"users", "messages", "send"}, "get"));

        // Allowed operations
        CHECK(!b("gmail", {"users", "messages"}, "list"));
        CHECK(!b("gmail", {"users", "drafts"}, "create"));
        CHECK(!b("gmail", {"users", "settings"}, "getAutoForwarding"));
        CHECK(!b("drive", {"permissions"}, "list"));
        CHECK(!b("drive", {"files"}, "list"));
        CHECK(!b("calendar", {"events"}, "insert"));
        CHECK(!b("tasks", {"tasks"}, "delete"));

        // Wildcard rule needs a segment below it
        CHECK(!b("calendar", {"x"}, "acl"));
    }

    TEST_CASE("call blocklist refuses a blocked method without invoking gws") {
        MockGws gws;
        CallInput in;
        in.service = "gmail";
        in.resource = std::vector<std::string>{"users", "messages"};
        in.method = "send";
        in.params = slimr::Json::object_t{{"userId", "me"}};

        CHECK_THROWS_AS(call(in, gws.runner()), std::runtime_error);
        try {
            call(in, gws.runner());
        } catch (const std::exception& e) {
            std::string msg = e.what();
            CHECK(msg.find("Blocked: gmail.users.messages.send") != std::string::npos);
            CHECK(msg.find("gdocsmith") != std::string::npos);
            CHECK(msg.find("ask the user") != std::string::npos);
        }
        CHECK(gws.calls.empty());
    }
}

TEST_SUITE("drive-upload command") {
    TEST_CASE("resolve_upload_path and upload path checks") {
        auto base = fs::temp_directory_path() / ("test_gws_up_" + std::to_string(rand()));
        fs::create_directories(base / "home/.ssh");
        fs::create_directories(base / "home/.config/x");
        fs::create_directories(base / "home/Library/Caches");
        fs::create_directories(base / "home/Documents");
        fs::create_directories(base / "home/visible/.hidden");
        fs::create_directories(base / "tmp");

        std::string home = (base / "home").string();
        std::string tmp = (base / "tmp").string();

        std::string doc = (base / "home/Documents/a.txt").string();
        std::string scratch = (base / "tmp/a.txt").string();
        std::string key = (base / "home/.ssh/id_rsa").string();
        std::string config = (base / "home/.config/x/a.txt").string();
        std::string hidden = (base / "home/visible/.hidden/a.txt").string();
        std::string lib = (base / "home/Library/Caches/a.txt").string();
        std::string outside = (base / "outside.txt").string();

        { std::ofstream(doc) << "x"; }
        { std::ofstream(scratch) << "x"; }
        { std::ofstream(key) << "x"; }
        { std::ofstream(config) << "x"; }
        { std::ofstream(hidden) << "x"; }
        { std::ofstream(lib) << "x"; }
        { std::ofstream(outside) << "x"; }

        fs::create_symlink(key, base / "home/Documents/link");
        fs::create_symlink(doc, base / "home/.dotfile-link");

        auto resolve_in = [&](const std::string& f) {
            return resolve_upload_path(f, home, {tmp});
        };

        CHECK(resolve_in(doc).ends_with("Documents/a.txt"));
        CHECK(resolve_in(scratch).ends_with("tmp/a.txt"));

        auto check_err = [&](const std::string& f, std::string_view match_msg) {
            try {
                resolve_in(f);
                CHECK(false);
            } catch (const std::exception& e) {
                CHECK(std::string(e.what()).find(match_msg) != std::string::npos);
            }
        };

        check_err(key, "hidden");
        check_err(config, "hidden");
        check_err(hidden, "hidden");
        check_err(lib, "Library");
        check_err(outside, "under $HOME");
        check_err((base / "home/Documents/link").string(), "hidden");
        check_err((base / "home/.dotfile-link").string(), "hidden");
        check_err((base / "home/Documents").string(), "regular file");
        check_err((base / "home/Documents/nope").string(), "not found");

        fs::remove_all(base);
    }

    TEST_CASE("drive-upload refuses sensitive file before calling gws") {
        MockGws gws;
        DriveUploadInput in;
        in.file = "/etc/hosts";
        CHECK_THROWS(drive_upload(in, gws.runner()));
        CHECK(gws.calls.empty());
    }

    TEST_CASE("ensure_folder_path reuses existing folders and creates missing ones") {
        MockGws gws;
        gws.reply = [](const auto& args, const auto&) {
            const auto offset = !args.empty() && args.front() == "--profile" ? 4u : 2u;
            std::string op = args.size() > offset ? args[offset] : "";
            if (op == "list") {
                std::string full;
                for (const auto& a : args) full += a + " ";
                if (full.find("'Backups'") != std::string::npos) {
                    return GwsRun{.exitCode = 0, .stderrStr = "", .stdoutStr = "{\"files\":[{\"id\":\"f1\"}]}"};
                }
                return GwsRun{.exitCode = 0, .stderrStr = "", .stdoutStr = "{\"files\":[]}"};
            }
            return GwsRun{.exitCode = 0, .stderrStr = "", .stdoutStr = "{\"id\":\"f2\"}"};
        };

        std::string folderId = ensure_folder_path(gws.runner(), "Backups/personal-log");
        CHECK(folderId == "f2");
        CHECK(gws.calls.size() == 3);
        std::string call1Str;
        for (const auto& a : gws.calls[1]) call1Str += a + " ";
        CHECK(call1Str.find("'personal-log' and 'f1' in parents") != std::string::npos);
        std::string call2Str;
        for (const auto& a : gws.calls[2]) call2Str += a + " ";
        CHECK(call2Str.find("\"parents\":[\"f1\"]") != std::string::npos);

        // Empty path is root
        CHECK(ensure_folder_path(gws.runner(), "") == "root");
    }
}

TEST_SUITE("gmail-attachment command") {
    TEST_CASE("fetch_attachment decodes base64url data and fails when empty") {
        MockGws gws;
        gws.reply = [](const auto&, const auto&) {
            return GwsRun{
                .exitCode = 0,
                .stderrStr = "",
                .stdoutStr = "{\"data\":\"" + encode_base64url("%PDF-1.4 hello?>") + "\"}"
            };
        };
        CHECK(fetch_attachment(gws.runner(), "m1", "a1") == "%PDF-1.4 hello?>");
        std::string call0;
        for (const auto& a : gws.calls[0]) call0 += a + " ";
        CHECK(call0.find("attachments get --params {\"userId\":\"me\",\"messageId\":\"m1\",\"id\":\"a1\"}") != std::string::npos);

        MockGws emptyGws;
        emptyGws.reply = [](const auto&, const auto&) {
            return GwsRun{.exitCode = 0, .stderrStr = "", .stdoutStr = "{}"};
        };
        CHECK_THROWS_WITH(fetch_attachment(emptyGws.runner(), "m1", "a1"), "Gmail returned no attachment data.");
    }

    TEST_CASE("sanitize_filename behaviors") {
        CHECK(sanitize_filename("Report 2026-01.pdf") == "Report 2026-01.pdf");
        CHECK(sanitize_filename("../../etc/passwd") == "passwd");
        CHECK(sanitize_filename("..\\..\\evil.exe") == "evil.exe");
        CHECK(sanitize_filename("a..b/../c..d.txt") == "c.d.txt");
        CHECK(sanitize_filename(".bashrc") == "bashrc");
        CHECK(sanitize_filename("...") == "attachment");
        std::string null_in = "a<b>:c|d";
        null_in.push_back('\0');
        null_in += "e\xe2\x80\xae" "gpj.exe";
        CHECK(sanitize_filename(null_in) == "a_b__c_d_e_gpj.exe");
        CHECK(sanitize_filename("") == "attachment");
        CHECK(sanitize_filename("/") == "attachment");
        std::string long_name = std::string(300, 'a') + ".pdf";
        auto res = sanitize_filename(long_name);
        CHECK(res.size() == 100);
        CHECK(res.ends_with(".pdf"));
    }

    TEST_CASE("assert_message_id accepts alphanumeric and refuses others") {
        CHECK_NOTHROW(assert_message_id("19a1b6731c6fdd2af"));
        for (const auto& bad : {"", "../x", "a/b", "a b", "a.b", "a-b"}) {
            CHECK_THROWS(assert_message_id(bad));
        }
    }

    TEST_CASE("save_attachment writes under <root>/<messageId>/ and never overwrites") {
        auto root = fs::temp_directory_path() / ("test_attach_" + std::to_string(rand()));
        std::string first = save_attachment("one", "m1", "doc.txt", root.string());
        std::string second = save_attachment("two", "m1", "doc.txt", root.string());
        std::string third = save_attachment("three", "m1", "doc.txt", root.string());

        CHECK(first == (root / "m1/doc.txt").string());
        CHECK(second == (root / "m1/doc-1.txt").string());
        CHECK(third == (root / "m1/doc-2.txt").string());

        std::string read1, read2;
        { std::ifstream(first) >> read1; }
        { std::ifstream(second) >> read2; }
        CHECK(read1 == "one");
        CHECK(read2 == "two");

        // Traversal stays inside message folder
        std::string path = save_attachment("x", "m2", "../../../escape.txt", root.string());
        CHECK(path == (root / "m2/escape.txt").string());

        // Refuses bad message id
        CHECK_THROWS(save_attachment("x", "../m3", "a.txt", root.string()));

        fs::remove_all(root);
    }

    TEST_CASE("gmail-attachment refuses bad message id before calling gws") {
        MockGws gws;
        GmailAttachmentInput in;
        in.messageId = "../evil";
        in.attachmentId = "a1";
        CHECK_THROWS(gmail_attachment(in, gws.runner()));
        CHECK(gws.calls.empty());
    }
}

TEST_SUITE("gmail-message & gmail-thread commands") {
    auto make_msg = [](std::string id, std::string text) {
        slimr::Json j = slimr::Json::object_t{};
        j["id"] = id;
        j["threadId"] = "t1";
        j["labelIds"] = slimr::Json::array_t{"INBOX"};
        slimr::Json payload = slimr::Json::object_t{};
        payload["mimeType"] = "text/plain";
        payload["body"]["data"] = encode_base64url(text);
        payload["headers"] = slimr::Json::array_t{
            slimr::Json::object_t{{"name", "Subject"}, {"value", "S " + id}}
        };
        j["payload"] = payload;
        return j;
    };

    TEST_CASE("gmail-message fetches format=full and returns readable summary") {
        MockGws gws;
        gws.reply = [&](const auto&, const auto&) {
            return GwsRun{.exitCode = 0, .stderrStr = "", .stdoutStr = slimr::write_json(make_msg("m1", "Hello"))};
        };

        GmailMessageInput in;
        in.id = "m1";
        auto res = gmail_message(in, gws.runner());
        CHECK(res.body.get() == "Hello");
        CHECK(res.subject.get().value_or("") == "S m1");

        auto expected = profile_args();
        expected.insert(expected.end(), {"gmail", "users", "messages", "get", "--params", "{\"format\":\"full\",\"id\":\"m1\",\"userId\":\"me\"}"});
        CHECK(gws.calls[0] == expected);
    }

    TEST_CASE("gmail-thread summarizes every message in the thread") {
        MockGws gws;
        gws.reply = [&](const auto&, const auto&) {
            slimr::Json th = slimr::Json::object_t{};
            th["id"] = "t1";
            th["messages"] = slimr::Json::array_t{make_msg("m1", "one"), make_msg("m2", "two")};
            return GwsRun{.exitCode = 0, .stderrStr = "", .stdoutStr = slimr::write_json(th)};
        };

        GmailThreadInput in;
        in.id = "t1";
        auto res = gmail_thread(in, gws.runner());
        CHECK(res.threadId.get() == "t1");
        CHECK(res.messages.get().size() == 2);
        CHECK(res.messages.get()[0].body.get() == "one");
        CHECK(res.messages.get()[1].body.get() == "two");
    }
}

TEST_SUITE("schema command") {
    TEST_CASE("runs gws schema with optional --resolve-refs") {
        MockGws gws;
        gws.reply = [](const auto&, const auto&) {
            return GwsRun{.exitCode = 0, .stderrStr = "", .stdoutStr = "{\"httpMethod\":\"GET\"}"};
        };

        SchemaInput in1;
        in1.method = "tasks.tasks.list";
        auto res1 = schema(in1, gws.runner());
        CHECK(res1["httpMethod"].get<std::string>() == "GET");

        SchemaInput in2;
        in2.method = "tasks.tasks.list";
        in2.resolveRefs = true;
        auto res2 = schema(in2, gws.runner());
        CHECK(res2["httpMethod"].get<std::string>() == "GET");

        auto p = profile_args();
        auto call0 = p; call0.insert(call0.end(), {"schema", "tasks.tasks.list"});
        auto call1 = p; call1.insert(call1.end(), {"schema", "tasks.tasks.list", "--resolve-refs"});
        CHECK(gws.calls[0] == call0);
        CHECK(gws.calls[1] == call1);
    }

    TEST_CASE("rejects malformed method ids without calling gws") {
        MockGws gws;
        SchemaInput in;
        in.method = "--help";
        CHECK_THROWS(schema(in, gws.runner()));
        CHECK(gws.calls.empty());
    }

    TEST_CASE("hints to drop resolve-refs when gws crashes on recursive schemas") {
        MockGws gws;
        gws.reply = [](const auto&, const auto&) {
            return GwsRun{.exitCode = -1, .signal = "SIGABRT", .stderrStr = "stack overflow", .stdoutStr = ""};
        };

        SchemaInput in;
        in.method = "gmail.users.messages.get";
        in.resolveRefs = true;
        try {
            schema(in, gws.runner());
            CHECK(false);
        } catch (const GwsError& e) {
            CHECK(std::string(e.what()).find("retry without it") != std::string::npos);
        }
    }
}

TEST_SUITE("status command") {
    TEST_CASE("returns version and profile") {
        auto res = status({});
        CHECK(res.version.get() == "2.0.0");
        const auto expected = profile_args();
        CHECK(res.profile.get() == (expected.empty() ? "" : expected.back()));
    }
}

TEST_SUITE("PluginApp integration & MCP dispatch") {
    TEST_CASE("make_google_gws_app registers all 7 tools") {
        MockGws gws;
        auto app = make_google_gws_app(gws.runner());
        CHECK(app.key == "gws-mcp");
        CHECK(app.version == "2.0.0");
        CHECK(!app.instructions.empty());
        CHECK(app.bugsink() != nullptr);

        const auto& tools = app.tools();
        CHECK(tools.contains("call"));
        CHECK(tools.contains("schema"));
        CHECK(tools.contains("gmail-message"));
        CHECK(tools.contains("gmail-thread"));
        CHECK(tools.contains("gmail-attachment"));
        CHECK(tools.contains("drive-upload"));
        CHECK(tools.contains("status"));
    }

    TEST_CASE("MCP initialize, tools/list, and tools/call dispatch") {
        MockGws gws;
        gws.reply = [](const auto&, const auto&) {
            return GwsRun{.exitCode = 0, .stderrStr = "", .stdoutStr = "{\"profile\":\"bdombro\",\"version\":\"1.0.5\"}"};
        };
        auto app = make_google_gws_app(gws.runner());

        // initialize
        slimr::Json initReq = slimr::Json::object_t{};
        initReq["jsonrpc"] = "2.0";
        initReq["id"] = 1;
        initReq["method"] = "initialize";
        initReq["params"]["protocolVersion"] = "2025-11-25";
        auto initResp = app.dispatchMcpJson(initReq);
        CHECK(initResp["result"]["protocolVersion"].get<std::string>() == "2025-11-25");
        CHECK(initResp["result"]["serverInfo"]["name"].get<std::string>() == "gws-mcp");

        // tools/list
        slimr::Json listReq = slimr::Json::object_t{};
        listReq["jsonrpc"] = "2.0";
        listReq["id"] = 2;
        listReq["method"] = "tools/list";
        auto listResp = app.dispatchMcpJson(listReq);
        auto toolList = listResp["result"]["tools"].get<slimr::Json::array_t>();
        CHECK(toolList.size() == 7);

        // tools/call status
        slimr::Json callReq = slimr::Json::object_t{};
        callReq["jsonrpc"] = "2.0";
        callReq["id"] = 3;
        callReq["method"] = "tools/call";
        callReq["params"]["name"] = "status";
        callReq["params"]["arguments"] = slimr::Json::object_t{};
        auto callResp = app.dispatchMcpJson(callReq);
        CHECK(callResp["result"]["isError"].get<bool>() == false);
        auto contents = callResp["result"]["content"].get<slimr::Json::array_t>();
        CHECK(contents.size() == 1);
        CHECK(contents[0]["text"].get<std::string>().find("\"version\":\"2.0.0\"") != std::string::npos);
    }
}
