import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import {
  type Aura,
  auraFromHex,
  DEFAULT_AURA,
  DEFAULT_CUSTOM_HEX,
  resolveAura,
} from '../../lib/aura';

type AuraResponse = {
  aura_id: string | null;
  custom_hex: string | null;
};

const STALE_MS = 5 * 60 * 1000;
const GC_MS = 10 * 60 * 1000;
const LOCAL_AURA_PREFIX = 'sc_star_aura:';

const auraKey = (urn: string | undefined) => ['user', urn, 'aura'] as const;

function readLocalAura(urn: string | undefined): AuraResponse | null {
  if (!urn || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${LOCAL_AURA_PREFIX}${urn}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuraResponse>;
    if (typeof parsed.aura_id === 'string') {
      return {
        aura_id: parsed.aura_id,
        custom_hex: typeof parsed.custom_hex === 'string' ? parsed.custom_hex : null,
      };
    }
  } catch {
    // ignore malformed local aura entry
  }
  return null;
}

function writeLocalAura(urn: string | undefined, payload: AuraResponse): void {
  if (!urn || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${LOCAL_AURA_PREFIX}${urn}`, JSON.stringify(payload));
  } catch {
    // ignore storage quota errors
  }
}

export function useUserAura(urn: string | undefined, enabled: boolean) {
  const query = useQuery({
    queryKey: auraKey(urn),
    queryFn: () => api<AuraResponse>(`/users/${encodeURIComponent(urn!)}/aura`),
    enabled: !!urn && enabled,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    retry: false,
  });

  const localFallback = useMemo(() => readLocalAura(urn), [urn]);

  const aura = useMemo(() => {
    if (!enabled) return DEFAULT_AURA;
    const src = query.data?.aura_id ? query.data : localFallback;
    return resolveAura(src?.aura_id, src?.custom_hex);
  }, [enabled, query.data, localFallback]);

  const initialCustomHex =
    query.data?.custom_hex ?? localFallback?.custom_hex ?? DEFAULT_CUSTOM_HEX;
  return { aura, customHex: initialCustomHex, isLoading: query.isLoading };
}

const SAVE_DEBOUNCE_MS = 350;

export function useEditableUserAura(urn: string | undefined, enabled: boolean) {
  const qc = useQueryClient();
  const remote = useQuery({
    queryKey: auraKey(urn),
    queryFn: () => api<AuraResponse>(`/users/${encodeURIComponent(urn!)}/aura`),
    enabled: !!urn && enabled,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    retry: false,
  });

  const [aura, setAura] = useState<Aura>(() => {
    const local = readLocalAura(urn);
    return local ? resolveAura(local.aura_id, local.custom_hex) : DEFAULT_AURA;
  });
  const [customHex, setCustomHex] = useState<string>(
    () => readLocalAura(urn)?.custom_hex ?? DEFAULT_CUSTOM_HEX,
  );
  const initRef = useRef(false);

  // Re-sync local aura when navigating between profiles
  useEffect(() => {
    initRef.current = false;
    const local = readLocalAura(urn);
    if (local) {
      setAura(resolveAura(local.aura_id, local.custom_hex));
      if (local.custom_hex) setCustomHex(local.custom_hex);
    }
  }, [urn]);

  useEffect(() => {
    if (!enabled || initRef.current || !remote.data) return;
    if (remote.data.aura_id) {
      setAura(resolveAura(remote.data.aura_id, remote.data.custom_hex));
      if (remote.data.custom_hex) setCustomHex(remote.data.custom_hex);
      writeLocalAura(urn, remote.data);
    }
    initRef.current = true;
  }, [enabled, remote.data, urn]);

  const mutation = useMutation({
    mutationFn: (payload: { aura_id: string; custom_hex?: string | null }) =>
      api<AuraResponse>('/me/aura', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      if (urn) {
        qc.setQueryData(auraKey(urn), data);
        writeLocalAura(urn, data);
      }
    },
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSave = useCallback(
    (next: Aura, hex: string) => {
      if (!enabled) return;
      const payload: AuraResponse = {
        aura_id: next.id,
        custom_hex: next.id === 'custom' ? hex : null,
      };
      writeLocalAura(urn, payload);
      if (urn) qc.setQueryData(auraKey(urn), payload);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        mutation.mutate({
          aura_id: next.id,
          custom_hex: next.id === 'custom' ? hex : null,
        });
      }, SAVE_DEBOUNCE_MS);
    },
    [enabled, mutation, qc, urn],
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const onPickAura = useCallback(
    (next: Aura) => {
      setAura(next);
      queueSave(next, customHex);
    },
    [customHex, queueSave],
  );

  const onPickCustom = useCallback(
    (hex: string) => {
      setCustomHex(hex);
      const next = auraFromHex(hex);
      if (next) {
        setAura(next);
        queueSave(next, hex);
      }
    },
    [queueSave],
  );

  return { aura, customHex, onPickAura, onPickCustom };
}
