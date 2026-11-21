import * as Dialog from '@radix-ui/react-dialog';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Compass, Headphones, Moon, Play, Sparkles, X, Zap } from '../../../lib/icons';
import { WAVE_VIBES, type WaveMode, type WaveVibeId } from '../../../lib/wave-vibes';
import { LiquidSwitch } from '../../ui/LiquidSwitch';

const VIBE_ICON: Record<WaveVibeId, React.ReactNode> = {
  all: <Sparkles size={16} />,
  focus: <Headphones size={16} />,
  energy: <Zap size={16} />,
  chill: <Compass size={16} />,
  night: <Moon size={16} />,
  workout: <Activity size={16} />,
};

/** "Character" is a friendlier view of mode + hide-liked. */
type Character = 'familiar' | 'unfamiliar' | 'diverse';

/** Languages that count as "foreign" for the quick choice. */
const FOREIGN = ['en', 'es', 'de', 'fr', 'it', 'pt', 'ja', 'ko', 'pl'];

type LangChoice = 'any' | 'ru' | 'foreign';

function langChoice(langs: string[]): LangChoice {
  if (langs.length === 0) return 'any';
  if (langs.length === 1 && langs[0] === 'ru') return 'ru';
  if (!langs.includes('ru')) return 'foreign';
  return 'any';
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-2 h-11 px-5 rounded-full text-[15px] font-semibold cursor-pointer ${
        active ? 'ui-primary' : 'bar-control text-white'
      }`}
    >
      {children}
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-white/50">{title}</p>
      <div className="flex flex-wrap gap-2.5">{children}</div>
    </div>
  );
}

/** Wave tuning in one place: character, mood and language, then "Listen". */
export const WaveTuneDialog = React.memo(function WaveTuneDialog({
  open,
  onOpenChange,
  mode,
  hideLiked,
  hideVariants,
  onHideVariantsChange,
  vibe,
  languages,
  onModeChange,
  onHideLikedChange,
  onVibeChange,
  onLanguagesChange,
  onListen,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: WaveMode;
  hideLiked: boolean;
  hideVariants: boolean;
  onHideVariantsChange: (v: boolean) => void;
  vibe: WaveVibeId;
  languages: string[];
  onModeChange: (m: WaveMode) => void;
  onHideLikedChange: (v: boolean) => void;
  onVibeChange: (v: WaveVibeId) => void;
  onLanguagesChange: (l: string[]) => void;
  onListen: () => void;
}) {
  const { t } = useTranslation();
  const character: Character =
    mode === 'diverse' ? 'diverse' : hideLiked ? 'unfamiliar' : 'familiar';
  const setCharacter = (c: Character) => {
    onModeChange(c === 'diverse' ? 'diverse' : 'similar');
    onHideLikedChange(c !== 'familiar');
  };
  const lang = langChoice(languages);
  const setLang = (c: LangChoice) =>
    onLanguagesChange(c === 'any' ? [] : c === 'ru' ? ['ru'] : FOREIGN);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/65" />
        <Dialog.Content className="fixed z-[80] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[680px] max-w-[94vw] max-h-[90vh] overflow-y-auto rounded-2xl app-surface p-8 outline-none">
          <div className="flex items-start justify-between mb-7">
            <Dialog.Title className="text-[28px] font-bold text-white tracking-tight">
              {t('waveTune.title')}
            </Dialog.Title>
            <Dialog.Close className="w-9 h-9 -mr-2 rounded-full flex items-center justify-center ui-icon text-white/60 hover:text-white cursor-pointer">
              <X size={20} />
            </Dialog.Close>
          </div>

          <div className="space-y-7">
            <div className="space-y-2">
              <Group title={t('waveTune.character')}>
                {(['familiar', 'unfamiliar', 'diverse'] as const).map((c) => (
                  <Chip key={c} active={character === c} onClick={() => setCharacter(c)}>
                    {t(`waveTune.char.${c}`)}
                  </Chip>
                ))}
              </Group>
              <p className="text-[13px] text-white/50">{t(`waveTune.charDesc.${character}`)}</p>
            </div>

            <Group title={t('waveTune.mood')}>
              {WAVE_VIBES.map((v) => (
                <Chip key={v.id} active={vibe === v.id} onClick={() => onVibeChange(v.id)}>
                  <span style={{ color: vibe === v.id ? undefined : v.tint }}>
                    {VIBE_ICON[v.id]}
                  </span>
                  {t(`soundwave.vibes.${v.id}`)}
                </Chip>
              ))}
            </Group>

            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-[15px] font-semibold text-white">{t('waveTune.noVariants')}</p>
                <p className="text-[13px] text-white/50 mt-0.5">{t('waveTune.noVariantsDesc')}</p>
              </div>
              <LiquidSwitch checked={hideVariants} onChange={onHideVariantsChange} />
            </div>

            <Group title={t('waveTune.language')}>
              {(['any', 'ru', 'foreign'] as const).map((c) => (
                <Chip key={c} active={lang === c} onClick={() => setLang(c)}>
                  {t(`waveTune.lang.${c}`)}
                </Chip>
              ))}
            </Group>
          </div>

          <div className="flex items-center justify-between mt-10">
            <button
              type="button"
              onClick={() => {
                setCharacter('unfamiliar');
                onHideVariantsChange(true);
                onVibeChange('all');
                onLanguagesChange([]);
              }}
              className="text-[15px] font-bold text-white/60 hover:text-white cursor-pointer"
            >
              {t('waveTune.reset')}
            </button>
            <button
              type="button"
              onClick={() => {
                onListen();
                onOpenChange(false);
              }}
              className="flex items-center gap-2 h-12 px-7 rounded-full ui-accent text-[15px] font-bold cursor-pointer hover:scale-[1.03]"
            >
              <Play size={16} fill="currentColor" strokeWidth={0} />
              {t('waveTune.listen')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});
