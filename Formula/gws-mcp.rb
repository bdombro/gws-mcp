class GwsMcp < Formula
  desc "Google Workspace MCP server and CLI wrapping the gws CLI"
  homepage "https://github.com/bdombro/gws-mcp"
  version "2.2.1"

  on_macos do
    url "https://github.com/bdombro/gws-mcp/releases/download/v2.2.1/gws-mcp-arm64-macos.tar.gz"
    sha256 "69ac24ca614eed7640c4574b854e65ba39f2ce406c4c2723e6f51fde8db65ee7"
  end

  on_linux do
    url "https://github.com/bdombro/gws-mcp/releases/download/v2.2.1/gws-mcp-x64-linux.tar.gz"
    sha256 "0a7ff365b79abf1f201db901c02634f77b6bc500d22ddae1b74d6928389f4096"
  end

  def install
    bin.install "gws-mcp"
    chmod 0755, bin/"gws-mcp"
    pkgshare.install "docs" if File.directory?("docs")
  end

  def post_install
    (var/"gws-mcp").mkpath
    chmod 0700, var/"gws-mcp"
    (var/"log").mkpath
  end

  service do
    run ["/bin/sh", "-c", "[ -f #{etc}/gws-mcp/env ] && set -a && . #{etc}/gws-mcp/env; exec #{opt_bin}/gws-mcp http --log-file #{var}/log/gws-mcp.log"]
    keep_alive true
    working_dir var/"gws-mcp"
    log_path var/"log/gws-mcp.log"
    error_log_path var/"log/gws-mcp.log"
    environment_variables PATH: "#{HOMEBREW_PREFIX}/bin:/usr/bin:/bin"
  end

  test do
    require "net/http"
    assert_match version.to_s, shell_output("#{bin}/gws-mcp --version")
    r, w = IO.pipe
    pid = spawn("#{bin}/gws-mcp", "--skip-checks", "http", "--host", "127.0.0.1", "--port", "0", err: w)
    w.close
    begin
      port = nil
      r.each_line { |line| break if (port = line[%r{listening on http://[\d.]+:(\d+)/mcp}, 1]) }
      assert port, "server did not report a listening port"
      discover = '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}'
      res = Net::HTTP.post(URI("http://127.0.0.1:#{port}/mcp"), discover,
                           "Content-Type"         => "application/json",
                           "Accept"               => "application/json, text/event-stream",
                           "MCP-Protocol-Version" => "2026-07-28",
                           "Mcp-Method"           => "server/discover")
      assert_match "gws-mcp", res.body
    ensure
      Process.kill("TERM", pid)
      Process.wait(pid)
    end
  end
end
