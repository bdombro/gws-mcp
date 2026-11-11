#pragma once

#include "json.hpp"

#include <cstdlib>
#include <cstring>
#include <functional>
#include <optional>
#include <poll.h>
#include <spawn.h>
#include <sstream>
#include <stdexcept>
#include <string>
#include <sys/wait.h>
#include <unistd.h>
#include <vector>

extern char** environ;

namespace gws {

class GwsError : public std::runtime_error {
public:
    using std::runtime_error::runtime_error;
};

struct GwsRun {
    int exitCode = 0;
    std::optional<std::string> signal;
    std::string stderrStr;
    std::string stdoutStr;
};

using GwsRunner = std::function<GwsRun(const std::vector<std::string>& args, const std::string& cwd)>;

constexpr size_t MAX_RESULT_BYTES = 100'000;

inline slimr::Json cap_json(const slimr::Json& value, std::string_view hint, size_t limitBytes = MAX_RESULT_BYTES) {
    std::string text = slimr::write_json(value);
    size_t bytes = text.size();
    if (bytes <= limitBytes) {
        return value;
    }
    slimr::Json truncated = slimr::Json::object_t{};
    truncated["bytes"] = static_cast<int64_t>(bytes);
    truncated["hint"] = "Result was " + std::to_string(bytes) + " bytes, over the " +
                        std::to_string(limitBytes) + "-byte limit. " + std::string(hint);
    truncated["limitBytes"] = static_cast<int64_t>(limitBytes);
    truncated["preview"] = text.substr(0, 2000);
    truncated["truncated"] = true;
    return truncated;
}

inline std::vector<std::string> profile_args(std::optional<std::string> profile = std::nullopt) {
    std::string resolved;
    if (profile.has_value()) {
        resolved = *profile;
    } else {
        const char* env_p = getenv("GWS_PROFILE");
        resolved = env_p ? std::string(env_p) : "";
    }
    if (resolved.empty()) {
        return {};
    }
    return {"--profile", resolved};
}

inline std::string describe_failure(const GwsRun& run, const std::string& stdoutStr) {
    try {
        auto parsed = slimr::parse_json<slimr::Json>(stdoutStr);
        if (parsed && parsed->is_object() && parsed->contains("error") && (*parsed)["error"].is_object()) {
            const auto& errObj = (*parsed)["error"];
            if (errObj.contains("message") && errObj["message"].is_string()) {
                std::string msg = errObj["message"].get<std::string>();
                std::string tag;
                if (errObj.contains("code")) {
                    if (errObj["code"].is_number()) {
                        tag += std::to_string(errObj["code"].get<int64_t>());
                    } else if (errObj["code"].is_string()) {
                        tag += errObj["code"].get<std::string>();
                    }
                }
                if (errObj.contains("reason") && errObj["reason"].is_string()) {
                    if (!tag.empty()) tag += " ";
                    tag += errObj["reason"].get<std::string>();
                }
                while (!msg.empty() && (msg.back() == '\r' || msg.back() == '\n' || msg.back() == ' ')) msg.pop_back();
                return "gws error" + (tag.empty() ? "" : " (" + tag + ")") + ": " + msg;
            }
        }
    } catch (...) {
        // Fall through to stderr
    }

    std::vector<std::string> cleanLines;
    std::stringstream ss(run.stderrStr);
    std::string line;
    while (std::getline(ss, line)) {
        while (!line.empty() && (line.back() == '\r' || line.back() == ' ')) line.pop_back();
        if (line.empty()) continue;
        if (line.starts_with("Using keyring backend")) continue;
        cleanLines.push_back(line);
    }

    std::string cleaned;
    for (size_t i = 0; i < cleanLines.size(); ++i) {
        if (i > 0) cleaned += "\n";
        cleaned += cleanLines[i];
    }
    while (!cleaned.empty() && (cleaned.back() == '\r' || cleaned.back() == '\n' || cleaned.back() == ' ')) cleaned.pop_back();

    std::string status = run.signal.has_value() ? ("signal " + *run.signal) : ("exit " + std::to_string(run.exitCode));
    std::string out = "gws failed (" + status + ")";
    if (!cleaned.empty()) {
        out += ": " + (cleaned.size() > 2000 ? cleaned.substr(0, 2000) : cleaned);
    }
    return out;
}

inline GwsRun exec_gws(const std::vector<std::string>& args, const std::string& cwd = "") {
    const char* bin_env = getenv("GWS_BIN");
    std::string bin = (bin_env && *bin_env) ? bin_env : "gws";

    int stdout_pipe[2];
    int stderr_pipe[2];
    if (pipe(stdout_pipe) != 0 || pipe(stderr_pipe) != 0) {
        throw GwsError("pipe failed: " + std::string(strerror(errno)));
    }

    posix_spawn_file_actions_t actions;
    posix_spawn_file_actions_init(&actions);
    posix_spawn_file_actions_addclose(&actions, stdout_pipe[0]);
    posix_spawn_file_actions_adddup2(&actions, stdout_pipe[1], STDOUT_FILENO);
    posix_spawn_file_actions_addclose(&actions, stdout_pipe[1]);

    posix_spawn_file_actions_addclose(&actions, stderr_pipe[0]);
    posix_spawn_file_actions_adddup2(&actions, stderr_pipe[1], STDERR_FILENO);
    posix_spawn_file_actions_addclose(&actions, stderr_pipe[1]);

    if (!cwd.empty()) {
#if defined(__linux__)
        posix_spawn_file_actions_addchdir_np(&actions, cwd.c_str());
#else
        posix_spawn_file_actions_addchdir(&actions, cwd.c_str());
#endif
    }

    std::vector<char*> argv_ptrs;
    argv_ptrs.push_back(const_cast<char*>(bin.c_str()));
    for (const auto& a : args) {
        argv_ptrs.push_back(const_cast<char*>(a.c_str()));
    }
    argv_ptrs.push_back(nullptr);

    pid_t pid;
    int spawn_ret = posix_spawnp(&pid, bin.c_str(), &actions, nullptr, argv_ptrs.data(), environ);
    posix_spawn_file_actions_destroy(&actions);

    close(stdout_pipe[1]);
    close(stderr_pipe[1]);

    if (spawn_ret != 0) {
        close(stdout_pipe[0]);
        close(stderr_pipe[0]);
        std::string hint = (spawn_ret == ENOENT) ? (" (is " + bin + " installed and on PATH? set GWS_BIN to override)") : "";
        throw GwsError("Could not run " + bin + ": " + strerror(spawn_ret) + hint);
    }

    std::string stdout_str;
    std::string stderr_str;
    struct pollfd fds[2];
    fds[0].fd = stdout_pipe[0];
    fds[0].events = POLLIN;
    fds[1].fd = stderr_pipe[0];
    fds[1].events = POLLIN;

    char buf[16384];
    int open_fds = 2;
    while (open_fds > 0) {
        int poll_res = poll(fds, 2, -1);
        if (poll_res < 0) {
            if (errno == EINTR) continue;
            break;
        }
        for (int i = 0; i < 2; ++i) {
            if (fds[i].fd >= 0 && (fds[i].revents & (POLLIN | POLLHUP | POLLERR))) {
                ssize_t n = read(fds[i].fd, buf, sizeof(buf));
                if (n > 0) {
                    if (i == 0) stdout_str.append(buf, n);
                    else stderr_str.append(buf, n);
                } else {
                    close(fds[i].fd);
                    fds[i].fd = -1;
                    open_fds--;
                }
            }
        }
    }

    int status = 0;
    waitpid(pid, &status, 0);

    GwsRun result;
    if (WIFEXITED(status)) {
        result.exitCode = WEXITSTATUS(status);
    } else if (WIFSIGNALED(status)) {
        result.exitCode = -1;
        int sig = WTERMSIG(status);
        const char* sigName = strsignal(sig);
        if (sigName) {
            result.signal = sigName;
        } else {
            result.signal = "SIG" + std::to_string(sig);
        }
    }

    result.stdoutStr = std::move(stdout_str);
    result.stderrStr = std::move(stderr_str);
    return result;
}

inline slimr::Json run_gws(
    GwsRunner runner,
    const std::vector<std::string>& args,
    bool ndjson = false,
    const std::string& cwd = ""
) {
    std::vector<std::string> full_args = profile_args();
    full_args.insert(full_args.end(), args.begin(), args.end());

    GwsRun run = runner(full_args, cwd);

    std::string stdoutTrimmed = run.stdoutStr;
    while (!stdoutTrimmed.empty() && (stdoutTrimmed.front() == ' ' || stdoutTrimmed.front() == '\t' || stdoutTrimmed.front() == '\r' || stdoutTrimmed.front() == '\n')) {
        stdoutTrimmed.erase(stdoutTrimmed.begin());
    }
    while (!stdoutTrimmed.empty() && (stdoutTrimmed.back() == ' ' || stdoutTrimmed.back() == '\t' || stdoutTrimmed.back() == '\r' || stdoutTrimmed.back() == '\n')) {
        stdoutTrimmed.pop_back();
    }

    if (run.exitCode != 0 || run.signal.has_value()) {
        throw GwsError(describe_failure(run, stdoutTrimmed));
    }

    if (stdoutTrimmed.empty()) {
        return slimr::Json::object_t{};
    }

    try {
        if (ndjson) {
            slimr::Json::array_t pages;
            std::stringstream ss(stdoutTrimmed);
            std::string line;
            while (std::getline(ss, line)) {
                while (!line.empty() && (line.front() == ' ' || line.front() == '\t' || line.front() == '\r')) line.erase(line.begin());
                while (!line.empty() && (line.back() == ' ' || line.back() == '\t' || line.back() == '\r')) line.pop_back();
                if (line.empty()) continue;
                auto page = slimr::parse_json<slimr::Json>(line);
                if (!page) {
                    throw GwsError("gws printed non-JSON output: " + (stdoutTrimmed.size() > 500 ? stdoutTrimmed.substr(0, 500) : stdoutTrimmed));
                }
                pages.push_back(*page);
            }
            return pages;
        }

        auto parsed = slimr::parse_json<slimr::Json>(stdoutTrimmed);
        if (!parsed) {
            throw GwsError("gws printed non-JSON output: " + (stdoutTrimmed.size() > 500 ? stdoutTrimmed.substr(0, 500) : stdoutTrimmed));
        }
        return *parsed;
    } catch (const GwsError&) {
        throw;
    } catch (...) {
        throw GwsError("gws printed non-JSON output: " + (stdoutTrimmed.size() > 500 ? stdoutTrimmed.substr(0, 500) : stdoutTrimmed));
    }
}

} // namespace gws
