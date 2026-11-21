# Как помочь проекту

Спасибо, что хотите помочь! Баги и идеи — в [Issues](https://github.com/LazerProOk1/soundcloud_mod/issues/new/choose),
вопросы и обсуждения — в [Discussions](https://github.com/LazerProOk1/soundcloud_mod/discussions).

## Прежде чем писать код

Для всего крупнее опечатки сначала откройте issue или обсуждение: так вы не потратите время на то, что
не войдёт в приложение. Небольшие исправления можно присылать сразу.

## Сборка

Нужны Node.js 22+, pnpm 10+ и Rust stable (на Linux — `libwebkit2gtk-4.1-dev`,
`libayatana-appindicator3-dev`, `librsvg2-dev`, `libasound2-dev`).

```bash
cd desktop
pnpm install --frozen-lockfile
pnpm tauri dev
```

Интерфейс работает только внутри окна Tauri: в обычном браузере на `localhost:1420` будет чёрный экран.
Первая сборка Rust-части долгая.

## Проверки перед PR

```bash
# из desktop/
pnpm biome ci src/
pnpm build
node --experimental-strip-types --test src/lib/__tests__/*.test.ts

# из desktop/src-tauri/, если меняли Rust
cargo test --lib
cargo clippy --all-targets
```

## Правила

Архитектура, команды и соглашения подробно описаны в [`AGENTS.md`](../AGENTS.md). Коротко:

- **Строки интерфейса** — только через i18n, и в `en.json`, и в `ru.json`.
- **Комментарии в коде** — на английском.
- **Форматирование** — Biome: одинарные кавычки, 2 пробела, ширина 100.
- **Коммиты** — [Conventional Commits](https://www.conventionalcommits.org/ru/):
  `fix(player): keep volume after track change`. Один коммит — одно логическое изменение.
- **Новые зависимости** (npm или Cargo) — сначала обсудите в issue.
- **Интерфейс** — сохраняйте стиль Liquid Glass и проверяйте режим без стекла и `prefers-reduced-motion`.
  К PR с изменениями интерфейса приложите скриншот из запущенного приложения.

## Лицензия

Присылая PR, вы соглашаетесь, что ваш код распространяется под [лицензией MIT](../LICENSE).
