use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Runtime};

const TRAY_ID: &str = "main";
const APP_NAME: &str = "SoundCloud Mod";

/// What the tray menu shows. The webview sends it in the app's language and again whenever
/// the track, the play state or the language changes.
#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrayState {
    /// "Artist — Title" of the current track, if any.
    now_playing: Option<String>,
    playing: bool,
    play: String,
    pause: String,
    previous: String,
    next: String,
    open: String,
    quit: String,
}

impl Default for TrayState {
    fn default() -> Self {
        Self {
            now_playing: None,
            playing: false,
            play: "Play".into(),
            pause: "Pause".into(),
            previous: "Previous".into(),
            next: "Next".into(),
            open: format!("Open {APP_NAME}"),
            quit: "Quit".into(),
        }
    }
}

/// Now playing (greyed, informational), play/pause, previous, next, then open and quit.
fn build_menu<R: Runtime, M: Manager<R>>(app: &M, s: &TrayState) -> tauri::Result<Menu<R>> {
    let mut menu = MenuBuilder::new(app);
    if let Some(title) = s.now_playing.as_deref().filter(|t| !t.is_empty()) {
        let label: String = format!("♪  {title}").chars().take(64).collect();
        menu = menu
            .item(&MenuItemBuilder::with_id("now", label).enabled(false).build(app)?)
            .item(&PredefinedMenuItem::separator(app)?);
    }
    let toggle = if s.playing { &s.pause } else { &s.play };
    menu.item(&MenuItemBuilder::with_id("play_pause", toggle).build(app)?)
        .item(&MenuItemBuilder::with_id("prev", &s.previous).build(app)?)
        .item(&MenuItemBuilder::with_id("next", &s.next).build(app)?)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItemBuilder::with_id("show", &s.open).build(app)?)
        .item(&MenuItemBuilder::with_id("quit", &s.quit).build(app)?)
        .build()
}

fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

pub fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let menu = build_menu(app, &TrayState::default())?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(app.default_window_icon().cloned().expect("no app icon"))
        .tooltip(APP_NAME)
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            id @ ("play_pause" | "next" | "prev") => {
                let _ = app.emit("tray-action", id);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

/// Rebuilds the tray menu and tooltip for the current track and language.
#[tauri::command]
pub fn tray_update(app: AppHandle, state: TrayState) -> Result<(), String> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(());
    };
    let menu = build_menu(&app, &state).map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    let tooltip = match state.now_playing.as_deref().filter(|t| !t.is_empty()) {
        Some(title) => format!("{APP_NAME}\n{title}"),
        None => APP_NAME.to_string(),
    };
    tray.set_tooltip(Some(tooltip)).map_err(|e| e.to_string())?;
    Ok(())
}
