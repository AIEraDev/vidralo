cask "vidralo" do
  version "0.1.0"

  on_arm do
    url "https://github.com/AIEraDev/vidralo/releases/download/v#{version}/Vidralo_#{version}_aarch64.dmg",
        header: "Authorization: Bearer #{ENV["HOMEBREW_GITHUB_API_TOKEN"] || ENV["GITHUB_TOKEN"]}"
    sha256 :no_check  # Updated automatically by CI after each release
  end

  on_intel do
    url "https://github.com/AIEraDev/vidralo/releases/download/v#{version}/Vidralo_#{version}_x64.dmg",
        header: "Authorization: Bearer #{ENV["HOMEBREW_GITHUB_API_TOKEN"] || ENV["GITHUB_TOKEN"]}"
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
