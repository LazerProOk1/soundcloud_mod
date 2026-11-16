import { create } from 'zustand';

interface CachedUrnsState {
  urns: Set<string>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  markCached: (urn: string) => void;
  markManyCached: (urns: string[]) => void;
  removeCached: (urn: string) => void;
  clearAll: () => void;
}

export function hasCachedTrack(urns: ReadonlySet<string>, urn: string | null | undefined): boolean {
  return Boolean(urn && urns.has(urn));
}

let hydratePromise: Promise<void> | null = null;

export const useCachedUrnsStore = create<CachedUrnsState>((set, get) => ({
  urns: new Set<string>(),
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      set({ hydrated: true });
      return;
    }
    if (!hydratePromise) {
      hydratePromise = import('../lib/cache')
        .then(({ listCachedUrns }) => listCachedUrns())
        .then((list) => {
          set({ urns: new Set(list), hydrated: true });
        })
        .catch(() => {
          set({ hydrated: true });
        })
        .finally(() => {
          hydratePromise = null;
        });
    }
    await hydratePromise;
  },

  markCached: (urn) => {
    if (!urn) return;
    set((state) => {
      if (state.urns.has(urn)) return state;
      const next = new Set(state.urns);
      next.add(urn);
      return { urns: next };
    });
  },

  markManyCached: (urns) => {
    if (urns.length === 0) return;
    set((state) => {
      let changed = false;
      const next = new Set(state.urns);
      for (const urn of urns) {
        if (urn && !next.has(urn)) {
          next.add(urn);
          changed = true;
        }
      }
      return changed ? { urns: next } : state;
    });
  },

  removeCached: (urn) => {
    if (!urn) return;
    set((state) => {
      if (!state.urns.has(urn)) return state;
      const next = new Set(state.urns);
      next.delete(urn);
      return { urns: next };
    });
  },

  clearAll: () => {
    set((state) => (state.urns.size === 0 ? state : { urns: new Set<string>() }));
  },
}));
