import React from 'react';
import { art } from '../../lib/formatters';
import { Users } from '../../lib/icons';

/** Square avatar tile for the profile / artist hero (flat, like the list-page covers). */
function AvatarArtifactImpl({
  username,
  avatarUrl,
}: {
  username: string;
  avatarUrl: string | null | undefined;
}) {
  const url = art(avatarUrl, 't500x500');
  return (
    <div className="shrink-0 self-center lg:self-start w-[148px] h-[148px] md:w-[180px] md:h-[180px] rounded-xl overflow-hidden bg-white/[0.06] shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
      {url ? (
        <img src={url} alt={username} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Users size={56} className="text-white/15" />
        </div>
      )}
    </div>
  );
}

export const AvatarArtifact = React.memo(AvatarArtifactImpl);
