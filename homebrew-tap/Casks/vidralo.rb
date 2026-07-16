require "json"

class GitHubPrivateRepositoryReleaseDownloadStrategy < CurlDownloadStrategy
  def initialize(url, name, version, **specs)
    super
    parse_url_pattern
    set_github_token
  end

  def parse_url_pattern
    url_pattern = %r{https://github.com/([^/]+)/([^/]+)/releases/download/([^/]+)/([^/]+)}
    if (match = @url.match(url_pattern))
      @owner = match[1]
      @repo = match[2]
      @tag = match[3]
      @filename = match[4]
    else
      raise "Invalid GitHub Release URL: #{@url}"
    end
  end

  def set_github_token
    @github_token = ENV["HOMEBREW_GITHUB_API_TOKEN"] || ENV["GITHUB_TOKEN"]
    unless @github_token
      raise "GitHub token is required to download from private release. Set HOMEBREW_GITHUB_API_TOKEN."
    end
  end

  def fetch
    release_url = "https://api.github.com/repos/#{@owner}/#{@repo}/releases/tags/#{@tag}"
    headers = ["Authorization: token #{@github_token}"]
    
    curl_output = Utils.popen_read("curl", "-s", "-H", headers[0], release_url)
    release_json = JSON.parse(curl_output) rescue nil
    raise "Failed to parse release metadata from #{release_url}" unless release_json
    
    asset = release_json["assets"].find { |a| a["name"] == @filename }
    raise "Asset #{@filename} not found in release #{@tag}" unless asset
    
    @url = "https://api.github.com/repos/#{@owner}/#{@repo}/releases/assets/#{asset["id"]}"
    @meta[:headers] = ["Accept: application/octet-stream", "Authorization: token #{@github_token}"]
    
    super
  end
end

cask "vidralo" do
  version "0.1.0"

  on_arm do
    url "https://github.com/AIEraDev/vidralo/releases/download/v#{version}/Vidralo_#{version}_aarch64.dmg",
        using: GitHubPrivateRepositoryReleaseDownloadStrategy
    sha256 :no_check  # Updated automatically by CI after each release
  end

  on_intel do
    url "https://github.com/AIEraDev/vidralo/releases/download/v#{version}/Vidralo_#{version}_x64.dmg",
        using: GitHubPrivateRepositoryReleaseDownloadStrategy
    sha256 :no_check  # Updated automatically by CI after each release
  end

  name "Vidralo"
  desc "Local-first YouTube downloader — downloads stream directly from your own IP"
  homepage "https://github.com/AIEraDev/vidralo"

  auto_updates true
  depends_on macos: :ventura

  app "Vidralo.app"

  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-r", "-d", "com.apple.quarantine", "#{staged_path}/Vidralo.app"],
                   sudo: false
  end

  zap trash: [
    "~/Library/Application Support/com.vidralo.app",
    "~/Library/Preferences/com.vidralo.app.plist",
    "~/Library/Caches/com.vidralo.app",
  ]
end
