#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod player;
mod ytdlp;

use player::Player;
use serde_json::json;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, State, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

fn valid_id(id: &str) -> bool {
    id.len() == 11 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Plays a track. Uses a prefetched direct stream when available (instant start),
/// otherwise lets mpv resolve the watch URL. With `video` on, mpv opens its own
/// video window (best video up to `height` plus best audio).
#[tauri::command]
fn play(
    player: State<Player>,
    id: String,
    video: bool,
    height: u32,
    start: f64,
    fresh: bool,
) -> Result<(), String> {
    if !valid_id(&id) {
        return Err("Invalid video id".into());
    }
    if fresh {
        ytdlp::forget(&id);
    }
    let h = height.clamp(144, 2160);
    let fmt = if video {
        format!("bestvideo[height<=?{h}]+bestaudio/best[height<=?{h}]/best")
    } else {
        "bestaudio/best".to_string()
    };
    let vid = if video { "auto" } else { "no" };
    let win = if video { "yes" } else { "no" };

    let watch = format!("https://www.youtube.com/watch?v={id}");
    let target = match (video, ytdlp::cached(&id)) {
        (false, Some(s)) => {
            if let Some(ua) = s.ua {
                player.send(json!(["set_property", "user-agent", ua]))?;
            }
            s.url
        }
        _ => watch,
    };

    player.send(json!(["set_property", "ytdl-format", fmt]))?;
    player.send(json!(["set_property", "vid", vid]))?;
    player.send(json!(["set_property", "force-window", win]))?;
    player.send(json!(["set_property", "start", format!("{:.1}", start.max(0.0))]))?;
    player.send(json!(["loadfile", target, "replace"]))?;
    player.send(json!(["set_property", "pause", false]))
}

/// Resolves and caches the stream of a track in the background.
#[tauri::command]
async fn prefetch(id: String) -> Result<(), String> {
    if !valid_id(&id) {
        return Err("Invalid video id".into());
    }
    if ytdlp::cached(&id).is_some() {
        return Ok(());
    }
    let r = tauri::async_runtime::spawn_blocking(move || ytdlp::resolve_audio(&id).map(|_| ()))
        .await
        .map_err(|e| e.to_string())?;
    r
}

/// Direct video-only URL for the in-app <video> element.
#[tauri::command]
async fn resolve_video(id: String, height: u32, codecs: Vec<String>) -> Result<String, String> {
    if !valid_id(&id) {
        return Err("Invalid video id".into());
    }
    let r = tauri::async_runtime::spawn_blocking(move || ytdlp::resolve_video(&id, height, &codecs))
        .await
        .map_err(|e| e.to_string())?;
    r
}

/// Closes the video window but keeps the audio playing.
#[tauri::command]
fn video_off(player: State<Player>) -> Result<(), String> {
    player.send(json!(["set_property", "vid", "no"]))?;
    player.send(json!(["set_property", "force-window", "no"]))
}

#[tauri::command]
fn toggle_pause(player: State<Player>) -> Result<(), String> {
    player.send(json!(["cycle", "pause"]))
}

#[tauri::command]
fn seek(player: State<Player>, secs: f64) -> Result<(), String> {
    player.send(json!(["seek", secs, "absolute"]))
}

#[tauri::command]
fn set_volume(player: State<Player>, v: f64) -> Result<(), String> {
    player.send(json!(["set_property", "volume", v]))
}

#[tauri::command]
async fn search(query: String) -> Result<Vec<ytdlp::Track>, String> {
    let r = tauri::async_runtime::spawn_blocking(move || {
        ytdlp::list(&format!("ytsearch25:{query}"), 25)
    })
    .await
    .map_err(|e| e.to_string())?;
    r
}

#[tauri::command]
async fn radio(id: String) -> Result<Vec<ytdlp::Track>, String> {
    if !valid_id(&id) {
        return Err("Invalid video id".into());
    }
    let r = tauri::async_runtime::spawn_blocking(move || {
        ytdlp::list(
            &format!("https://www.youtube.com/watch?v={id}&list=RD{id}"),
            25,
        )
    })
    .await
    .map_err(|e| e.to_string())?;
    r
}

fn toggle_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }
}

fn main() {
    // Avoids a blank window on some NVIDIA / Wayland setups
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    let k_play = Shortcut::new(None, Code::MediaPlayPause);
    let k_next = Shortcut::new(None, Code::MediaTrackNext);
    let k_prev = Shortcut::new(None, Code::MediaTrackPrevious);
    let (id_play, id_next, id_prev) = (k_play.id(), k_next.id(), k_prev.id());

    tauri::Builder::default()
        .manage(Player::default())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let id = shortcut.id();
                    let key = if id == id_play {
                        "toggle"
                    } else if id == id_next {
                        "next"
                    } else if id == id_prev {
                        "prev"
                    } else {
                        return;
                    };
                    let _ = app.emit("media-key", key);
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            play,
            prefetch,
            resolve_video,
            video_off,
            toggle_pause,
            seek,
            set_volume,
            search,
            radio
        ])
        .on_window_event(|window, event| {
            // Close button hides to tray
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(move |app| {
            if let Err(e) = app.state::<Player>().start(app.handle().clone()) {
                eprintln!("senritsu: {e}");
            }

            let gs = app.global_shortcut();
            for s in [k_play, k_next, k_prev] {
                let _ = gs.register(s);
            }

            let show = MenuItemBuilder::with_id("show", "Show / Hide").build(app)?;
            let pp = MenuItemBuilder::with_id("toggle", "Play / Pause").build(app)?;
            let pv = MenuItemBuilder::with_id("prev", "Previous").build(app)?;
            let nx = MenuItemBuilder::with_id("next", "Next").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&show, &pp, &pv, &nx])
                .separator()
                .item(&quit)
                .build()?;

            let mut tray = TrayIconBuilder::new()
                .tooltip("Senritsu")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => toggle_window(app),
                    "toggle" => {
                        let _ = app.emit("media-key", "toggle");
                    }
                    "prev" => {
                        let _ = app.emit("media-key", "prev");
                    }
                    "next" => {
                        let _ = app.emit("media-key", "next");
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Senritsu")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                app.state::<Player>().kill();
            }
        });
}
