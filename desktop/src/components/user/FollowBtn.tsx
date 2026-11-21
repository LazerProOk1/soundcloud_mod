import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Loader2 } from '../../lib/icons';
import { useAuthStore } from '../../stores/auth';
import { PILL_BTN } from '../ui/buttonClass';

interface FollowBtnProps {
  userUrn: string;
}

export function FollowBtn({ userUrn }: FollowBtnProps) {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data: initialFollowing = false, isLoading: isQueryLoading } = useQuery({
    queryKey: ['following', currentUser?.urn, userUrn],
    queryFn: () =>
      api<boolean>(
        `/users/${encodeURIComponent(currentUser!.urn)}/followings/${encodeURIComponent(userUrn)}`,
      ),
    enabled: !!currentUser?.urn && !!userUrn,
  });

  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setFollowing(initialFollowing);
  }, [initialFollowing]);

  const toggle = async () => {
    setLoading(true);
    const next = !following;
    setFollowing(next);
    try {
      await api(`/me/followings/${encodeURIComponent(userUrn)}`, {
        method: next ? 'PUT' : 'DELETE',
      });
      qc.invalidateQueries({ queryKey: ['following', currentUser?.urn, userUrn] });
      qc.invalidateQueries({ queryKey: ['user', userUrn] });
    } catch {
      setFollowing(!next);
    } finally {
      setLoading(false);
    }
  };

  const busy = loading || isQueryLoading;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={
        following
          ? PILL_BTN
          : 'press inline-flex h-9 items-center justify-center gap-2 rounded-full bg-white px-5 text-[13px] font-semibold text-black hover:bg-white/90 cursor-pointer disabled:opacity-60'
      }
    >
      {busy ? (
        <Loader2 size={14} className="animate-spin" />
      ) : following ? (
        t('user.following')
      ) : (
        t('user.follow')
      )}
    </button>
  );
}
