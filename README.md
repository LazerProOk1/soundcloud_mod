<div align="center">

<img src="docs/banner.png" alt="SoundCloud Mod — Desktop Client" width="100%" />

<br/>
<br/>

[![Release](https://img.shields.io/github/v/release/LazerProOk1/soundcloud_mod?style=for-the-badge&color=ff5500&label=Release)](https://github.com/LazerProOk1/soundcloud_mod/releases/latest)
[![Windows](https://img.shields.io/badge/Windows-NSIS%20%2B%20Portable-0078D4?style=for-the-badge&logo=windows)](https://github.com/LazerProOk1/soundcloud_mod/releases/latest)
[![Ubuntu](https://img.shields.io/badge/Ubuntu-DEB%20%2F%20AppImage%20%2F%20Flatpak-E95420?style=for-the-badge&logo=ubuntu&logoColor=white)](https://github.com/LazerProOk1/soundcloud_mod/releases/latest)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?style=for-the-badge&logo=tauri&logoColor=111)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=111)](https://react.dev)
[![Rust](https://img.shields.io/badge/Rust-Audio%20Engine-EA580C?style=for-the-badge&logo=rust)](https://www.rust-lang.org)
[![License](https://img.shields.io/badge/License-MIT-334155?style=for-the-badge)](LICENSE)

<br/>

**Нативный клиент SoundCloud для Windows и Linux в эстетике Liquid Glass.**  
Без рекламы и вкладки браузера: собственный аудиодвижок на Rust, локальный LRU-кэш треков,  
синхронизированная караоке-лирика, бесплатная **Star-аура**, персональная волна **SoundWave** и **Discord Rich Presence**.

</div>

---

## Возможности

<table>
<tr>
<td width="50%" valign="top">

### Аудиодвижок (Rust)
- Собственный плеер на базе `rodio` + декодирование MP3/OGG/Opus без браузерного `<audio>`
- **10-полосный эквалайзер** с пресетами, ReplayGain-нормализация и кроссфейд
- Скорость воспроизведения, таймер сна, повтор, shuffle и перемотка колесом мыши (`Shift` — ±15 с)
- Глобальные медиаклавиши и управление из системного трея

### Интерфейс Liquid Glass
- Полупрозрачные стеклянные панели поверх живого mesh-градиента и динамической палитры обложки
- Режим без размытия (**No-Glass**) в настройках для максимальной производительности
- Панель «Сейчас играет» справа, полноэкранный плеер и мини-плеер поверх окон
- Свои шрифты (системные или из файла), пользовательский CSS, масштаб UI (`Ctrl` + колесо)
- Русский и английский интерфейс

</td>
<td width="50%" valign="top">

### Библиотека и офлайн-кэш
- Любимые треки, плейлисты, подписки и история прослушиваний
- Суперлайки, локальный список дизлайков и собственный порядок любимых треков
- Умный **кэш аудио и предзагрузка очереди** (параллельная загрузка HLS/progressive, защита пролайканных треков от вытеснения)
- Импорт библиотеки из **Яндекс Музыки** и сохранение треков в файл

### SoundWave, лирика и интеграции
- **SoundWave** — бесконечная персональная волна рекомендаций от трека или исполнителя с фильтром языков
- Синхронизированный текст с посимвольной караоке-подсветкой (**LRCLib** + **SoundCloud**) и FFT-визуализатором
- **Discord Rich Presence** с обложкой, таймером и названием трека
- Авторизация через аккаунт SoundCloud или **QR-код** с другого устройства

</td>
</tr>
</table>

---

## Горячие клавиши

| Клавиша | Действие | Клавиша | Действие |
|---|---|---|---|
| `Space` | Пауза / воспроизведение | `Q` | Открыть / закрыть очередь |
| `←` / `→` | Перемотка на ±5 с | `L` | Открыть / закрыть лирику |
| `↑` / `↓` | Громкость (ускорение при удержании) | `[` | Свернуть / развернуть боковую панель |
| `N` / `P` | Следующий / предыдущий трек | `F11` | Полноэкранный режим |
| `S` / `R` | Перемешивание / повтор | `/` или `Ctrl + K` | Поиск |
| `M` | Выключить / включить звук | `Ctrl + /` | Показать все горячие клавиши |

---

## Установка

### Windows (10 / 11 x64)
- **Установщик (NSIS):** скачайте `*_x64-setup.exe` со страницы [Releases](https://github.com/LazerProOk1/soundcloud_mod/releases/latest) и запустите установку. Если Windows SmartScreen покажет предупреждение о неизвестном издателе — нажмите **«Подробнее» → «Выполнить в любом случае»**.
- **Portable:** скачайте `*-windows-x64-portable.zip`, распакуйте в любую папку и запускайте `SoundCloud Mod.exe` без установки.

### Linux (Ubuntu / Debian / Flatpak)
- **Ubuntu / Debian:** скачайте `.deb` (`sudo apt install ./SoundCloud*.deb`) или универсальный `.AppImage` (`chmod +x SoundCloud*.AppImage && ./SoundCloud*.AppImage`). Также доступны `.rpm` и [Flatpak-манифест](.github/flatpak/io.github.LazerProOk1.soundcloudmod.yml).

> Приложение устанавливается с отдельным идентификатором (`com.lazerprook1.soundcloudmod`) и хранит настройки и кэш независимо от других клиентов.

**Системные требования:** Windows 10 / 11 (x64, WebView2 Runtime) или Linux x64 (`libwebkit2gtk-4.1`), ~200 МБ свободного места.

---

## Сборка из исходников

Необходимы **Node.js 20+**, **pnpm 10+** и **Rust (stable)**.

```bash
git clone https://github.com/LazerProOk1/soundcloud_mod.git
cd soundcloud_mod/desktop
pnpm install
```

Запуск в режиме разработки (hot-reload интерфейса + Rust-бэкенд):

```bash
pnpm tauri dev
```

Проверка кода и сборка NSIS-установщика:

```bash
pnpm check         # Biome lint + format
pnpm build         # TypeScript + Vite production build
pnpm tauri build   # Итоговый установщик в desktop/src-tauri/target/release/bundle/nsis/
```

---

## Технологический стек

| Слой | Технологии |
|---|---|
| Оболочка | [Tauri 2](https://tauri.app) (Rust) |
| Интерфейс | React 19, TypeScript, Tailwind CSS 4 |
| Состояние и запросы | Zustand 5, TanStack Query 5, dnd-kit |
| Аудио на Rust | `rodio`, Symphonia / Opus, 10-полосный EQ, ReplayGain, FFT-анализатор |
| Линтер и сборка | Biome, Vite, NSIS |

---

## Структура репозитория

```text
soundcloud_mod/
├── desktop/
│   ├── src/              # React 19 UI: страницы, Liquid Glass компоненты, stores, lib
│   └── src-tauri/        # Rust: audio engine, track_cache, image_cache, Discord RPC, tray
├── backend/              # Серверная часть (Rust/Axum прокси и кэш к API SoundCloud)
└── docs/                 # Графические материалы для README
```

---

## Благодарности и лицензия

- Синхронизированная лирика предоставляется через [LRCLib](https://lrclib.net).
- Распространяется под лицензией [MIT](LICENSE). Проект не аффилирован с SoundCloud; SoundCloud является товарным знаком SoundCloud Global Limited & Co. KG.
