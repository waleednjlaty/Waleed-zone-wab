'use client';

import { useState } from 'react';

interface CoverImageProps {
  src?: string | null;
  alt: string;
  aspectClassName?: string;
  imgClassName?: string;
}

export default function CoverImage({
  src,
  alt,
  aspectClassName = 'aspect-video',
  imgClassName = '',
}: CoverImageProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div className={`relative w-full overflow-hidden bg-slate-900 ${aspectClassName}`}>
      {showImage ? (
        <img
          src={src as string}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover ${imgClassName}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
            className="h-12 w-12 text-slate-600"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
