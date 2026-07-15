cask "vidralo" do
  version "0.1.0"

  on_arm do
    url "https://github.com/AIEraDev/vidralo/releases/download/v#{version}/Vidralo_#{version}_aarch64.dmg"
    sha256 :no_check  # Updated automatically by CI after each release
  end

  on_intel do
    url "https://github.com/AIEraDev/vidralo/releases/download/v#{version}/Vidralo_#{version}_x64.dmg"
    sha256 :no_check  # Updated automatically by CI after each release
  end

  name "Vidralo"
  desc "Local-first YouTube downloader — downloads stream directly from your own IP"
  homepage "https://github.com/AIEraDev/vidralo"

  auto_updates false
  depends_on macos: ">= :ventura"

  app "Vidralo.app"

  zap trash: [
    "~/Library/Application Support/com.vidralo.app",
    "~/Library/Preferences/com.vidralo.app.plist",
    "~/Library/Caches/com.vidralo.app",
  ]
end
