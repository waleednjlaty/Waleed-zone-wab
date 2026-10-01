'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { safeExternalUrl } from '@/lib/utils';

interface CoverImageProps {
  src?: string | null;
  alt: string;
  aspectClassName?: string;
  imgClassName?: string;
}

export default function CoverImage({ src, alt, aspectClassName = 'aspect-video', imgClassName = '' }: CoverImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const safeSrc = safeExternalUrl(src);
  const showImage = Boolean(safeSrc) && failedSrc !== safeSrc;
  useEffect(() => {
    // Cached images can finish before hydration attaches the load handler.
    if (image.current?.complete && image.current.naturalWidth > 0) setLoadedSrc(safeSrc);
  }, [safeSrc]);

  return <div className={`cover-image relative w-full overflow-hidden ${aspectClassName}`}>
    {showImage && <img ref={image} src={safeSrc as string} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={() => setLoadedSrc(safeSrc)} onError={() => setFailedSrc(safeSrc)} className={`h-full w-full object-cover ${loadedSrc === safeSrc ? '' : 'opacity-0'} ${imgClassName}`} />}
    {(!showImage || loadedSrc !== safeSrc) && <div className="image-placeholder" role={!showImage && alt ? 'img' : undefined} aria-label={!showImage ? alt || undefined : undefined} aria-hidden={showImage || !alt ? true : undefined}><Icon name="grid" width={28} height={28} /></div>}
  </div>;
}
