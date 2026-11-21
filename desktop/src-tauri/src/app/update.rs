/// Whether this install can replace itself with the updater: the NSIS install (its
/// `uninstall.exe` sits next to the binary) and AppImage. The portable ZIP, MSI and distro
/// packages (DEB/RPM/Flatpak) keep the "open the release page" notice.
#[tauri::command]
pub fn can_self_update() -> bool {
    #[cfg(target_os = "windows")]
    {
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|dir| dir.join("uninstall.exe").exists()))
            .unwrap_or(false)
    }
    #[cfg(target_os = "linux")]
    {
        std::env::var_os("APPIMAGE").is_some()
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        false
    }
}

/// Restarts into the freshly installed version (the Windows installer relaunches by itself).
#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}
