import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { IdentityHub } from '../components/user/IdentityHub';
import { USER_PAGE_KEYFRAMES } from '../components/user/keyframes';
import { TabDock, type TabId } from '../components/user/TabDock';
import {
  UserConnectionsTab,
  UserLikesTab,
  UserPlaylistsTab,
  UserPopularTab,
  UserTracksTab,
} from '../components/user/UserTabs';
import { useUser, useUserWebProfiles } from '../lib/hooks';
import { Loader2 } from '../lib/icons';
import { useAuthStore } from '../stores/auth';

export function UserPage() {
  const { urn } = useParams<{ urn: string }>();
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = useState<TabId>('popular');

  const { data: user, isLoading: userLoading } = useUser(urn);
  const { data: webProfiles } = useUserWebProfiles(urn);

  const isOwnProfile = !!user && currentUser?.urn === user.urn;

  const tabs = useMemo(() => {
    if (!user) return [] as const;
    return [
      { id: 'popular' as const, label: t('user.popular'), count: undefined },
      { id: 'tracks' as const, label: t('user.tracks'), count: user.track_count },
      { id: 'playlists' as const, label: t('user.playlists'), count: user.playlist_count },
      { id: 'likes' as const, label: t('user.likes'), count: user.public_favorites_count },
      { id: 'followers' as const, label: t('user.followers'), count: user.followers_count },
      { id: 'following' as const, label: t('user.following'), count: user.followings_count },
    ] as const;
  }, [user, t]);

  if (userLoading || !user) {
    return (
      <div className="relative w-full min-h-screen flex items-center justify-center">
        <Loader2 size={28} className="text-white/30 animate-spin" />
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
          <IdentityHub user={user} webProfiles={webProfiles} isOwnProfile={isOwnProfile} />

          <div className="mt-10 mb-8">
            <TabDock tabs={tabs} active={activeTab} onChange={setActiveTab} />
          </div>

          <div>
            {activeTab === 'popular' && <UserPopularTab urn={urn!} />}
            {activeTab === 'tracks' && <UserTracksTab urn={urn!} />}
            {activeTab === 'playlists' && <UserPlaylistsTab urn={urn!} />}
            {activeTab === 'likes' && <UserLikesTab urn={urn!} />}
            {activeTab === 'followers' && <UserConnectionsTab urn={urn!} mode="followers" />}
            {activeTab === 'following' && <UserConnectionsTab urn={urn!} mode="followings" />}
          </div>
        </div>
      </div>
    </>
  );
}
