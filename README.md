# Vidralo

<div align="center">

![Vidralo Logo](https://raw.githubusercontent.com/AIEraDev/vidralo/main/src-tauri/icons/128x128.png)

**Local-first video downloader** — downloads streams directly from your own IP.

[![Release](https://img.shields.io/github/v/release/AIEraDev/vidralo)](https://github.com/AIEraDev/vidralo/releases/latest) [![License](https://img.shields.io/github/license/AIEraDev/vidralo)](LICENSE) [![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)](https://github.com/AIEraDev/vidralo/releases) [![Downloads](https://img.shields.io/github/downloads/AIEraDev/vidralo/total)](https://github.com/AIEraDev/vidralo/releases)

[Features](#features) • [Installation](#installation) • [Usage](#usage) • [Development](#development) • [Support](#support)

</div>

---

## Overview

Vidralo is a modern, privacy-focused desktop application that allows you to download videos and audio from YouTube, Vimeo, Twitter, and 1000+ supported sites directly to your computer. Unlike web-based downloaders, Vidralo runs entirely on your machine—no third-party servers, no tracking, no data collection.

## Features

- 🚀 **Local-first Architecture**: All downloads happen directly from your IP—no proxy servers
- 🌐 **Wide Platform Support**: YouTube, Vimeo, Twitter, TikTok, Instagram, and [1000+ sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)
- 🎵 **Multiple Formats**: Download video (MP4, WebM) or audio (MP3, M4A, OPUS)
- 📱 **Quality Selection**: Choose from available quality options (4K, 1080p, 720p, etc.)
- 🔒 **Privacy-focused**: Zero telemetry, no data collection, no external API calls
- 🎨 **Native Performance**: Built with Tauri and Rust for minimal resource usage
- 🔄 **Auto-updates**: Seamless updates to keep the app current
- 💻 **Cross-platform**: Runs on macOS (Apple Silicon & Intel), Windows, and Linux
- 🎯 **Simple Interface**: Clean, intuitive UI—paste URL, select format, download

## Installation

### macOS

#### Via Homebrew (Recommended)

```bash
brew tap AIEraDev/vidralo
brew install --cask vidralo
```

#### Manual Installation

Download the `.dmg` file for your Mac:

- **Apple Silicon (M1/M2/M3)**: `Vidralo_0.1.0_aarch64.dmg`
- **Intel**: `Vidralo_0.1.0_x64.dmg`

### Windows

Download and run the installer:

- **MSI Installer**: `Vidralo_0.1.0_x64_en-US.msi`
- **EXE Installer**: `Vidralo_0.1.0_x64-setup.exe`

### Linux

**Debian/Ubuntu**:

```bash
wget https://github.com/AIEraDev/vidralo/releases/latest/download/Vidralo_0.1.0_amd64.deb
sudo dpkg -i Vidralo_0.1.0_amd64.deb
```

**Fedora/RHEL**:

```bash
wget https://github.com/AIEraDev/vidralo/releases/latest/download/Vidralo-0.1.0-1.x86_64.rpm
sudo rpm -i Vidralo-0.1.0-1.x86_64.rpm
```

**AppImage** (Universal):

```bash
wget https://github.com/AIEraDev/vidralo/releases/latest/download/Vidralo_0.1.0_amd64.AppImage
chmod +x Vidralo_0.1.0_amd64.AppImage
./Vidralo_0.1.0_amd64.AppImage
```

### All Platforms

[📥 Download Latest Release](https://github.com/AIEraDev/vidralo/releases/latest)

> **Note**: No Python, FFmpeg, or other external dependencies required. All tools are bundled.

## Usage

1. **Launch Vidralo** from your Applications folder or Start Menu
2. **Paste a video URL** from any supported site
3. **Select format and quality** (video or audio, resolution/bitrate)
4. **Choose download location** (optional—defaults to Downloads folder)
5. **Click Download** and wait for completion

### Supported Sites

Vidralo supports 1000+ video platforms including:

- YouTube, YouTube Music
- Vimeo, Dailymotion
- Twitter (X), TikTok, Instagram
- Facebook, Reddit
- Twitch, Kick
- And [many more](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)

### Keyboard Shortcuts

- `Cmd/Ctrl + V` — Paste URL
- `Cmd/Ctrl + D` — Start download
- `Cmd/Ctrl + ,` — Open settings
- `Cmd/Ctrl + Q` — Quit application

## Development

### Prerequisites

- **Node.js** 18+ and npm
- **Rust** 1.70+ (install via [rustup](https://rustup.rs/))
- **System dependencies**:
  - macOS: Xcode Command Line Tools
  - Windows: Microsoft C++ Build Tools
  - Linux: `webkit2gtk-4.0`, `libayatana-appindicator3-dev`

### Setup

1. **Clone the repository**:

```bash
git clone https://github.com/AIEraDev/vidralo.git
cd vidralo
```

2. **Install dependencies**:

```bash
npm install
```

3. **Run in development mode**:

```bash
npm run tauri dev
```

4. **Build for production**:

```bash
npm run tauri build
```

The built application will be in `src-tauri/target/release/bundle/`.

### Project Structure

```
vidralo/
├── src/                    # React frontend
│   ├── App.tsx            # Main application component
│   ├── store.ts           # State management (Zustand)
│   └── main.tsx           # Entry point
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── main.rs        # Tauri entry point
│   │   ├── downloader.rs  # Download logic
│   │   └── updater.rs     # Auto-update logic
│   ├── binaries/          # Bundled executables (yt-dlp, bgutil-pot)
│   └── tauri.conf.json    # Tauri configuration
├── .github/workflows/     # CI/CD workflows
└── homebrew-tap/          # Homebrew Cask formula
```

### Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure your code follows the existing style and includes appropriate tests.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4
- **Backend**: Rust + Tauri 2.0
- **State Management**: Zustand
- **Downloader**: yt-dlp (bundled)
- **Media Processing**: bgutil-pot (bundled)
- **Build System**: GitHub Actions (multi-platform)

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Security & Privacy

- ✅ **No telemetry or analytics** - Zero tracking of user behavior
- ✅ **No external API calls** - All processing happens locally
- ✅ **No user data collection** - Your downloads and preferences stay on your device
- ✅ **Open source** - Full transparency, inspect the code yourself
- ✅ **Direct downloads** - Videos download directly from source platforms to your machine

## Roadmap

- [ ] Playlist download support
- [ ] Download queue management
- [ ] Custom output templates
- [ ] Subtitle/caption downloads
- [ ] Video format conversion
- [ ] Browser extension integration
- [ ] Download history and bookmarks

## FAQ

**Q: Is this legal?**  
A: Vidralo is a tool. Its legality depends on how you use it. Respect copyright laws and terms of service of platforms you download from.

**Q: Why does it need internet access?**  
A: To download videos from online platforms and check for app updates.

**Q: Does it work with private/age-restricted videos?**  
A: No, Vidralo only downloads publicly accessible content.

**Q: Can I download entire playlists?**  
A: Not yet, but it's on the roadmap.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - The powerful download engine
- [Tauri](https://tauri.app/) - The lightweight desktop framework
- [React](https://react.dev/) - The UI library

## Support

- 🐛 **Bug Reports**: [Open an issue](https://github.com/AIEraDev/vidralo/issues/new?template=bug_report.md)
- 💡 **Feature Requests**: [Open an issue](https://github.com/AIEraDev/vidralo/issues/new?template=feature_request.md)
- 💬 **Questions**: [Discussions](https://github.com/AIEraDev/vidralo/discussions)

---

<div align="center">

Made with ❤️ by [AIEraDev](https://github.com/AIEraDev)

⭐ Star this repo if you find it helpful!

</div>
