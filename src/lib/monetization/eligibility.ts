import 'server-only';
import { getSql } from '@/lib/db';
import { manualAdConfig } from '@/lib/ads';
import { logFailure } from '@/lib/security/logging';
/** Public authority returns only a boolean, never owner notes or evidence. No DDL. */
export async function applicationAdEligible(applicationId: number): Promise<boolean> {
  if (!manualAdConfig() || !Number.isSafeInteger(applicationId) || applicationId < 1) return false;
  try {
    const sql = getSql();
    if (!sql) return false;
    const [row] = await sql`SELECT 1 AS eligible FROM applications a JOIN site_ad_eligibility e ON e.application_id=a.id
      WHERE a.id=${applicationId} AND a.active=true AND a.published=true AND e.status='eligible'
      AND e.rights_basis <> 'unknown' AND length(btrim(e.review_notes)) > 0
      AND e.reviewed_at IS NOT NULL AND e.reviewed_by IS NOT NULL AND e.reviewed_catalog_revision=a.revision`;
    return row?.eligible === 1;
  } catch { logFailure('monetization', 'ELIGIBILITY_UNAVAILABLE'); return false; }
}
