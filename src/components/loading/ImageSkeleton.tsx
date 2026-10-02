import Skeleton from './Skeleton';
import styles from './loading.module.css';

export default function ImageSkeleton({ variant = 'artwork', className = '' }: { variant?: 'icon' | 'artwork' | 'screenshot' | 'fill'; className?: string }) {
  return <Skeleton className={`${styles[variant]} ${className}`} />;
}
