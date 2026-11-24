/**
 * Catalog API: the `/discover/*` endpoints of the streaming server (artists and albums the
 * server has indexed). Shapes follow the upstream SoundCloud-Desktop client (MIT).
 */
import { type InfiniteData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Track } from '../stores/player';
import { api } from './api';
import { rankChart, realImage } from './discover-utils';

export type AlbumKind = 'album' | 'ep' | 'single' | 'compilation';
export type ArtistSort = 'popular' | 'trending' | 'listeners' | 'az';
export type AlbumSort = 'recent' | 'popular' | 'az';

export interface CatalogArtist {
  id: string;
  name: string;
  country?: string;
  avatar_url?: string;
  album_count?: number;
  monthly_listeners?: number;
  tags?: string[];
}

export interface CatalogAlbum {
  id: string;
  title: string;
  type: AlbumKind;
  release_year?: number | null;
  release_month?: number | null;
  cover_url?: string;
  primary_artist: { id: string; name: string; avatar_url?: string };
  track_count?: number;
}

export interface DiscoverSummary {
  artists_count: number;
  albums_count: number;
  fresh_count: number;
  fresh_window_days: number;
}

export interface CatalogTag {
  id: string;
  label: string;
  count: number;
}

export type SpotlightItem =
  | { kind: 'artist'; artist: CatalogArtist }
  | { kind: 'album'; album: CatalogAlbum };

interface CursorPage<T> {
  items: T[];
  next_cursor?: string | null;
}

const STALE_MS = 5 * 60_000;
const MAX_PAGES = 5;

function url(path: string, params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') usp.set(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Placeholder art ("no cover" clouds) becomes undefined, so cards show their own fallback. */
function cleanImages<T>(item: T): T {
  const x = item as Record<string, unknown>;
  const out: Record<string, unknown> = { ...x };
  if ('cover_url' in x) out.cover_url = realImage(x.cover_url as string | undefined);
  if ('avatar_url' in x) out.avatar_url = realImage(x.avatar_url as string | undefined);
  for (const k of ['primary_artist', 'artist', 'album']) {
    if (x[k] && typeof x[k] === 'object') out[k] = cleanImages(x[k]);
  }
  return out as T;
}

/** The catalog is optional server data: a missing endpoint just hides its section. */
const quiet = { staleTime: STALE_MS, retry: 1 } as const;

export function useDiscoverSummary() {
  return useQuery({
    queryKey: ['discover', 'summary'],
    queryFn: () => api<DiscoverSummary>('/discover/summary'),
    ...quiet,
  });
}

export function useDiscoverSpotlight(limit = 12) {
  return useQuery({
    queryKey: ['discover', 'spotlight', limit],
    queryFn: () => api<{ items: SpotlightItem[] }>(url('/discover/spotlight', { limit })),
    select: (d) => (d.items ?? []).map(cleanImages),
    ...quiet,
  });
}

export function useDiscoverTags(limit = 14) {
  return useQuery({
    queryKey: ['discover', 'tags', limit],
    queryFn: () => api<CursorPage<CatalogTag>>(url('/discover/tags', { limit })),
    select: (d) => d.items ?? [],
    ...quiet,
  });
}

export function useDiscoverAlbumsByYear(years = 6, perYear = 16) {
  return useQuery({
    queryKey: ['discover', 'albumsByYear', years, perYear],
    queryFn: () =>
      api<{ buckets: { year: number; items: CatalogAlbum[] }[] }>(
        url('/discover/albums/by-year', { years, per_year: perYear }),
      ),
    select: (d) =>
      (d.buckets ?? [])
        .filter((b) => b.items?.length > 0)
        .map((b) => ({ ...b, items: b.items.map(cleanImages) })),
    ...quiet,
  });
}

function useCatalogPages<T>(
  key: readonly unknown[],
  path: string,
  params: Record<string, string | number | undefined>,
) {
  const query = useInfiniteQuery<
    CursorPage<T>,
    Error,
    InfiniteData<CursorPage<T>>,
    readonly unknown[],
    string | undefined
  >({
    queryKey: key,
    queryFn: ({ pageParam }) => api<CursorPage<T>>(url(path, { ...params, cursor: pageParam })),
    initialPageParam: undefined,
    getNextPageParam: (last, all) =>
      all.length >= MAX_PAGES ? undefined : (last.next_cursor ?? undefined),
    maxPages: MAX_PAGES,
    ...quiet,
  });
  const items = (query.data?.pages ?? []).flatMap((p) => p?.items ?? []).map(cleanImages);
  return { ...query, items };
}

export function useDiscoverAlbums(sort: AlbumSort, limit = 40, kind?: AlbumKind) {
  return useCatalogPages<CatalogAlbum>(
    ['discover', 'albums', sort, kind, limit],
    '/discover/albums',
    {
      sort,
      kind,
      limit,
    },
  );
}

export function useDiscoverArtists(sort: ArtistSort, tag?: string, limit = 40) {
  return useCatalogPages<CatalogArtist>(
    ['discover', 'artists', sort, tag, limit],
    '/discover/artists',
    {
      sort,
      tag,
      limit,
    },
  );
}

/** Genre chart: the most played full-length tracks among a genre search page. */
export function useGenreChart(genre: string, size = 15) {
  return useQuery({
    queryKey: ['discover', 'chart', genre],
    queryFn: () =>
      api<{ collection: Track[] }>(
        `/tracks?q=${encodeURIComponent(genre)}&limit=60&linked_partitioning=true`,
      ),
    select: (d) => rankChart(d.collection ?? [], size),
    ...quiet,
  });
}

export async function fetchDiscoverRandom(kind: 'album' | 'artist'): Promise<string | null> {
  try {
    const res = await api<{ id: string }>(url('/discover/random', { type: kind }));
    return res.id ?? null;
  } catch {
    return null;
  }
}
