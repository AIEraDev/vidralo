#!/bin/bash
set -e

# Determine target triple
ARCH=$(uname -m)
OS=$(uname -s)

if [ "$OS" = "Darwin" ]; then
    if [ "$ARCH" = "arm64" ]; then
        TRIPLE="aarch64-apple-darwin"
    else
        TRIPLE="x86_64-apple-darwin"
    fi
    YTDLP_ASSET="yt-dlp_macos"
    BGUTIL_ASSET="bgutil-pot-macos-aarch64"
    if [ "$ARCH" != "arm64" ]; then
        BGUTIL_ASSET="bgutil-pot-macos-x86_64"
    fi
elif [ "$OS" = "Linux" ]; then
    TRIPLE="x86_64-unknown-linux-gnu"
    YTDLP_ASSET="yt-dlp_linux"
    BGUTIL_ASSET="bgutil-pot-linux-x86_64"
else
    echo "Unsupported OS: $OS"
    exit 1
fi

echo "Detected architecture: $OS $ARCH ($TRIPLE)"

# Create binaries directory
mkdir -p src-tauri/binaries

# Download yt-dlp
echo "Downloading yt-dlp..."
curl -L -o "src-tauri/binaries/yt-dlp-$TRIPLE" "https://github.com/yt-dlp/yt-dlp/releases/latest/download/$YTDLP_ASSET"
chmod +x "src-tauri/binaries/yt-dlp-$TRIPLE"

# Download bgutil-pot
echo "Downloading bgutil-pot..."
curl -L -o "src-tauri/binaries/bgutil-pot-$TRIPLE" "https://github.com/jim60105/bgutil-ytdlp-pot-provider-rs/releases/latest/download/$BGUTIL_ASSET"
chmod +x "src-tauri/binaries/bgutil-pot-$TRIPLE"

echo "Setup completed successfully!"
