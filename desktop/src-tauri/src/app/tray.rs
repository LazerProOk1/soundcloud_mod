use std::sync::Mutex;

use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder,
    WindowEvent,
};

const TRAY_ID: &str = "main";
const MENU_LABEL: &str = "tray-menu";
const APP_NAME: &str = "SoundCloud Mod";

/// What the tray popup shows. The main webview sends it in the app's language and again
/// whenever the track, the play state, the like state or the language changes.
#[derive(serde::Deserialize, serde::Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct TrayState {
    title: Option<String>,
    artist: Option<String>,
    artwork: Option<String>,
    playing: bool,
    liked: bool,
    play: String,
    pause: String,
    previous: String,
    next: String,
    like: String,
    unlike: String,
    open: String,
    quit: String,
    #[serde(default)]
    report: String,
}

/// The popup is a small frameless webview styled like the app: the native menu can't be.
#[derive(Default)]
struct Popup {
    state: TrayState,
    /// Cursor position of the right click that opened it, in physical pixels.
    anchor: Option<PhysicalPosition<f64>>,
    /// Content size reported by the popup, in CSS pixels.
    size: Option<(f64, f64)>,
    /// Opened before the page had reported its size.
    pending: bool,
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Puts the popup's bottom-right corner at the click (it flips below or right when there is
/// no room, e.g. a taskbar at the top or left) and shows it.
fn place_and_show(app: &AppHandle) {
    let Some(win) = app.get_webview_window(MENU_LABEL) else {
        return;
    };
    let popup = app.state::<Mutex<Popup>>();
    let (anchor, size) = {
        let p = popup.lock().unwrap();
        (p.anchor, p.size)
    };
    let (Some(anchor), Some((w, h))) = (anchor, size) else {
        return;
    };
    let scale = win.scale_factor().unwrap_or(1.0);
    let (w, h) = (w * scale, h * scale);
    let mut x = anchor.x - w;
    let mut y = anchor.y - h;
    if let Ok(Some(m)) = win.monitor_from_point(anchor.x, anchor.y) {
        let (mx, my) = (m.position().x as f64, m.position().y as f64);
        if x < mx {
            x = anchor.x;
        }
        if y < my {
            y = anchor.y;
        }
    }
    let _ = win.set_size(PhysicalSize::new(w.round() as u32, h.round() as u32));
    let _ = win.set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32));
    let _ = win.show();
    let _ = win.set_focus();
}

fn open_popup(app: &AppHandle, at: PhysicalPosition<f64>) {
    app.state::<Mutex<Popup>>().lock().unwrap().anchor = Some(at);
    if app.get_webview_window(MENU_LABEL).is_some() {
        place_and_show(app);
        return;
    }
    // First open: the page reports its size once rendered, which then shows it.
    app.state::<Mutex<Popup>>().lock().unwrap().pending = true;
    let built = WebviewWindowBuilder::new(app, MENU_LABEL, WebviewUrl::App("index.html".into()))
        .title(APP_NAME)
        .inner_size(280.0, 120.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build();
    if let Ok(win) = built {
        let handle = win.clone();
        win.on_window_event(move |event| {
            if let WindowEvent::Focused(false) = event {
                let _ = handle.hide();
            }
        });
    }
}

pub fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(Mutex::new(Popup::default()));
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(app.default_window_icon().cloned().expect("no app icon"))
        .tooltip(APP_NAME)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button,
                button_state: MouseButtonState::Up,
                position,
                ..
            } = event
            {
                match button {
                    MouseButton::Left => show_main(tray.app_handle()),
                    MouseButton::Right => open_popup(tray.app_handle(), position),
                    _ => {}
                }
            }
        })
        .build(app)?;
    Ok(())
}

/// Stores the popup contents and the tooltip for the current track and language.
#[tauri::command]
pub fn tray_update(app: AppHandle, state: TrayState) -> Result<(), String> {
    let tooltip = match state.title.as_deref().filter(|t| !t.is_empty()) {
        Some(title) => match state.artist.as_deref().filter(|a| !a.is_empty()) {
            Some(artist) => format!("{APP_NAME}\n{artist} — {title}"),
            None => format!("{APP_NAME}\n{title}"),
        },
        None => APP_NAME.to_string(),
    };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_tooltip(Some(tooltip)).map_err(|e| e.to_string())?;
    }
    let _ = app.emit_to(MENU_LABEL, "tray-state", &state);
    app.state::<Mutex<Popup>>().lock().unwrap().state = state;
    Ok(())
}

/// The popup asks for what to show when it loads.
#[tauri::command]
pub fn tray_state(app: AppHandle) -> TrayState {
    app.state::<Mutex<Popup>>().lock().unwrap().state.clone()
}

/// The popup reports its content size (CSS pixels): shows it after the first click, or
/// refits it when the content changes while it is open.
#[tauri::command]
pub fn tray_menu_size(app: AppHandle, width: f64, height: f64) {
    let pending = {
        let popup = app.state::<Mutex<Popup>>();
        let mut p = popup.lock().unwrap();
        p.size = Some((width, height));
        std::mem::take(&mut p.pending)
    };
    let visible = app
        .get_webview_window(MENU_LABEL)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    if pending || visible {
        place_and_show(&app);
    }
}

/// A popup item was picked: it runs here or in the main window.
#[tauri::command]
pub fn tray_menu_action(app: AppHandle, id: String) {
    // Playback buttons keep the popup open so several can be pressed in a row.
    if matches!(id.as_str(), "show" | "quit" | "close" | "report") {
        if let Some(w) = app.get_webview_window(MENU_LABEL) {
            let _ = w.hide();
        }
    }
    match id.as_str() {
        "show" => show_main(&app),
        "quit" => app.exit(0),
        _ => {
            let _ = app.emit_to("main", "tray-action", id);
        }
    }
}
