# SoundCloud Mod (`LazerProOk1/soundcloud_mod`)

Desktop SoundCloud client built with **Tauri 2**, **React 19 + TypeScript + Tailwind CSS 4**, and a **Rust** audio/cache engine (`desktop/`). The app talks to an external API (`API_BASE` /
`STREAMING_BASE` in `desktop/src/lib/constants.ts`); no server code lives in this repo.

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
```

### Environment gotchas

- **The UI only runs inside Tauri.** Opening `http://localhost:1420` in a normal browser gives a black screen
  (`invoke` is undefined). To drive the real window, start `tauri dev` with
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` (Windows) and attach over CDP.
- **First `tauri dev` build is slow** (tens of minutes for the Rust crate); run it in the background.
- **In a git worktree** whose `node_modules` is a symlink, `pnpm <script>` tries to reinstall and aborts.
  Call binaries directly (`node_modules/.bin/biome`, `tsc`, `vite`) or override `beforeDevCommand` with
  `--config '{"build":{"beforeDevCommand":"node node_modules/vite/bin/vite.js"}}'`.
- **`tauri dev` restarts the app** when anything under `src-tauri/` changes, and editing a locale JSON
  reloads the page: both stop playback. Batch such edits when someone is listening.

## Docs

- `PLAN.md` (repo root, local only — excluded via `.git/info/exclude`) — the live backlog, if present. Read it
  before picking up work; remove finished items and add new findings as you go.
- `NOTES.md` (repo root, local only) — working notes: gotchas found the hard way, where things live, what a
  branch is in the middle of. Read it at the start; add what the next person would otherwise rediscover.
- `docs/audit-2026-11-17.md` (local only, like `PLAN.md`) — historical audit report, if present.

## Architecture & Directory Map

- `desktop/src/pages/` — Top-level routes (`Home.tsx`, `SoundWavePage.tsx`, `Discover.tsx`, `Search.tsx`, `Library.tsx`, `OfflinePage.tsx`, `UserPage.tsx`, `ArtistPage.tsx`, `AlbumPage.tsx`, `TrackPage.tsx`, `Settings.tsx`).
- `desktop/src/components/` — Liquid Glass UI (`layout/`, `ui/`, `music/soundwave/`, `user/`, `artist/`, `album/`).
- `desktop/src/lib/` — Audio bridge (`audio.ts`), disk/offline cache (`cache.ts`, `offline-index.ts`), streaming (`streaming.ts`), preset wallpapers (`wallpapers.ts`), JSON backup (`backup.ts`), aura helpers (`aura.ts`, `color.ts`), React Query hooks (`hooks.ts`).
- `desktop/src/stores/` — Zustand stores (`auth.ts`, `player.ts`, `settings.ts`, `app-status.ts`).
- `desktop/src-tauri/src/` — Native Rust engine: `audio/` (`rodio`, Symphonia/Opus, 10-band EQ, ReplayGain, FFT), `track_cache/` (LRU + protected likes + HLS/progressive downloader), `network/` (image cache), `discord_rpc.rs`.
- `.github/workflows/ci.yml` & `desktop/src-tauri/tauri.conf.json` — CI checks and Windows (NSIS + Portable ZIP) / Ubuntu (DEB, AppImage, RPM) / Flatpak packaging.

## Coding Conventions

- **Design system:** Preserve the Liquid Glass aesthetic (`backdrop-filter` glass layers, specular hairline borders, dynamic artwork color ambiance) while supporting `.no-glass` fallback and `prefers-reduced-motion`.
- **i18n:** Every user-visible string belongs in both `desktop/src/i18n/locales/en.json` and `ru.json`; never hardcode UI copy.
- **Formatting:** Biome enforces single quotes, trailing commas, semicolons, 2-space indent, and `lineWidth: 100` in `desktop/src/`.
- **Comments in English.** Code comments and doc-comments are English only. When you edit a file that still has
  Russian comments, translate the ones in the code you touch (or the whole file if it is small) as part of the same
  change. Do not translate user-visible strings — those live in the locale files. Docs under `docs/` may stay
  in Russian.
- **Auras & Wallpapers:** Star gating is gone — every artist/album page gets a deterministic aura from `aura.ts` (`auraFromHex`, `artistAuraForId`). Built-in wallpapers live under `desktop/public/wallpapers/` and resolve safely via `preset:<file>`.

## Reuse Before You Write

Search first (`rg` in `desktop/src/lib`, `desktop/src/components/ui`, `desktop/src/components/settings`); a
second copy of an existing helper is the most common mistake here. Known building blocks:

- **UI kit** (`components/ui/`): `PlayFab` (round play/pause), `Segmented`, `LiquidSwitch`, `HorizontalScroll`
  (carousels), `VirtualList` / `VirtualGrid`, `GlassHeroPanel`, `LetterAvatar`, `CopyLinkButton`,
  `ShelfSkeleton`. Settings rows: `SettingsSection` / `SettingRow` (`components/settings/SettingsKit.tsx`).
- **Style classes** (`index.css`): `ui-accent`, `ui-primary`, `bar-control`, `ui-card`, `ui-float`,
  `app-surface`, `liquid-panel-heavy`. Three interface styles: `html.no-glass` (Plain), no class (Frosted),
  `html.liquid-glass`. Never animate `opacity` on a glass panel or its parent: Chromium drops the
  `backdrop-filter` until the animation ends.
- **Data**: `api()` (`lib/api.ts`), React Query hooks in `lib/hooks.ts` (`useLikedTracks`, `useHistory`,
  `useMyPlaylists`…) and `lib/discover.ts`; dislikes in `lib/dislikes.ts`.
- **Helpers**: `openExternalUrl`, `reportProblem` (`lib/report.ts`), catalog helpers in
  `lib/discover-utils.ts` (`dedupeReleases`, `freshReleases`, `spreadShelf`, `realImage`), `trackAlbum`
  (`components/music/TrackTableRow.tsx`).

## Keeping Changes Lean

- Change only what the task needs; no drive-by refactors, no "while I'm here".
- No speculative options, wrappers or abstractions with one caller; delete code that a change made unused.
- Comments say *why*, never restate the code. No commented-out code, no TODO without a `PLAN.md` item.
- A new pure function in `lib/` gets a small test in `lib/__tests__/`.

## Branches

- New features go on `feature/<short-name>` and reach `main` through a pull request; CI (lint, build,
  tests) runs on it. Small fixes and polish may go straight to `main`.
- Never force-push `main`; keep a feature branch rebased on it before review.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <subject>`, a blank line, an
optional body, an optional footer.

- **type:** `feat` · `fix` · `perf` · `refactor` · `style` (formatting only) · `test` · `docs` · `build` ·
  `ci` · `chore` · `revert`.
- **scope** (optional, one word): `player`, `wave`, `library`, `search`, `settings`, `lyrics`, `offline`,
  `ui`, `i18n`, `cache`, `audio`, `tauri`, `deps`, `docs`, `ci`.
- **subject:** English, imperative, lowercase, no trailing period, ≤ 72 characters
  (`fix(library): use plural forms for track counts`, not `Fixed plurals.`).
- **body:** what changed and *why*; wrap at 100 columns. Skip it for trivial changes.
- **footer:** `BREAKING CHANGE: <what breaks>` for incompatible changes (persisted store schema, backend API,
  removed setting); `Co-Authored-By:` trailers go last.
- One logical change per commit; do not mix a refactor with a behaviour change.
- Author every commit as `LazerProOk1 <139680797+LazerProOk1@users.noreply.github.com>`:
  `git commit --author="LazerProOk1 <139680797+LazerProOk1@users.noreply.github.com>" -m "..."`
- **Releases** are an annotated tag `vX.Y.Z` whose message is the release intro in Markdown; create it with
  `git tag -a vX.Y.Z --cleanup=verbatim -F notes.md`, or git strips every `#` heading line.

## Definition of Done

1. `pnpm biome ci src/`, `pnpm build` and the unit tests pass (plus `cargo test` / `cargo clippy` for the Rust
   crate you touched, when the toolchain can build it).
2. Edited JSON (`locales/*.json`, `tauri.conf.json`, `biome.json`) parses, and both locales have the same keys.
3. UI changes were looked at in the running app, or the summary says they were not.
4. `PLAN.md` (when present) reflects what was finished or found.
5. The summary lists anything that was not verified.

## Boundaries

### Always
- Meet the Definition of Done before reporting work as finished.
- When blocked (missing toolchain, failing check you did not cause, unclear requirement), stop and report it
  instead of working around it.

### Ask First
- Changing Tauri app identifier (`com.lazerprook1.soundcloudmod`), or breaking persisted `tauriStorage` store schemas without migration.
- Adding a new npm or Cargo dependency.
- Removing a user-facing feature, route or setting (even if it looks unused).

### Never
- Include AI assistant names or tool signatures in code comments or documentation.
  (A `Co-Authored-By:` trailer in commit messages and an attribution line in PR descriptions are allowed.)
- Add AI-generated UI screenshots or mockups pretending to show the running application to `docs/` or `README.md`.
- Bypass path-traversal guards in wallpaper/cache path resolvers or break atomic cache writes (`.tmp` + rename).
