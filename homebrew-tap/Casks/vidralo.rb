cask "vidralo" do
  version "0.1.0"

  on_arm do
    url "https://github.com/AIEraDev/vidralo/releases/download/v#{version}/Vidralo_#{version}_aarch64.dmg"
    sha256 "8716a162d17ca4c1d07116b8c2c18b0ec8f01ee98bafc3a56d7bd4b2f49e2ec9"
  end

  on_intel do
    url "https://github.com/AIEraDev/vidralo/releases/download/v#{version}/Vidralo_#{version}_x64.dmg"
    sha256 "3a3d3bba9509974f755b8871e8fb0e6da9ff458a4071bac5fd3e37eaee09e764"
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
