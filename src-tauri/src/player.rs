use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Write},
    os::unix::net::UnixStream,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter};

#[derive(Default)]
pub struct Player {
    writer: Mutex<Option<UnixStream>>,
    child: Mutex<Option<Child>>,
}

impl Player {
    /// Spawns a headless mpv and connects to its JSON IPC socket.
    pub fn start(&self, app: AppHandle) -> Result<(), String> {
        let dir = std::env::var("XDG_RUNTIME_DIR").unwrap_or_else(|_| "/tmp".into());
        let sock = format!("{}/senritsu-mpv-{}.sock", dir, std::process::id());
        let _ = std::fs::remove_file(&sock);

        let args: Vec<String> = vec![
            "--idle=yes".into(),
            "--no-video".into(),
            "--no-terminal".into(),
            "--force-window=no".into(),
            "--audio-display=no".into(),
            "--ytdl=yes".into(),
            "--ytdl-format=bestaudio/best".into(),
            "--volume=80".into(),
            format!("--input-ipc-server={sock}"),
        ];

        let child = Command::new("mpv")
            .args(&args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Could not start mpv (is it installed?): {e}"))?;
        *self.child.lock().unwrap() = Some(child);

        let mut stream = None;
        for _ in 0..50 {
            if let Ok(s) = UnixStream::connect(&sock) {
                stream = Some(s);
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }
        let stream = stream.ok_or("mpv IPC socket did not come up")?;
        let reader = stream.try_clone().map_err(|e| e.to_string())?;
        *self.writer.lock().unwrap() = Some(stream);

        for (i, prop) in ["time-pos", "duration", "pause"].iter().enumerate() {
            self.send(json!(["observe_property", i + 1, prop]))?;
        }

        thread::spawn(move || read_loop(reader, app));
        Ok(())
    }

    pub fn send(&self, cmd: Value) -> Result<(), String> {
        let mut guard = self.writer.lock().unwrap();
        let w = guard.as_mut().ok_or("Player (mpv) is not running")?;
        let line = json!({ "command": cmd }).to_string() + "\n";
        w.write_all(line.as_bytes()).map_err(|e| e.to_string())
    }

    pub fn kill(&self) {
        if let Some(mut c) = self.child.lock().unwrap().take() {
            let _ = c.kill();
        }
    }
}

fn read_loop(stream: UnixStream, app: AppHandle) {
    let (mut pos, mut dur, mut paused, mut last) = (0.0f64, 0.0f64, false, -1.0f64);
    for line in BufReader::new(stream).lines() {
        let Ok(line) = line else { break };
        let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
        match v["event"].as_str() {
            Some("property-change") => {
                let mut other = false;
                match v["name"].as_str() {
                    Some("time-pos") => pos = v["data"].as_f64().unwrap_or(0.0),
                    Some("duration") => {
                        dur = v["data"].as_f64().unwrap_or(0.0);
                        other = true;
                    }
                    Some("pause") => {
                        paused = v["data"].as_bool().unwrap_or(false);
                        other = true;
                    }
                    _ => {}
                }
                if other || (pos - last).abs() >= 0.25 {
                    last = pos;
                    let _ = app.emit(
                        "player-state",
                        json!({ "pos": pos, "dur": dur, "paused": paused }),
                    );
                }
            }
            Some("end-file") => {
                match v["reason"].as_str() {
                    Some("eof") => {
                        let _ = app.emit("player-ended", ());
                    }
                    Some("error") => {
                        let _ = app.emit("player-error", "Could not play this track");
                    }
                    _ => {}
                }
                pos = 0.0;
                last = -1.0;
            }
            _ => {}
        }
    }
}
