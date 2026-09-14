'use client';

import { useEffect } from 'react';

export default function VisitorTracker() {
  useEffect(() => {
    void fetch('/api/visit', { method: 'POST', keepalive: true }).catch(() => undefined);
  }, []);

  return null;
}
