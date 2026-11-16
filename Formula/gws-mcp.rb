class GwsMcp < Formula
  desc "Google Workspace MCP server and CLI wrapping the gws CLI"
  homepage "https://github.com/bdombro/gws-mcp"
  version "2.1.0"

  on_macos do
    url "https://github.com/bdombro/gws-mcp/releases/download/v2.1.0/gws-mcp-arm64-macos.tar.gz"
    sha256 "6c7c5e91f241d0fb57f4a2382b2a2b6459ac3db12620df1f3238c9811af3167f"
  end

  on_linux do
    url "https://github.com/bdombro/gws-mcp/releases/download/v2.1.0/gws-mcp-x64-linux.tar.gz"
    sha256 "943bdc9227821335638e97de46e3a76ad98ccb482b2feb432a5b1383752414ae"
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
    assert_match version.to_s, shell_output("#{bin}/gws-mcp --version")
    discover = '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}'
    out = pipe_output("#{bin}/gws-mcp mcp --skip-checks", "#{discover}\n")
    assert_match "gws-mcp", out
  end
end
