# Vidralo

**Local-first video downloader** — downloads streams directly from your own IP.

Vidralo is a desktop application that allows you to download videos and audio from YouTube, Vimeo, Twitter, and 1000+ supported sites directly to your computer without relying on third-party services or proxies.

## Features

- 🚀 **Local-first**: Downloads streams directly from your IP
- 🌐 **Multi-platform**: Supports YouTube, Vimeo, Twitter, and 1000+ sites
- 🎯 **Simple UI**: Clean and intuitive interface
- 🎵 **Multiple formats**: Support for video and audio downloads
- 🔒 **Privacy-focused**: No data sent to external services
- 🎨 **Native performance**: Built with Tauri for optimal performance
- 🔄 **Auto-updates**: Keeps the app up-to-date automatically

## Installation

### macOS (Homebrew)

```sh
brew tap AIEraDev/vidralo
brew install --cask vidralo
```

### Manual Installation

Download the latest release for your platform:

- **macOS**: Download the `.dmg` file for your chip (Apple Silicon → `aarch64`, Intel → `x64`)
- **Windows**: Download the `.msi` or `.exe` installer
- **Linux**: Download the `.AppImage` or `.deb` package

[📥 Download Latest Release](https://github.com/AIEraDev/vidralo/releases/latest)

> **Note**: No Python or external dependencies required. All download tools are self-contained.

## Development

### Prerequisites

- Node.js 18+ and npm
- Rust 1.70+
- Platform-specific dependencies for Tauri

### Setup

1. Clone the repository:

```sh
git clone https://github.com/AIEraDev/vidralo.git
cd vidralo
```

2. Install dependencies:

```sh
npm install
```

3. Run in development mode:

```sh
npm run tauri dev
```

4. Build for production:

```sh
npm run tauri build
```

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust + Tauri
- **Downloader**: yt-dlp (bundled)
- **Media Processing**: bgutil-pot (bundled)

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

See [LICENSE](LICENSE) for details.

## Support

For issues, feature requests, or questions, please [open an issue](https://github.com/AIEraDev/vidralo/issues).
