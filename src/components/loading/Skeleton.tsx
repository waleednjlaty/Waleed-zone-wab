import type { CSSProperties } from 'react';
import styles from './loading.module.css';

/** Decorative only. Announce the containing async region once, not every block. */
export default function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={`${styles.skeleton} ${className}`} style={style} />;
}
