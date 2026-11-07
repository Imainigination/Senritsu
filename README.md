# Senritsu

Customizable, ad-free native music client for Linux. Rust + Tauri v2, no Electron.
Own UI, playback through mpv, search through yt-dlp (no YouTube web player = no ads).

## Features
- Search, queue, liked songs, auto "radio" when the queue ends
- Synced lyrics (lrclib.net)
- 7 themes, custom accent color, corner radius, blurred cover glow
- Tray icon, close-to-tray, global media keys (X11)
- Space = play/pause, `/` = focus search

## Install & run
```bash
./install-deps.sh     # system libs, mpv, yt-dlp, Rust, tauri-cli
cargo tauri dev       # run
cargo tauri build     # .deb + .AppImage in src-tauri/target/release/bundle/
```

## Troubleshooting
- Search fails / nothing plays: update yt-dlp (`yt-dlp -U`), make sure `~/.local/bin` is in PATH.
- "Could not start mpv": install mpv.
- Blank window on NVIDIA: already worked around with WEBKIT_DISABLE_DMABUF_RENDERER=1.
