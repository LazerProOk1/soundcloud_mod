//! Launch at login, optionally starting hidden in the tray.
//!
//! Autostart is written directly: the HKCU `Run` key on Windows, an XDG autostart entry on
//! Linux. No other platform is supported (the commands report it as off).

use serde::Serialize;

/// Passed by the autostart entry when the app should start hidden in the tray.
pub const MINIMIZED_ARG: &str = "--minimized";
#[cfg(target_os = "windows")]
const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
#[cfg(any(target_os = "windows", target_os = "linux"))]
const ENTRY_NAME: &str = "SoundCloud Mod";

pub fn started_minimized() -> bool {
    std::env::args().any(|a| a == MINIMIZED_ARG)
}

#[derive(Serialize, Default)]
pub struct AutostartState {
    pub supported: bool,
    pub enabled: bool,
    pub minimized: bool,
}

#[cfg(target_os = "windows")]
fn reg(args: &[&str]) -> std::io::Result<std::process::Output> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    std::process::Command::new("reg")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
}

#[cfg(target_os = "linux")]
fn desktop_entry_path() -> Option<std::path::PathBuf> {
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".config")))?;
    Some(base.join("autostart").join("soundcloud-mod.desktop"))
}

/// The command the login entry runs: the AppImage or Flatpak wrapper when there is one.
#[cfg(any(target_os = "windows", target_os = "linux"))]
fn launch_command(minimized: bool) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    let base = if let Ok(id) = std::env::var("FLATPAK_ID") {
        format!("flatpak run {id}")
    } else if let Ok(image) = std::env::var("APPIMAGE") {
        format!("\"{image}\"")
    } else {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        format!("\"{}\"", exe.display())
    };
    #[cfg(target_os = "windows")]
    let base = {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        format!("\"{}\"", exe.display())
    };
    Ok(if minimized {
        format!("{base} {MINIMIZED_ARG}")
    } else {
        base
    })
}

#[tauri::command]
pub fn autostart_get() -> AutostartState {
    #[cfg(target_os = "windows")]
    {
        let Ok(out) = reg(&["query", RUN_KEY, "/v", ENTRY_NAME]) else {
            return AutostartState {
                supported: true,
                ..Default::default()
            };
        };
        let text = String::from_utf8_lossy(&out.stdout);
        AutostartState {
            supported: true,
            enabled: out.status.success(),
            minimized: out.status.success() && text.contains(MINIMIZED_ARG),
        }
    }
    #[cfg(target_os = "linux")]
    {
        let text = desktop_entry_path()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .unwrap_or_default();
        AutostartState {
            supported: true,
            enabled: !text.is_empty(),
            minimized: text.contains(MINIMIZED_ARG),
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    AutostartState::default()
}

#[tauri::command]
pub fn autostart_set(enabled: bool, minimized: bool) -> Result<(), String> {
    // A dev build would register target/debug, which shows a black window without Vite.
    // Turning it off still works, to clean up such an entry.
    if enabled && cfg!(debug_assertions) {
        return Err("autostart can only be turned on in an installed build".into());
    }
    #[cfg(target_os = "windows")]
    {
        let out = if enabled {
            let cmd = launch_command(minimized)?;
            reg(&["add", RUN_KEY, "/v", ENTRY_NAME, "/t", "REG_SZ", "/d", &cmd, "/f"])
        } else {
            reg(&["delete", RUN_KEY, "/v", ENTRY_NAME, "/f"])
        }
        .map_err(|e| e.to_string())?;
        // Deleting a value that isn't there is fine: the result is the same.
        if enabled && !out.status.success() {
            return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
        }
        Ok(())
    }
    #[cfg(target_os = "linux")]
    {
        let path = desktop_entry_path().ok_or("no config directory")?;
        if !enabled {
            return match std::fs::remove_file(&path) {
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
                _ => Ok(()),
            };
        }
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let entry = format!(
            "[Desktop Entry]\nType=Application\nName={ENTRY_NAME}\nExec={}\nX-GNOME-Autostart-enabled=true\n",
            launch_command(minimized)?
        );
        // Written whole through a temporary file, so a crash never leaves half an entry.
        let tmp = path.with_extension("desktop.tmp");
        std::fs::write(&tmp, entry).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        let _ = (enabled, minimized);
        Err("autostart is not supported on this platform".into())
    }
}
