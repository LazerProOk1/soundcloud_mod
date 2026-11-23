use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Runtime};

const TRAY_ID: &str = "main";
const APP_NAME: &str = "SoundCloud Mod";

/// What the tray menu shows. The webview sends it in the app's language and again whenever
/// the track, the play state, the like state or the language changes.
#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TrayState {
    /// Title and artist of the current track, if any.
    title: Option<String>,
    artist: Option<String>,
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
}

impl Default for TrayState {
    fn default() -> Self {
        Self {
            title: None,
            artist: None,
            playing: false,
            liked: false,
            play: "Play".into(),
            pause: "Pause".into(),
            previous: "Previous".into(),
            next: "Next".into(),
            like: "Like".into(),
            unlike: "Remove from likes".into(),
            open: format!("Open {APP_NAME}"),
            quit: "Quit".into(),
        }
    }
}

/// Cuts a label to `max` characters, ending in an ellipsis when it was longer.
fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max - 1).collect();
    out.push('…');
    out
}

/// Track title and artist (greyed), play/pause, previous, next, like, then open and quit.
/// Without a track the header and like items are left out and previous/next are disabled.
fn build_menu<R: Runtime, M: Manager<R>>(app: &M, s: &TrayState) -> tauri::Result<Menu<R>> {
    let title = s.title.as_deref().filter(|t| !t.is_empty());
    let has_track = title.is_some();
    let item = |id: &str, label: String, enabled: bool| {
        MenuItemBuilder::with_id(id, label).enabled(enabled).build(app)
    };
    let mut menu = MenuBuilder::new(app);
    if let Some(title) = title {
        menu = menu.item(&item("now", format!("♪  {}", truncate(title, 40)), false)?);
        if let Some(artist) = s.artist.as_deref().filter(|a| !a.is_empty()) {
            menu = menu.item(&item("artist", format!("     {}", truncate(artist, 40)), false)?);
        }
        menu = menu.item(&PredefinedMenuItem::separator(app)?);
    }
    let toggle = if s.playing { ("⏸", &s.pause) } else { ("▶", &s.play) };
    menu = menu
        .item(&item("play_pause", format!("{}  {}", toggle.0, toggle.1), true)?)
        .item(&item("prev", format!("⏮  {}", s.previous), has_track)?)
        .item(&item("next", format!("⏭  {}", s.next), has_track)?);
    if has_track {
        let like = if s.liked { ("♥", &s.unlike) } else { ("♡", &s.like) };
        menu = menu.item(&item("like", format!("{}  {}", like.0, like.1), true)?);
    }
    menu.item(&PredefinedMenuItem::separator(app)?)
        .item(&item("show", s.open.clone(), true)?)
        .item(&item("quit", s.quit.clone(), true)?)
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
            id @ ("play_pause" | "next" | "prev" | "like") => {
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
    let tooltip = match state.title.as_deref().filter(|t| !t.is_empty()) {
        Some(title) => match state.artist.as_deref().filter(|a| !a.is_empty()) {
            Some(artist) => format!("{APP_NAME}\n{artist} — {title}"),
            None => format!("{APP_NAME}\n{title}"),
        },
        None => APP_NAME.to_string(),
    };
    tray.set_tooltip(Some(tooltip)).map_err(|e| e.to_string())?;
    Ok(())
}
