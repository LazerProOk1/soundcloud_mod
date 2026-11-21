/**
 * Discover — the catalog page.
 *
 * Server catalog (`/discover/*`): spotlight, fresh releases, trending artists, popular albums,
 * releases by year, artists by style and the full browsable catalog. Next to it: genre charts
 * from SoundCloud search and personal shelves built from the user's likes and followings.
 * Every section hides itself when its data is missing, so the page never shows empty blocks.
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  AlbumTile,
  ArtistTile,
  CatalogSection,
  Pills,
  type SectionId,
  Shelf,
  SpotlightCard,
} from '../components/discover/CatalogCards';
import { TrackCard } from '../components/music/TrackCard';
import { TrackTableRow } from '../components/music/TrackTableRow';
import { Segmented } from '../components/ui/Segmented';
import { Skeleton } from '../components/ui/Skeleton';
import {
  type AlbumSort,
  type ArtistSort,
  fetchDiscoverRandom,
  useDiscoverAlbums,
  useDiscoverAlbumsByYear,
  useDiscoverArtists,
  useDiscoverSpotlight,
  useDiscoverSummary,
  useDiscoverTags,
  useGenreChart,
} from '../lib/discover';
import { CHART_GENRES, dedupeReleases } from '../lib/discover-utils';
import { fc } from '../lib/formatters';
import {
  useBatchTrackHydration,
  useDiscoverData,
  useFollowingTracks,
  useLikedTracks,
  useRecommendedTracks,
  useRelatedPool,
} from '../lib/hooks';
import {
  Activity,
  AudioLines,
  Calendar,
  Compass,
  Disc3,
  Hash,
  Loader2,
  Music,
  Shuffle,
  Sparkles,
  Star,
  Users,
  Zap,
} from '../lib/icons';
import type { Track } from '../stores/player';

const ICON = '';

function TrackShelf({ tracks, loading }: { tracks: Track[]; loading: boolean }) {
  return (
    <Shelf loading={loading}>
      {tracks.map((track) => (
        <div key={track.urn} className="w-[180px] shrink-0">
          <TrackCard track={track} queue={tracks} />
        </div>
      ))}
    </Shelf>
  );
}

/* ── Hero ──────────────────────────────────────────────────── */

function DiscoverHero() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: summary } = useDiscoverSummary();
  const [surprising, setSurprising] = useState(false);

  const surprise = async () => {
    if (surprising) return;
    setSurprising(true);
    const kind = Math.random() < 0.5 ? 'album' : 'artist';
    const id = await fetchDiscoverRandom(kind);
    setSurprising(false);
    if (id) navigate(`/${kind}/${encodeURIComponent(id)}`);
  };

  const button =
    'press inline-flex h-10 items-center gap-2 rounded-full bg-white/[0.07] px-4 text-[13px] font-semibold text-white/85 hover:bg-white/[0.12] hover:text-white cursor-pointer';

  return (
    <section className="flex flex-wrap items-end justify-between gap-4 pt-1">
      <div>
        <h1 className="text-[32px] font-extrabold leading-tight tracking-tight text-white">
          {t('nav.discover')}
        </h1>
        <p className="mt-1 text-[14px] text-white/50">
          {summary
            ? t('discover.stats', {
                artists: fc(summary.artists_count),
                albums: fc(summary.albums_count),
              })
            : t('discover.subtitle')}
          {summary && summary.fresh_count > 0 && (
            <span className="text-white/35">
              {' · '}
              {t('discover.freshStat', {
                count: summary.fresh_count,
                days: summary.fresh_window_days,
              })}
            </span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {summary && (
          <button type="button" onClick={surprise} className={button} disabled={surprising}>
            {surprising ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Shuffle size={16} style={{ color: 'var(--color-accent)' }} />
            )}
            {t('discover.surprise')}
          </button>
        )}
        <button type="button" onClick={() => navigate('/home')} className={button}>
          <AudioLines size={16} style={{ color: 'var(--color-accent)' }} />
          {t('nav.soundwave')}
        </button>
      </div>
    </section>
  );
}

/* ── Server catalog shelves ────────────────────────────────── */

const SpotlightShelf = React.memo(function SpotlightShelf() {
  const { t } = useTranslation();
  const { data = [], isLoading, isError } = useDiscoverSpotlight(12);
  if (isError || (!isLoading && data.length === 0)) return null;
  return (
    <CatalogSection
      id="spotlight"
      title={t('discover.spotlight')}
      icon={<Star size={20} className={ICON} />}
    >
      <Shelf loading={isLoading}>
        {data.map((item) => (
          <SpotlightCard
            key={item.kind === 'artist' ? `a${item.artist.id}` : `l${item.album.id}`}
            item={item}
          />
        ))}
      </Shelf>
    </CatalogSection>
  );
});

const AlbumShelf = React.memo(function AlbumShelf({
  id,
  sort,
  title,
  icon,
}: {
  id: SectionId;
  sort: AlbumSort;
  title: string;
  icon: React.ReactNode;
}) {
  const { items, isLoading, isError } = useDiscoverAlbums(sort, 40);
  const albums = useMemo(() => dedupeReleases(items), [items]);
  if (isError || (!isLoading && albums.length === 0)) return null;
  return (
    <CatalogSection id={id} title={title} icon={icon}>
      <Shelf loading={isLoading}>
        {albums.map((album) => (
          <AlbumTile key={album.id} album={album} />
        ))}
      </Shelf>
    </CatalogSection>
  );
});

const ArtistShelf = React.memo(function ArtistShelf({
  id,
  sort,
  title,
  icon,
}: {
  id: SectionId;
  sort: ArtistSort;
  title: string;
  icon: React.ReactNode;
}) {
  const { items, isLoading, isError } = useDiscoverArtists(sort);
  if (isError || (!isLoading && items.length === 0)) return null;
  return (
    <CatalogSection id={id} title={title} icon={icon}>
      <Shelf loading={isLoading}>
        {items.map((artist) => (
          <ArtistTile key={artist.id} artist={artist} />
        ))}
      </Shelf>
    </CatalogSection>
  );
});

const YearShelf = React.memo(function YearShelf() {
  const { t } = useTranslation();
  const { data: buckets = [], isLoading, isError } = useDiscoverAlbumsByYear(6, 20);
  const [year, setYear] = useState<number | null>(null);
  const years = useMemo(() => buckets.map((b) => b.year), [buckets]);
  const selected = year != null && years.includes(year) ? year : (years[0] ?? null);
  const albums = useMemo(
    () => dedupeReleases(buckets.find((b) => b.year === selected)?.items ?? []),
    [buckets, selected],
  );
  if (isError || (!isLoading && buckets.length === 0)) return null;
  return (
    <CatalogSection
      id="byYear"
      title={t('discover.byYear')}
      icon={<Calendar size={20} className={ICON} />}
    >
      {years.length > 0 && <Pills items={years} value={selected} onChange={setYear} />}
      <Shelf loading={isLoading}>
        {albums.map((album) => (
          <AlbumTile key={album.id} album={album} />
        ))}
      </Shelf>
    </CatalogSection>
  );
});

const TagArtists = React.memo(function TagArtists() {
  const { t } = useTranslation();
  const { data: tags = [], isError: tagsError } = useDiscoverTags(14);
  const [tag, setTag] = useState<string | null>(null);
  const ids = useMemo(() => tags.map((x) => x.id), [tags]);
  const selected = tag != null && ids.includes(tag) ? tag : (ids[0] ?? null);
  const labels = useMemo(() => new Map(tags.map((x) => [x.id, x.label])), [tags]);
  const { items, isLoading } = useDiscoverArtists('popular', selected ?? undefined);
  if (tagsError || ids.length === 0) return null;
  return (
    <CatalogSection
      id="byTag"
      title={t('discover.byTag')}
      icon={<Hash size={20} className={ICON} />}
    >
      <Pills items={ids} value={selected} onChange={setTag} label={(id) => labels.get(id) ?? id} />
      <Shelf loading={isLoading}>
        {items.map((artist) => (
          <ArtistTile key={artist.id} artist={artist} />
        ))}
      </Shelf>
    </CatalogSection>
  );
});

/* ── Genre charts (SoundCloud search, ranked by plays) ─────── */

const GenreCharts = React.memo(function GenreCharts() {
  const { t } = useTranslation();
  const [genre, setGenre] = useState<string>(CHART_GENRES[0]);
  const { data: tracks = [], isLoading, isError } = useGenreChart(genre, 10);
  return (
    <CatalogSection
      id="charts"
      title={t('discover.charts')}
      icon={<Activity size={20} className={ICON} />}
    >
      <Pills items={CHART_GENRES} value={genre} onChange={setGenre} />
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" rounded="sm" />
          ))}
        </div>
      ) : isError || tracks.length === 0 ? (
        <p className="py-6 text-[13px] text-white/40">{t('discover.chartEmpty')}</p>
      ) : (
        <div className="min-w-0">
          {tracks.map((track, i) => (
            <TrackTableRow key={track.urn} track={track} index={i} queue={tracks} />
          ))}
        </div>
      )}
    </CatalogSection>
  );
});

/* ── Personal shelves (from likes and followings) ──────────── */

const RecommendedShelf = React.memo(function RecommendedShelf({
  likedTracks,
}: {
  likedTracks: Track[];
}) {
  const { t } = useTranslation();
  const { data: pool, isLoading } = useRelatedPool(likedTracks);
  const tracks = useRecommendedTracks(pool, 40);
  if (!isLoading && tracks.length === 0) return null;
  return (
    <CatalogSection
      id="recommended"
      title={t('home.recommended')}
      icon={<Sparkles size={20} className={ICON} />}
    >
      <TrackShelf tracks={tracks} loading={isLoading} />
    </CatalogSection>
  );
});

const YourGenres = React.memo(function YourGenres({ likedTracks }: { likedTracks: Track[] }) {
  const { t } = useTranslation();
  const { data: pool, isLoading } = useRelatedPool(likedTracks);
  const discoverData = useDiscoverData(pool, likedTracks);
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const genres = useMemo(() => discoverData.map((d) => d.genre), [discoverData]);
  const selected = activeGenre && genres.includes(activeGenre) ? activeGenre : (genres[0] ?? null);
  const tracks = useMemo(
    () => discoverData.find((d) => d.genre === selected)?.tracks ?? [],
    [discoverData, selected],
  );
  if (!isLoading && genres.length === 0) return null;
  return (
    <CatalogSection
      id="yourGenres"
      title={t('discover.yourGenres')}
      icon={<Compass size={20} className={ICON} />}
    >
      {genres.length > 0 && <Pills items={genres} value={selected} onChange={setActiveGenre} />}
      <TrackShelf tracks={tracks} loading={isLoading} />
    </CatalogSection>
  );
});

const FollowingShelf = React.memo(function FollowingShelf() {
  const { t } = useTranslation();
  const { data, isLoading } = useFollowingTracks(30);
  const tracks = useMemo(() => data?.collection ?? [], [data]);
  if (!isLoading && tracks.length === 0) return null;
  return (
    <CatalogSection
      id="following"
      title={t('discover.following')}
      icon={<Music size={20} className={ICON} />}
    >
      <TrackShelf tracks={tracks} loading={isLoading} />
    </CatalogSection>
  );
});

/* ── Full catalog grid ─────────────────────────────────────── */

type BrowseTab = 'albums' | 'artists';
type BrowseSort = 'popular' | 'recent' | 'trending' | 'az';

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-5 gap-y-7';

function BrowseAlbums({ sort }: { sort: AlbumSort }) {
  const q = useDiscoverAlbums(sort, 60);
  const albums = useMemo(() => dedupeReleases(q.items), [q.items]);
  return (
    <BrowseGrid
      loading={q.isLoading}
      more={q.hasNextPage}
      fetching={q.isFetchingNextPage}
      onMore={() => q.fetchNextPage()}
    >
      {albums.map((a) => (
        <AlbumTile key={a.id} album={a} className="min-w-0" />
      ))}
    </BrowseGrid>
  );
}

function BrowseArtists({ sort }: { sort: ArtistSort }) {
  const q = useDiscoverArtists(sort, undefined, 60);
  return (
    <BrowseGrid
      loading={q.isLoading}
      more={q.hasNextPage}
      fetching={q.isFetchingNextPage}
      onMore={() => q.fetchNextPage()}
    >
      {q.items.map((a) => (
        <ArtistTile key={a.id} artist={a} className="min-w-0" />
      ))}
    </BrowseGrid>
  );
}

function BrowseGrid({
  loading,
  more,
  fetching,
  onMore,
  children,
}: {
  loading: boolean;
  more: boolean;
  fetching: boolean;
  onMore: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className={GRID}>
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full" rounded="lg" />
        ))}
      </div>
    );
  }
  return (
    <>
      <div className={GRID}>{children}</div>
      {more && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={onMore}
            disabled={fetching}
            className="press inline-flex h-10 items-center gap-2 rounded-full bg-white/[0.07] px-5 text-[13px] font-semibold text-white/85 hover:bg-white/[0.12] hover:text-white cursor-pointer"
          >
            {fetching && <Loader2 size={15} className="animate-spin" />}
            {t('discover.showMore')}
          </button>
        </div>
      )}
    </>
  );
}

function FullCatalog() {
  const { t } = useTranslation();
  const { data: summary, isError } = useDiscoverSummary();
  const [tab, setTab] = useState<BrowseTab>('albums');
  const [sort, setSort] = useState<BrowseSort>('popular');
  if (isError || !summary) return null;

  const sorts: { id: BrowseSort; label: string }[] =
    tab === 'albums'
      ? [
          { id: 'popular', label: t('discover.sortPopular') },
          { id: 'recent', label: t('discover.sortRecent') },
          { id: 'az', label: t('discover.sortAz') },
        ]
      : [
          { id: 'popular', label: t('discover.sortPopular') },
          { id: 'trending', label: t('discover.sortTrending') },
          { id: 'az', label: t('discover.sortAz') },
        ];
  const activeSort = sorts.some((s) => s.id === sort) ? sort : 'popular';

  return (
    <CatalogSection
      id="browse"
      title={t('discover.browse')}
      icon={<Disc3 size={20} className={ICON} />}
      right={
        <div className="flex flex-wrap gap-2">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { id: 'albums', label: `${t('discover.albums')} · ${fc(summary.albums_count)}` },
              { id: 'artists', label: `${t('discover.artists')} · ${fc(summary.artists_count)}` },
            ]}
          />
          <Segmented value={activeSort} onChange={setSort} options={sorts} />
        </div>
      }
    >
      {tab === 'albums' ? (
        <BrowseAlbums sort={activeSort as AlbumSort} />
      ) : (
        <BrowseArtists sort={activeSort as ArtistSort} />
      )}
    </CatalogSection>
  );
}

/* ── Page ──────────────────────────────────────────────────── */

export function Discover() {
  const { t } = useTranslation();
  const likedQuery = useLikedTracks(100);
  const likedTracks = useMemo(() => likedQuery.tracks, [likedQuery.tracks]);
  useBatchTrackHydration(likedTracks);

  return (
    <div className="p-6 pb-4 space-y-10 page-enter">
      <DiscoverHero />
      <SpotlightShelf />
      <AlbumShelf
        id="freshReleases"
        sort="recent"
        title={t('discover.freshReleases')}
        icon={<Zap size={20} className={ICON} />}
      />
      <GenreCharts />
      <RecommendedShelf likedTracks={likedTracks} />
      <ArtistShelf
        id="trendingArtists"
        sort="trending"
        title={t('discover.trendingArtists')}
        icon={<Users size={20} className={ICON} />}
      />
      <AlbumShelf
        id="popularAlbums"
        sort="popular"
        title={t('discover.popularAlbums')}
        icon={<Disc3 size={20} className={ICON} />}
      />
      <YearShelf />
      <TagArtists />
      <YourGenres likedTracks={likedTracks} />
      <FollowingShelf />
      <FullCatalog />
    </div>
  );
}
