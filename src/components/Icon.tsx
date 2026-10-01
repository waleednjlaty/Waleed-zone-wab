import type { SVGProps } from 'react';

const paths = {
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  account: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2" /></>,
  chevron: <path d="m15 6-6 6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  game: <><path d="M7.5 7h9c2 0 3 1 3.5 3l1.3 6c.6 3-2.6 4.2-4.1 2L15.5 16h-7l-1.7 2c-1.5 2.2-4.7 1-4.1-2L4 10c.5-2 1.5-3 3.5-3Z" /><path d="M8 10v5M5.5 12.5h5M16 11h.01M18 14h.01" /></>,
  apps: <><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M10 18h4M10 5h4" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 6a8 8 0 0 1 14 6M18 18A8 8 0 0 1 4 12" /></>,
  trend: <><path d="m3 17 6-6 4 4 8-10M15 5h6v6" /></>,
  spark: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />,
  arrow: <path d="M20 12H4m6-6-6 6 6 6" />,
} satisfies Record<string, React.ReactNode>;

export type IconName = keyof typeof paths;

export default function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
