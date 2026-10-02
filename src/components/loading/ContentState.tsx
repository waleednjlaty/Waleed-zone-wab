import type { ReactNode } from 'react';
import Icon from '@/components/Icon';
import styles from './loading.module.css';

/** UI only: callers own fetching, empty detection, errors, and retry callbacks. */
export default function ContentState({ kind, title, description, action, headingLevel = 2 }: { kind: 'empty' | 'error'; title: string; description: string; action?: ReactNode; headingLevel?: 1 | 2 | 3 }) {
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3';
  return <div className={styles.contentState} data-state={kind}>
    <span className={styles.stateIcon} aria-hidden="true">{kind === 'error' ? '!' : <Icon name="search" width={30} height={30} />}</span>
    <div role="status" aria-live="polite" aria-atomic="true"><Heading>{title}</Heading><p>{description}</p></div>
    {action && <div className={styles.stateAction}>{action}</div>}
  </div>;
}
