class GwsMcp < Formula
  desc "Google Workspace MCP server and CLI wrapping the gws CLI"
  homepage "https://github.com/bdombro/gws-mcp"
  url "https://github.com/bdombro/gws-mcp/releases/download/v2.0.0/gws-mcp-arm64-macos.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  version "2.0.0"

  def install
    bin.install "gws-mcp"
    chmod 0755, bin/"gws-mcp"
  end

  def post_install
    (var/"gws-mcp").mkpath
    (var/"log").mkpath
  end

  service do
    run [opt_bin/"gws-mcp", "http", "--host", "127.0.0.1", "--port", "8086"]
    keep_alive true
    working_dir var/"gws-mcp"
    log_path var/"log/gws-mcp.log"
    error_log_path var/"log/gws-mcp.log"
    environment_variables PATH: "#{HOMEBREW_PREFIX}/bin:/usr/bin:/bin"
  end

  test do
    out = shell_output("#{bin}/gws-mcp status")
    assert_match version.to_s, out
  end
end
