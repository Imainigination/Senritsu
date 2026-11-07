#!/usr/bin/env bash
# Installs build + runtime dependencies for Senritsu on Linux.
set -e
if command -v apt >/dev/null; then
  sudo apt update
  sudo apt install -y build-essential curl wget file pkg-config libssl-dev libxdo-dev \
    libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev mpv ffmpeg python3
elif command -v pacman >/dev/null; then
  sudo pacman -S --needed --noconfirm base-devel curl wget file openssl xdotool \
    webkit2gtk-4.1 libayatana-appindicator librsvg mpv ffmpeg python
elif command -v dnf >/dev/null; then
  sudo dnf install -y @development-tools curl wget file openssl-devel libxdo-devel \
    webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel mpv python3
else
  echo "Unsupported distro: install WebKitGTK 4.1, mpv, ffmpeg, python3 and build tools." >&2
  exit 1
fi

# Latest yt-dlp (distro packages are usually outdated and break often)
mkdir -p "$HOME/.local/bin"
curl -fL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "$HOME/.local/bin/yt-dlp"
chmod +x "$HOME/.local/bin/yt-dlp"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) echo 'Add to your shell rc: export PATH="$HOME/.local/bin:$PATH"';; esac

command -v cargo >/dev/null || { curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y; . "$HOME/.cargo/env"; }
cargo install tauri-cli --version "^2" --locked
echo "Done. Run: cargo tauri dev   (or: cargo tauri build)"
