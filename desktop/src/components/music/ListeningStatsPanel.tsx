import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { HistoryEntry } from '../../lib/hooks';
import { summarizeListening } from '../../lib/listening-stats';
import { Segmented } from '../ui/Segmented';

const WINDOW_30 = '30';
const WINDOW_ALL = 'all';
type StatsWindow = typeof WINDOW_30 | typeof WINDOW_ALL;

function formatMinutes(ms: number): number {
  return Math.max(1, Math.round(ms / 60_000));
}

/** Totals and leaders for the listening history, between the header and the track table. */
export function ListeningStatsPanel({ entries }: { entries: HistoryEntry[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [statsWindow, setStatsWindow] = useState<StatsWindow>(WINDOW_30);
  const stats = useMemo(
    () => summarizeListening(entries, { days: statsWindow === WINDOW_ALL ? 0 : 30 }),
    [entries, statsWindow],
  );

  const metric = (value: number, label: string) => (
    <div
      key={label}
      className="flex min-w-[92px] flex-col gap-0.5 rounded-xl bg-white/[0.04] px-4 py-2.5"
    >
      <span className="text-[18px] font-semibold tabular-nums text-white">{value}</span>
      <span className="text-[11px] uppercase tracking-wide text-white/40">{label}</span>
    </div>
  );

  return (
    <section className="ui-card flex flex-col gap-4 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-white">
          {t('stats.title', 'Listening totals')}
        </h2>
        <Segmented
          value={statsWindow}
          onChange={setStatsWindow}
          options={[
            { id: WINDOW_30, label: t('stats.window30', '30 days') },
            { id: WINDOW_ALL, label: t('stats.windowAll', 'All time') },
          ]}
        />
      </div>

      {stats.plays === 0 ? (
        <p className="text-[13px] text-white/45">
          {t('stats.empty', 'Nothing played in this period yet.')}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {metric(stats.plays, t('stats.plays', 'plays'))}
            {metric(stats.minutes, t('stats.minutes', 'minutes'))}
            {metric(stats.artists, t('stats.artists', 'artists'))}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-white/35">
                {t('stats.topArtists', 'Top artists')}
              </span>
              {stats.topArtists.map((artist) => (
                <button
                  key={artist.urn ?? artist.name}
                  type="button"
                  disabled={!artist.urn}
                  onClick={
                    artist.urn
                      ? () => navigate(`/user/${encodeURIComponent(artist.urn as string)}`)
                      : undefined
                  }
                  className="press flex items-baseline justify-between gap-3 rounded-lg px-1 py-1 text-left text-[13px] text-white/80 enabled:cursor-pointer enabled:hover:text-white"
                >
                  <span className="truncate">{artist.name}</span>
                  <span className="shrink-0 tabular-nums text-white/40">
                    {formatMinutes(artist.minutes)} {t('stats.minShort', 'min')}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-white/35">
                {t('stats.topTracks', 'Top tracks')}
              </span>
              {stats.topTracks.map((track) => (
                <button
                  key={track.urn}
                  type="button"
                  onClick={() => navigate(`/track/${encodeURIComponent(track.urn)}`)}
                  className="press flex items-baseline justify-between gap-3 rounded-lg px-1 py-1 text-left text-[13px] text-white/80 cursor-pointer hover:text-white"
                >
                  <span className="truncate">
                    {track.title}
                    <span className="text-white/40"> · {track.artist}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-white/40">
                    {formatMinutes(track.minutes)} {t('stats.minShort', 'min')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
