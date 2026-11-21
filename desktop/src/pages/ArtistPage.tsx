import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { ArtistAboutTab } from '../components/artist/ArtistAboutTab';
import { ArtistAlbumsTab } from '../components/artist/ArtistAlbumsTab';
import { ArtistHero } from '../components/artist/ArtistHero';
import { ArtistRelatedTab } from '../components/artist/ArtistRelatedTab';
import { ArtistTracksTab, type TracksView } from '../components/artist/ArtistTracksTab';
import type { ArtistTabId, TracksSort } from '../components/artist/types';
import { useArtistDetail } from '../components/artist/useArtistData';
import { ArtistSoundWave } from '../components/artist/wave/ArtistSoundWave';
import { USER_PAGE_KEYFRAMES } from '../components/user/keyframes';
import { type TabDescriptor, TabDock } from '../components/user/TabDock';
import { artistAuraForId } from '../lib/aura';
import { Loader2 } from '../lib/icons';

export function ArtistPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();

  const detail = useArtistDetail(id);
  const artist = detail.data;

  const aura = useMemo(() => artistAuraForId(id), [id]);

  const [tab, setTab] = useState<ArtistTabId>('tracks');
  const [primarySort, setPrimarySort] = useState<TracksSort>('popular');
  const [featuredSort, setFeaturedSort] = useState<TracksSort>('popular');
  const [primaryView, setPrimaryView] = useState<TracksView>('list');
  const [featuredView, setFeaturedView] = useState<TracksView>('list');

  const tabs = useMemo<ReadonlyArray<TabDescriptor<ArtistTabId>>>(() => {
    if (!artist) return [];
    const out: TabDescriptor<ArtistTabId>[] = [
      { id: 'tracks', label: t('artist.tracks'), count: artist.track_count_primary },
    ];
    if (artist.track_count_featured > 0) {
      out.push({
        id: 'appears',
        label: t('artist.appearsOn'),
        count: artist.track_count_featured,
      });
    }
    out.push({ id: 'albums', label: t('artist.albums'), count: artist.album_count });
    out.push({
      id: 'related',
      label: t('artist.related'),
      count: artist.related_artists.length,
    });
    out.push({ id: 'about', label: t('artist.about'), count: undefined });
    return out;
  }, [artist, t]);

  if (detail.isLoading || (!artist && !detail.error)) {
    return (
      <div className="relative w-full min-h-screen flex items-center justify-center">
        <Loader2 size={28} className="text-white/30 animate-spin" />
      </div>
    );
  }

  if (detail.error || !artist) {
    return (
      <div className="relative w-full min-h-screen flex items-center justify-center text-white/40 text-sm">
        {t('common.error')}
      </div>
    );
  }

  return (
    <>
      <style>{USER_PAGE_KEYFRAMES}</style>
      <div className="relative w-full min-h-screen">
        <div
          className="relative z-10 w-full max-w-[1480px] mx-auto px-4 md:px-8 pt-10 md:pt-16 pb-32"
          style={{ isolation: 'isolate' }}
        >
          <ArtistHero artist={artist} />

          <div className="mt-8">
            <ArtistSoundWave artistId={artist.id} artistName={artist.name} aura={aura} />
          </div>

          <div className="mt-10 mb-8">
            <TabDock<ArtistTabId> tabs={tabs} active={tab} onChange={setTab} />
          </div>

          <div>
            {tab === 'tracks' && (
              <ArtistTracksTab
                artistId={artist.id}
                role="primary"
                sort={primarySort}
                onSortChange={setPrimarySort}
                view={primaryView}
                onViewChange={setPrimaryView}
              />
            )}
            {tab === 'appears' && (
              <ArtistTracksTab
                artistId={artist.id}
                role="featured"
                sort={featuredSort}
                onSortChange={setFeaturedSort}
                view={featuredView}
                onViewChange={setFeaturedView}
              />
            )}
            {tab === 'albums' && <ArtistAlbumsTab artistId={artist.id} />}
            {tab === 'related' && <ArtistRelatedTab related={artist.related_artists} />}
            {tab === 'about' && <ArtistAboutTab artist={artist} />}
          </div>
        </div>
      </div>
    </>
  );
}
