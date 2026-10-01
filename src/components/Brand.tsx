import Image from 'next/image';

// A single asset path keeps the mark replaceable without touching every surface.
export default function Brand({ compact = false }: { compact?: boolean }) {
  return <span className="brand">
    <Image src="/wz-mark.svg" width={38} height={38} alt="" priority={false} />
    {!compact && <span className="brand-type" dir="ltr">Waleed <span>Zone</span></span>}
  </span>;
}
