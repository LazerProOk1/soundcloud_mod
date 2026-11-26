mod app;
mod audio;
mod discord;
mod import;
mod network;
mod shared;
mod track_cache;

use std::sync::{Arc, Mutex};
use tauri::Manager;

// ── Windows 11: управление скруглением углов окна (DWM) ───────────────────────
// DWMWCP_DONOTROUND=1 → квадратные углы (для мини-плеера с плотным фоном)
// DWMWCP_DEFAULT=0    → системные скругления (для основного окна)
#[cfg(target_os = "windows")]
#[link(name = "Dwmapi")]
extern "system" {
    fn DwmSetWindowAttribute(
        hwnd: *mut std::ffi::c_void,
        dw_attribute: u32,
        pv_attribute: *const std::ffi::c_void,
        cb_attribute: u32,
    ) -> i32;
}

#[tauri::command]
fn set_window_corner_preference(window: tauri::WebviewWindow, round: bool) {
    #[cfg(target_os = "windows")]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
        const DWMWCP_DEFAULT: u32 = 0; // системные (Win11 = ~8px)
        const DWMWCP_ROUNDSMALL: u32 = 3; // небольшое скругление

        let Ok(handle) = window.window_handle() else {
            return;
        };
        let RawWindowHandle::Win32(h) = handle.as_raw() else {
            return;
        };
        let hwnd = h.hwnd.get() as *mut std::ffi::c_void;
        let pref: u32 = if round {
            DWMWCP_DEFAULT
        } else {
            DWMWCP_ROUNDSMALL
        };
        unsafe {
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &pref as *const u32 as *const std::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            );
        }
    }
    // no-op on macOS/Linux
    #[cfg(not(target_os = "windows"))]
    let _ = (window, round);
}

use discord::DiscordState;
use network::server::ServerState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    app::diagnostics::install_early_panic_hook();
    let builder = tauri::Builder::default();

    builder
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .register_asynchronous_uri_scheme_protocol("scproxy", |_ctx, request, responder| {
            let Some(state) = network::proxy::STATE.get() else {
                responder.respond(
                    http::Response::builder()
                        .status(503)
                        .body(b"not ready".to_vec())
                        .unwrap(),
                );
                return;
            };
            state.rt_handle.spawn(async move {
                responder.respond(network::proxy::handle_uri(request).await);
            });
        })
        .setup(move |app| {
            // The window starts hidden (tauri.conf.json); a login launch with --minimized
            // leaves it in the tray, anything else shows it right away.
            if !app::startup::started_minimized() {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                }
            }
            let cache_dir = app
                .path()
                .app_cache_dir()
                .expect("failed to resolve app cache dir");
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

            let audio_dir = cache_dir.join("audio");
            std::fs::create_dir_all(&audio_dir).ok();

            let liked_audio_dir = cache_dir.join("audio_liked");
            std::fs::create_dir_all(&liked_audio_dir).ok();

            let assets_dir = cache_dir.join("assets");
            std::fs::create_dir_all(&assets_dir).ok();

            let wallpapers_dir = cache_dir.join("wallpapers");
            std::fs::create_dir_all(&wallpapers_dir).ok();

            let images_dir = data_dir.join("images");
            std::fs::create_dir_all(&images_dir).ok();

            let http_client = reqwest::Client::builder()
                .connect_timeout(std::time::Duration::from_secs(5))
                .timeout(std::time::Duration::from_secs(20))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new());
            let rt = tokio::runtime::Runtime::new().expect("failed to create tokio runtime");

            network::proxy::STATE
                .set(network::proxy::State {
                    assets_dir,
                    http_client: http_client.clone(),
                    rt_handle: rt.handle().clone(),
                })
                .ok();

            network::image_cache::STATE
                .set(network::image_cache::ImageCache::new(
                    images_dir,
                    http_client,
                ))
                .ok();

            let (static_port, proxy_port) = rt.block_on(network::server::start_all(wallpapers_dir));

            std::thread::spawn(move || {
                rt.block_on(std::future::pending::<()>());
            });

            app.manage(Arc::new(ServerState {
                static_port,
                proxy_port,
            }));
            app::diagnostics::install_panic_hook(&app.handle());
            app::diagnostics::mark_session_started(&app.handle());
            app::diagnostics::start_linux_fd_monitor(&app.handle());
            app.manage(Arc::new(DiscordState {
                client: Mutex::new(None),
            }));

            let mut track_cache_state = track_cache::init(audio_dir, liked_audio_dir);
            track_cache_state.set_app_handle(app.handle().clone());
            app.manage(track_cache_state);

            let audio_state = audio::init();
            let analyser_buffer = audio_state.analyser_buffer.clone();
            app.manage(audio_state);
            audio::start_tick_emitter(app.handle());
            audio::start_media_controls(app.handle());
            audio::start_default_output_monitor(app.handle());
            audio::start_fft_thread(app.handle().clone(), analyser_buffer);

            app::tray::setup_tray(app).expect("failed to setup tray");
            app::diagnostics::log_native(&app.handle(), "INFO", "[Startup] ready");

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            set_window_corner_preference,
            network::server::get_server_ports,
            app::diagnostics::diagnostics_log,
            app::update::can_self_update,
            app::update::restart_app,
            app::tray::tray_update,
            app::tray::tray_state,
            app::tray::tray_menu_size,
            app::tray::tray_menu_action,
            app::startup::autostart_get,
            app::startup::autostart_set,
            discord::discord_connect,
            discord::discord_disconnect,
            discord::discord_set_activity,
            discord::discord_clear_activity,
            audio::audio_load_file,
            audio::audio_load_stream,
            audio::audio_play,
            audio::audio_pause,
            audio::audio_stop,
            audio::audio_seek,
            audio::audio_set_volume,
            audio::audio_set_handoff_fade,
            audio::audio_analyze_track,
            audio::audio_set_analyser,
            audio::audio_set_playback_rate,
            audio::audio_set_eq,
            audio::audio_set_normalization,
            audio::audio_set_metadata,
            audio::audio_set_playback_state,
            audio::audio_set_media_position,
            audio::audio_list_devices,
            audio::audio_switch_device,
            audio::audio_set_follow_default_output,
            audio::audio_set_lyrics_timeline,
            audio::audio_clear_lyrics_timeline,
            audio::save_track_to_path,
            import::import_fetch_link,
            import::import_fetch_yandex_likes,
            track_cache::track_ensure_cached,
            track_cache::track_get_cache_info,
            track_cache::track_preload,
            track_cache::track_cache_size,
            track_cache::track_liked_cache_size,
            track_cache::track_clear_cache,
            track_cache::track_clear_liked_cache,
            track_cache::track_list_cached,
            track_cache::track_remove_cached,
            track_cache::track_cache_from_fallback,
            track_cache::wave_ytm_radio,
            track_cache::track_mark_played,
            track_cache::track_enforce_cache_limit,
            track_cache::track_cache_likes,
            track_cache::track_cache_likes_running,
            track_cache::track_cancel_cache_likes,
            network::image_cache::image_cache_size,
            network::image_cache::image_cache_clear,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                app::diagnostics::mark_session_ended(app);
            }
        });
}
