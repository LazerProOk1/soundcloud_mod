//! Play-while-downloading: the cache writer registers every in-progress download here,
//! and the audio engine reads the growing `.part` file through `GrowingReader`, which
//! blocks until enough bytes have landed instead of reporting EOF.

use std::collections::HashMap;
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};

const RUNNING: u8 = 0;
const DONE: u8 = 1;
const FAILED: u8 = 2;

/// How long a reader waits for new bytes before giving up (stalled network).
const READ_STALL_LIMIT: Duration = Duration::from_secs(25);

/// True while a reader is blocked waiting for the network, so the tick thread
/// doesn't mistake buffering for a dead audio device.
pub static STREAM_WAITING: AtomicBool = AtomicBool::new(false);

pub struct LiveDownload {
    pub path: PathBuf,
    /// Where the completed file is saved in the cache.
    pub final_path: PathBuf,
    written: AtomicU64,
    total: AtomicU64,
    state: AtomicU8,
    lock: Mutex<()>,
    cv: Condvar,
}

impl LiveDownload {
    pub fn written(&self) -> u64 {
        self.written.load(Ordering::Acquire)
    }
    /// Expected size from Content-Length, 0 if unknown.
    pub fn total(&self) -> u64 {
        self.total.load(Ordering::Acquire)
    }
    pub fn is_running(&self) -> bool {
        self.state.load(Ordering::Acquire) == RUNNING
    }
    fn wake(&self) {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        self.cv.notify_all();
    }
    /// Bytes are on disk (flushed) and readable through the temp path.
    pub fn add(&self, n: u64) {
        self.written.fetch_add(n, Ordering::AcqRel);
        self.wake();
    }
    /// Start over (a retry is rewriting the file from byte 0).
    pub fn reset(&self) {
        self.written.store(0, Ordering::Release);
    }
    fn finish(&self, ok: bool) {
        self.state
            .store(if ok { DONE } else { FAILED }, Ordering::Release);
        self.wake();
    }
}

fn registry() -> &'static Mutex<HashMap<String, Arc<LiveDownload>>> {
    static MAP: OnceLock<Mutex<HashMap<String, Arc<LiveDownload>>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn get(urn: &str) -> Option<Arc<LiveDownload>> {
    registry()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(urn)
        .cloned()
}

/// Registers a download; the returned guard marks it failed + unregisters on drop
/// unless `complete()` was called first.
pub fn register(urn: &str, path: PathBuf, final_path: PathBuf, total: u64) -> LiveGuard {
    let live = Arc::new(LiveDownload {
        path,
        final_path,
        written: AtomicU64::new(0),
        total: AtomicU64::new(total),
        state: AtomicU8::new(RUNNING),
        lock: Mutex::new(()),
        cv: Condvar::new(),
    });
    registry()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(urn.to_string(), live.clone());
    LiveGuard {
        urn: urn.to_string(),
        live,
        completed: false,
    }
}

pub struct LiveGuard {
    urn: String,
    pub live: Arc<LiveDownload>,
    completed: bool,
}

impl LiveGuard {
    pub fn complete(mut self) {
        self.completed = true;
        // Drop runs next.
    }
}

impl Drop for LiveGuard {
    fn drop(&mut self) {
        self.live.finish(self.completed);
        let mut map = registry().lock().unwrap_or_else(|e| e.into_inner());
        if map
            .get(&self.urn)
            .is_some_and(|l| Arc::ptr_eq(l, &self.live))
        {
            map.remove(&self.urn);
        }
    }
}

/// Read+Seek over a file that is still being written.
pub struct GrowingReader {
    file: File,
    pos: u64,
    live: Arc<LiveDownload>,
}

impl GrowingReader {
    pub fn open(live: Arc<LiveDownload>) -> io::Result<Self> {
        let file = File::open(&live.path)?;
        Ok(Self { file, pos: 0, live })
    }

    /// Block until `want` bytes past the start exist, or the download ends.
    /// Returns how many bytes are available.
    fn wait_for(&self, want: u64) -> io::Result<u64> {
        let started = Instant::now();
        loop {
            let have = self.live.written();
            if have >= want {
                return Ok(have);
            }
            match self.live.state.load(Ordering::Acquire) {
                DONE => return Ok(have),
                FAILED => {
                    return Err(io::Error::new(io::ErrorKind::Other, "download failed"));
                }
                _ => {}
            }
            if started.elapsed() > READ_STALL_LIMIT {
                return Err(io::Error::new(io::ErrorKind::TimedOut, "download stalled"));
            }
            STREAM_WAITING.store(true, Ordering::Relaxed);
            let guard = self.live.lock.lock().unwrap_or_else(|e| e.into_inner());
            let _ = self
                .live
                .cv
                .wait_timeout(guard, Duration::from_millis(100))
                .unwrap_or_else(|e| e.into_inner());
        }
    }
}

impl Read for GrowingReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if buf.is_empty() {
            return Ok(0);
        }
        let have = self.wait_for(self.pos + 1);
        STREAM_WAITING.store(false, Ordering::Relaxed);
        let have = have?;
        if have <= self.pos {
            return Ok(0); // download finished and we're at the end
        }
        let n = buf.len().min((have - self.pos) as usize);
        self.file.seek(SeekFrom::Start(self.pos))?;
        let read = self.file.read(&mut buf[..n])?;
        self.pos += read as u64;
        Ok(read)
    }
}

impl Seek for GrowingReader {
    fn seek(&mut self, to: SeekFrom) -> io::Result<u64> {
        let new = match to {
            SeekFrom::Start(p) => p as i64,
            SeekFrom::Current(d) => self.pos as i64 + d,
            SeekFrom::End(d) => {
                let mut end = self.live.total();
                if end == 0 {
                    // Unknown length: the end exists only once the download is done.
                    end = self.wait_for(u64::MAX).inspect(|_| {
                        STREAM_WAITING.store(false, Ordering::Relaxed);
                    })?;
                }
                end as i64 + d
            }
        };
        if new < 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "seek before start",
            ));
        }
        self.pos = new as u64;
        Ok(self.pos)
    }
}
