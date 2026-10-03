import 'server-only';
import { createHash } from 'node:crypto';
import type { Sql, TransactionSql } from 'postgres';
import { adsenseState, manualAdConfig } from '@/lib/ads';
import { AdminError, choice, fields, id, invalid, revision } from './validation';

export const AD_STATUSES = ['unreviewed', 'eligible', 'blocked'];
export const RIGHTS_BASES = ['official','freeware','open_source','publisher_permission','owner_created','other_documented','unknown'];
type Row = Record<string, unknown>;
function revisionToken(app: Row, review?: Row) {
  return createHash('sha256').update(JSON.stringify([app.id, String(app.revision), review ? String(review.revision) : null])).digest('hex');
}
function view(app: Row, review?: Row) {
  const stale = review?.status === 'eligible' && String(review.reviewed_catalog_revision) !== String(app.revision);
  return { application_id: app.id, name: typeof app.name === 'string' && app.name.trim() ? app.name : `تطبيق بدون اسم (${app.id})`, icon: app.image_url ?? null, category: app.category ?? null,
    version: app.version ?? null, active: app.active === true, published: app.published === true,
    status: stale ? 'unreviewed' : review?.status ?? 'unreviewed', rights_basis: review?.rights_basis ?? 'unknown',
    review_notes: review?.review_notes ?? '', reviewed_at: stale ? null : review?.reviewed_at ?? null,
    revision: revisionToken(app, review) };
}
function applicationId(value?: string) {
  if (!value || !/^[1-9][0-9]*$/.test(value)) throw invalid();
  return id(Number(value));
}
export class OwnerMonetizationService {
  constructor(private sql: Sql, private env: NodeJS.ProcessEnv = process.env) {}
  private async tx<T>(fn: (tx: TransactionSql) => Promise<T>) {
    return await this.sql.begin('isolation level repeatable read', async tx => {
      await tx`SET LOCAL lock_timeout='2s'`; await tx`SET LOCAL statement_timeout='5s'`;
      return fn(tx);
    }) as T;
  }
  async read(operation: string, recordId?: string, page?: {limit: number; after: number | string | null}) {
    return this.tx(async tx => {
      if (operation === 'monetization-record') {
        const application = applicationId(recordId);
        const [app] = await tx`SELECT id,name,image_url,category,version,active,published,revision FROM applications WHERE id=${application}`;
        if (!app) throw new AdminError(404,'RECORD_NOT_FOUND');
        const [review] = await tx`SELECT * FROM site_ad_eligibility WHERE application_id=${application}`;
        return view(app, review);
      }
      if (!page) throw invalid();
      const apps = await tx`SELECT id,name,image_url,category,version,active,published,revision FROM applications
        WHERE id > ${page.after ?? 0} ORDER BY id LIMIT ${page.limit + 1}`;
      const reviews = await tx`SELECT e.* FROM site_ad_eligibility e JOIN (
        SELECT id FROM applications WHERE id > ${page.after ?? 0} ORDER BY id LIMIT ${page.limit + 1}
      ) a ON a.id=e.application_id`;
      const [counts] = await tx`SELECT count(*) FILTER (WHERE e.status='eligible' AND e.reviewed_catalog_revision=a.revision)::int AS eligible,
        count(*) FILTER (WHERE e.status='blocked')::int AS blocked,
        count(*) FILTER (WHERE e.application_id IS NULL OR e.status='unreviewed' OR
          (e.status='eligible' AND e.reviewed_catalog_revision IS DISTINCT FROM a.revision))::int AS unreviewed
        FROM applications a LEFT JOIN site_ad_eligibility e ON e.application_id=a.id`;
      const gates = adsenseState(this.env);
      return { items: apps.slice(0,page.limit).map(app => view(app,reviews.find(e => e.application_id === app.id))), counts,
        next_after: apps.length > page.limit ? apps[page.limit-1].id : null,
        gates: { publisherConfigured: Boolean(gates.publisherId), contentReviewed: gates.contentReviewed,
          siteApproved: gates.siteApproved, privacyReady: gates.privacyReady, enabled: gates.enabled,
          serving: gates.serving, manualPlacementConfigured: Boolean(manualAdConfig(this.env)) } };
    });
  }
  async write(_operation: string, body: Record<string,unknown>, owner: string, recordId?: string) {
    fields(body, ['expected_revision','status','rights_basis','review_notes']);
    revision(body.expected_revision);
    const status = choice(body.status, AD_STATUSES), basis = choice(body.rights_basis, RIGHTS_BASES);
    const notes = body.review_notes;
    if (typeof notes !== 'string' || notes.length > 1000 || notes.trim() !== notes
      || /[\p{Cf}]/u.test(notes) || /[\p{Cc}]/u.test(notes.replace(/[\n\r\t]/g,''))) throw invalid();
    if (status === 'eligible' && (basis === 'unknown' || !notes)) throw new AdminError(400,'RIGHTS_EVIDENCE_REQUIRED');
    const application = applicationId(recordId);
    return this.tx(async tx => {
      // Lock catalog first: identical order to bot/catalog/source writes. Review CAS has its own revision.
      const [app] = await tx`SELECT id,name,image_url,category,version,active,published,revision FROM applications WHERE id=${application} FOR UPDATE`;
      if (!app) throw new AdminError(404,'RECORD_NOT_FOUND');
      const [before] = await tx`SELECT * FROM site_ad_eligibility WHERE application_id=${application} FOR UPDATE`;
      if (revisionToken(app,before) !== body.expected_revision) throw new AdminError(409,'STALE_REVISION');
      const reviewed = status !== 'unreviewed';
      const [review] = await tx`INSERT INTO site_ad_eligibility(application_id,status,rights_basis,review_notes,reviewed_at,reviewed_by,reviewed_catalog_revision)
        VALUES(${application},${status},${basis},${notes},${reviewed ? new Date() : null},${reviewed ? owner : null},${reviewed ? app.revision : null})
        ON CONFLICT(application_id) DO UPDATE SET status=EXCLUDED.status,rights_basis=EXCLUDED.rights_basis,
          review_notes=EXCLUDED.review_notes,reviewed_at=EXCLUDED.reviewed_at,reviewed_by=EXCLUDED.reviewed_by,
          reviewed_catalog_revision=EXCLUDED.reviewed_catalog_revision,revision=site_ad_eligibility.revision+1,updated_at=clock_timestamp()
        RETURNING *`;
      return view(app,review);
    });
  }
}
