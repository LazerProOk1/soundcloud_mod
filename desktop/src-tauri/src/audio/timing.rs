use tauri::{Emitter, State};

use crate::audio::state::{AudioState, LyricsTimelineState};
use crate::audio::types::LyricsTimingLine;

pub fn audio_set_lyrics_timeline(lines: Vec<LyricsTimingLine>, state: State<'_, AudioState>) {
    let mut sorted = lines;
    sorted.sort_by(|a, b| a.time_secs.total_cmp(&b.time_secs));
    *state.lyrics_timeline.lock().unwrap() = Some(LyricsTimelineState {
        lines: sorted,
        active_index: None,
    });
}

pub fn audio_clear_lyrics_timeline(state: State<'_, AudioState>) {
    *state.lyrics_timeline.lock().unwrap() = None;
}

pub fn process_lyrics_timeline(handle: &tauri::AppHandle, state: &AudioState, pos_secs: f64) {
    let mut timeline = state.lyrics_timeline.lock().unwrap();
    let Some(timeline) = timeline.as_mut() else {
        return;
    };

    let mut next_active = None;
    for (index, line) in timeline.lines.iter().enumerate().rev() {
        if line.time_secs <= pos_secs {
            next_active = Some(index);
            break;
        }
    }

    if timeline.active_index != next_active {
        timeline.active_index = next_active;
        handle
            .emit("lyrics:active_line", next_active.map(|index| index as i64))
            .ok();
    }
}

