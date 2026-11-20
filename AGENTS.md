# SoundCloud Mod (`LazerProOk1/soundcloud_mod`)

Desktop SoundCloud client built with **Tauri 2**, **React 19 + TypeScript + Tailwind CSS 4**, and a **Rust** audio/cache engine (`desktop/`), paired with an **Axum + SQLx + Redis + Qdrant** backend (`backend/`).

## Commands

```bash
# Frontend (run from desktop/)
pnpm install --frozen-lockfile
pnpm biome ci src/                                                   # Lint & format check (single-quoted, 2-space, 100-col)
pnpm build                                                           # tsc --noEmit + Vite bundle
node --experimental-strip-types --test src/lib/__tests__/*.test.ts   # Pure TS unit tests (Node 22+)
pnpm tauri dev                                                       # Full desktop hot-reload
pnpm tauri build                                                     # Release bundle (NSIS / DEB / AppImage / RPM)

# Rust desktop crate (run from desktop/src-tauri/)
cargo test --lib
cargo clippy --all-targets

# Backend crate (run from backend/)
cargo test
cargo clippy --all-targets
```

## Architecture & Directory Map

- `desktop/src/pages/` — Top-level routes (`Home.tsx`, `SoundWavePage.tsx`, `Discover.tsx`, `Search.tsx`, `Library.tsx`, `OfflinePage.tsx`, `UserPage.tsx`, `ArtistPage.tsx`, `AlbumPage.tsx`, `TrackPage.tsx`, `Settings.tsx`).
- `desktop/src/components/` — Liquid Glass UI (`layout/`, `ui/`, `music/soundwave/`, `user/`, `artist/`, `album/`).
- `desktop/src/lib/` — Audio bridge (`audio.ts`), disk/offline cache (`cache.ts`, `offline-index.ts`), streaming (`streaming.ts`), preset wallpapers (`wallpapers.ts`), JSON backup (`backup.ts`), aura helpers (`aura.ts`, `color.ts`), React Query hooks (`hooks.ts`).
- `desktop/src/stores/` — Zustand stores (`auth.ts`, `player.ts`, `settings.ts`, `app-status.ts`).
- `desktop/src-tauri/src/` — Native Rust engine: `audio/` (`rodio`, Symphonia/Opus, 10-band EQ, ReplayGain, FFT), `track_cache/` (LRU + protected likes + HLS/progressive downloader), `network/` (image cache), `discord_rpc.rs`.
- `backend/src/modules/` — Axum handlers & services (`recommendations/`, `tracks/`, `auras/`, `subscriptions/`, `enrich/`, `lyrics/`).
- `.github/workflows/ci.yml` & `desktop/src-tauri/tauri.conf.json` — CI checks and Windows (NSIS + Portable ZIP) / Ubuntu (DEB, AppImage, RPM) / Flatpak packaging.

## Coding Conventions

- **Design system:** Preserve the Liquid Glass aesthetic (`backdrop-filter` glass layers, specular hairline borders, dynamic artwork color ambiance) while supporting `.no-glass` fallback and `prefers-reduced-motion`.
- **i18n:** Every user-visible string belongs in both `desktop/src/i18n/locales/en.json` and `ru.json`; never hardcode UI copy.
- **Formatting:** Biome enforces single quotes, trailing commas, semicolons, 2-space indent, and `lineWidth: 100` in `desktop/src/`.
- **Auras & Wallpapers:** Star gating is gone — every artist/album page gets a deterministic aura from `aura.ts` (`auraFromHex`, `artistAuraForId`). Built-in wallpapers live under `desktop/public/wallpapers/` and resolve safely via `preset:<file>`.

## Boundaries

### Always
- Run `pnpm biome ci src/`, `pnpm build`, and `node --experimental-strip-types --test src/lib/__tests__/*.test.ts` (plus `cargo test` when Rust crates change or toolchain is present) before finishing work.
- Validate JSON files (`locales/*.json`, `tauri.conf.json`, `biome.json`) after editing.
- Author every commit as `LazerProOk1 <139680797+LazerProOk1@users.noreply.github.com>` (a `Co-Authored-By:` trailer is fine):
  `git commit --author="LazerProOk1 <139680797+LazerProOk1@users.noreply.github.com>" -m "..."`

### Ask First
- Changing Tauri app identifier (`com.lazerprook1.soundcloudmod`), breaking persisted `tauriStorage` store schemas without migration, or modifying database SQL migrations in `backend/migrations/`.

### Never
- Include AI assistant names or tool signatures in code comments or documentation.
  (A `Co-Authored-By:` trailer in commit messages and an attribution line in PR descriptions are allowed.)
- Add AI-generated UI screenshots or mockups pretending to show the running application to `docs/` or `README.md`.
- Bypass path-traversal guards in wallpaper/cache path resolvers or break atomic cache writes (`.tmp` + rename).
