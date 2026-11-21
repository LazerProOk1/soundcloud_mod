<div align="center">

<img src="docs/banner.webp" alt="SoundCloud Mod" width="100%" />

<br/>

[![Release](https://img.shields.io/github/v/release/LazerProOk1/soundcloud_mod?style=flat-square&color=ff5500&label=release)](https://github.com/LazerProOk1/soundcloud_mod/releases/latest)
[![Windows](https://img.shields.io/badge/Windows-10%20%C2%B7%2011-0078D4?style=flat-square&logo=windows&logoColor=white)](https://github.com/LazerProOk1/soundcloud_mod/releases/latest)
[![Linux](https://img.shields.io/badge/Linux-AppImage%20%C2%B7%20DEB%20%C2%B7%20RPM-E95420?style=flat-square&logo=linux&logoColor=white)](https://github.com/LazerProOk1/soundcloud_mod/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-334155?style=flat-square)](LICENSE)

Неофициальный клиент SoundCloud для Windows и Linux.<br/>
Без рекламы и капчи, работает в России.

[Скачать](https://github.com/LazerProOk1/soundcloud_mod/releases/latest) ·
[Сообщить о проблеме](https://github.com/LazerProOk1/soundcloud_mod/issues)

</div>

<img src="docs/screenshots/home.webp" alt="Моя волна" width="100%" />

## Возможности

- **Моя волна.** Бесконечный поток под ваш вкус с режимами «Фокус», «Энергия», «Чилл», «Ночь»,
  «Тренировка». Кнопки «Не то» и «Ещё такого» меняют то, что будет дальше. Волну можно запустить
  от любого артиста.
- **Каталог.** Новые релизы, артисты в тренде, чарты по жанрам, релизы по годам и рекомендации
  по вашим лайкам.
- **Медиатека.** Лайки, плейлисты, подписки, история, суперлайки и дизлайки. Понравившиеся чужие
  плейлисты можно закрепить в боковой панели.
- **Офлайн.** Прослушанные треки кэшируются, лайки можно скачать целиком — без сети играет то,
  что уже на диске.
- **Звук.** Собственный движок на Rust: 10-полосный эквалайзер, кроссфейд, обрезка тишины,
  выравнивание громкости, скорость воспроизведения, таймер сна.
- **Текст песен** с синхронизацией по строкам.
- **Импорт** плейлистов и лайков из Spotify и Яндекс Музыки.
- **Обновления** ставятся из приложения (установщик на Windows, AppImage на Linux).
- **Discord** показывает, что сейчас играет.

<p align="center">
  <img src="docs/screenshots/catalog.webp" alt="Каталог" width="49%" />
  <img src="docs/screenshots/artist.webp" alt="Страница артиста" width="49%" />
</p>
<p align="center">
  <img src="docs/screenshots/library.webp" alt="Любимые треки" width="49%" />
  <img src="docs/screenshots/settings-cache.webp" alt="Кэш" width="49%" />
</p>

## Стили интерфейса

Три стиля панелей на выбор в «Настройки → Интерфейс», плюс цвет акцента, обои, шрифт и масштаб.

<p align="center">
  <img src="docs/screenshots/liquid-home.webp" alt="Liquid Glass" width="32%" />
  <img src="docs/screenshots/home.webp" alt="Матовое стекло" width="32%" />
  <img src="docs/screenshots/flat-home.webp" alt="Просто" width="32%" />
</p>
<p align="center"><sub>Liquid Glass · Матовое стекло (по умолчанию) · Просто</sub></p>

## Установка

Файлы — на странице [последнего релиза](https://github.com/LazerProOk1/soundcloud_mod/releases/latest).

| Система | Файл | Примечание |
|---|---|---|
| Windows 10 / 11 | `installer-windows-x64.exe` | Обновляется сам. При предупреждении SmartScreen: «Подробнее» → «Выполнить в любом случае». |
| Windows 10 / 11 | `portable-windows-x64.zip` | Без установки, обновлять вручную. |
| Linux | `x86_64.AppImage` | `chmod +x` и запустить. Обновляется сам. |
| Ubuntu / Debian | `amd64.deb` | `sudo apt install ./soundcloud-mod-*.deb` |
| Fedora / openSUSE | `x86_64.rpm` | `sudo dnf install ./soundcloud-mod-*.rpm` |

## Горячие клавиши

| Клавиша | Действие | Клавиша | Действие |
|---|---|---|---|
| `Space` | Пауза / воспроизведение | `Q` | Очередь |
| `←` / `→` | Перемотка на ±5 с | `L` | Текст песни |
| `↑` / `↓` | Громкость | `[` | Боковая панель |
| `N` / `P` | Следующий / предыдущий трек | `F11` | Полный экран |
| `S` / `R` | Перемешивание / повтор | `Ctrl + K` | Поиск |
| `M` | Выключить звук | `Ctrl + /` | Все горячие клавиши |

## Вопросы

**Нужен ли VPN?** Нет, запросы к SoundCloud идут через прокси.

**Безопасно ли для аккаунта?** Приложение не ставит лайки и не подписывается само — только по
вашему действию.

**Где хранятся данные?** Только на вашем компьютере. Резервную копию настроек можно сохранить в
«Настройки → Резервная копия».

## Сборка

Tauri 2, React 19, TypeScript, Tailwind CSS 4, аудиодвижок на Rust (`rodio`, Symphonia).
Нужны Node.js 22+, pnpm 10+ и Rust stable.

```bash
git clone https://github.com/LazerProOk1/soundcloud_mod.git
cd soundcloud_mod/desktop
pnpm install
pnpm tauri dev
```

Проверки и правила для кода — в [AGENTS.md](AGENTS.md).

## Благодарности

Основано на [SoundCloud-Desktop](https://github.com/zxcloli666/SoundCloud-Desktop) (MIT).
Тексты песен — [LRCLib](https://lrclib.net). Проект развивает один человек в свободное время.

## Лицензия

[MIT](LICENSE). Проект не связан с SoundCloud; SoundCloud — товарный знак SoundCloud Global
Limited & Co. KG. Скриншоты сняты в приложении на вымышленных треках и обложках.
