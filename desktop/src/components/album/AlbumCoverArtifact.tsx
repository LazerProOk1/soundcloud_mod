import { memo } from 'react';
import { Disc3 } from '../../lib/icons';

/** Album cover tile for the hero (flat, like the list-page covers). */
function AlbumCoverArtifactImpl({ title, coverUrl }: { title: string; coverUrl?: string }) {
  return (
    <div className="shrink-0 self-center lg:self-start w-[180px] h-[180px] md:w-[220px] md:h-[220px] rounded-xl overflow-hidden bg-white/[0.06] shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
      {coverUrl ? (
        <img src={coverUrl} alt={title} className="w-full h-full object-cover" decoding="async" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Disc3 size={72} className="text-white/15" />
        </div>
      )}
    </div>
  );
}

export const AlbumCoverArtifact = memo(AlbumCoverArtifactImpl);
