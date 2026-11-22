import { useState } from 'react';

/** Round avatar; the first letter of the name when there is no picture or it fails to load. */
export function LetterAvatar({
  name,
  src,
  className,
}: {
  name: string;
  src?: string | null;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`${className} [container-type:size] rounded-full overflow-hidden bg-gradient-to-br from-white/[0.12] to-white/[0.03] flex items-center justify-center`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover transition-transform duration-700 ease-[var(--ease-apple)] group-hover:scale-[1.05]"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-[40cqw] leading-none font-bold text-white/70">
          {name.trim().charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}
