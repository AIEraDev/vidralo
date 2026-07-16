cask "vidralo" do
  version "0.1.0"

  on_arm do
    url "https://github.com/AIEraDev/vidralo/releases/download/v#{version}/Vidralo_#{version}_aarch64.dmg"
    sha256 "8716a162d17ca4c1d07116b8ef31744403f8d0bd9f38e0f974d9193c91364db7"
  end

  on_intel do
    url "https://github.com/AIEraDev/vidralo/releases/download/v#{version}/Vidralo_#{version}_x64.dmg"
    sha256 "3a3d3bba9509974f755b88712d92e442f97c4ca29a6c713847ae5ebb7a6ccf8a"
  end

  name "Vidralo"
  desc "Local-first video downloader — downloads streams directly from your own IP. Supports YouTube, Vimeo, Twitter, and 1000+ sites"
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
