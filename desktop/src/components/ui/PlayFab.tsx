import { useTranslation } from 'react-i18next';

const icon = (show: boolean) =>
  `absolute inset-0 flex items-center justify-center transition-all duration-300 ease-[var(--ease-spring)] ${
    show ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 -rotate-90'
  }`;

/** The big round play / pause button of list and album pages; the icons morph into each other. */
export function PlayFab({
  playing,
  disabled,
  onClick,
}: {
  playing: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={playing ? t('common.pause', 'Pause') : t('common.play', 'Play')}
      className="play-fab relative w-14 h-14 shrink-0 rounded-full ui-accent flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.35)] cursor-pointer"
    >
      <span className={icon(!playing)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      <span className={icon(playing)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
        </svg>
      </span>
    </button>
  );
}
