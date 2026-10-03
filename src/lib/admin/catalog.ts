import 'server-only';
import { createHash } from 'node:crypto';
import type { Sql, TransactionSql } from 'postgres';
import { telegramReference } from '@/lib/delivery/telegram';
import { safeExternalUrl } from '@/lib/utils';
import { AdminError, fields, id, invalid, object, revision, text, choice } from './validation';

const columns = ['name','description','version','size','category','platform','developer','image_url'];
const limits = [255,1000,50,50,100,50,255,500];
export const catalogRevision = (value: unknown) => createHash('sha256').update(String(value)).digest('hex');
function appId(value?: string) { if (!value || !/^[1-9][0-9]*$/.test(value)) throw invalid(); return id(Number(value)); }
function metadata(value: unknown) {
  const input = object(value); fields(input, columns);
  const result: Record<string,string | null> = {};
  columns.forEach((name,i) => {
    const value = input[name];
    if (name === 'description' && typeof value === 'string' && value) {
      if (value.length > limits[i] || value.trim() !== value || /[\p{Cf}]/u.test(value) || /[\p{Cc}]/u.test(value.replace(/[\n\r\t]/g,''))) throw invalid();
      result[name] = value; return;
    }
    result[name] = name !== 'name' && (value === null || value === '') ? null : text(value,limits[i]);
  });
  if (result.image_url) {
    if (!safeExternalUrl(result.image_url)) throw invalid();
  }
  return result;
}
function view(row: Record<string,unknown>) {
  return { id: row.id, ...Object.fromEntries(columns.map(k => [k,row[k] ?? null])),
    active: row.active === true, published: row.published === true, revision: catalogRevision(row.revision) };
}
export class OwnerCatalogService {
  constructor(private sql: Sql, private env: NodeJS.ProcessEnv = process.env) {}
  private async tx<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
    return await this.sql.begin('isolation level read committed',async tx => {
      await tx`SET LOCAL lock_timeout='2s'`; await tx`SET LOCAL statement_timeout='5s'`;
      return fn(tx);
    }) as T;
  }
  async read(_operation: string, recordId?: string) {
    const applicationId = appId(recordId);
    return this.tx(async tx => {
      const [row] = await tx`SELECT id,name,description,version,size,category,platform,developer,image_url,active,published,revision
        FROM applications WHERE id=${applicationId}`;
      if (!row) throw new AdminError(404,'RECORD_NOT_FOUND');
      const [source] = await tx`SELECT telegram_channel_username,telegram_message_id,filename,size_bytes,mime_type
        FROM site_delivery_sources WHERE application_id=${applicationId} AND provider='telegram'`;
      return { ...view(row), source: source ? { channel_username: source.telegram_channel_username,
        message_id: source.telegram_message_id, filename: source.filename, size_bytes: source.size_bytes === null ? null : Number(source.size_bytes), mime_type: source.mime_type } : null };
    });
  }
  async write(operation: string, body: Record<string,unknown>, _owner: string, recordId?: string) {
    if (operation === 'catalog') {
      fields(body,['metadata']); const data = metadata(body.metadata);
      return this.tx(async tx => {
        const [row] = await tx`INSERT INTO applications(name,description,version,size,category,platform,developer,image_url,
          active,published,downloads,views,created_at,search_text)
          VALUES(${data.name},${data.description},${data.version},${data.size},${data.category},${data.platform},${data.developer},${data.image_url},
          true,false,0,0,clock_timestamp(),${[data.name,data.category,data.platform,data.description].filter(Boolean).join(' ').toLowerCase()}) RETURNING *`;
        return { ...view(row), source: null };
      });
    }
    fields(body,['expected_revision'],operation === 'delivery-source' ? ['source'] : ['metadata','action']);
    revision(body.expected_revision); const applicationId = appId(recordId);
    return this.tx(async tx => {
      const [before] = await tx`SELECT id,revision FROM applications WHERE id=${applicationId} FOR UPDATE`;
      if (!before) throw new AdminError(404,'RECORD_NOT_FOUND');
      if (catalogRevision(before.revision) !== body.expected_revision) throw new AdminError(409,'STALE_REVISION');
      if (operation === 'delivery-source') {
        let source; try { source = telegramReference(object(body.source),this.env); } catch { throw invalid(); }
        // Website only stores public references. No Bot token or provider calls.
        await tx`INSERT INTO site_delivery_sources(application_id,provider,telegram_channel_username,telegram_message_id)
          VALUES(${applicationId},'telegram',${source.username},${source.messageId}) ON CONFLICT(application_id,provider) DO UPDATE
          SET telegram_channel_username=EXCLUDED.telegram_channel_username,telegram_message_id=EXCLUDED.telegram_message_id,
          telegram_chat_id=NULL,telegram_file_id=NULL,filename=NULL,size_bytes=NULL,mime_type=NULL,updated_at=clock_timestamp()`;
      } else if ('metadata' in body && !('action' in body)) {
        const data = metadata(body.metadata);
        await tx`UPDATE applications SET name=${data.name},description=${data.description},version=${data.version},size=${data.size},
          category=${data.category},platform=${data.platform},developer=${data.developer},image_url=${data.image_url},
          search_text=${[data.name,data.category,data.platform,data.description].filter(Boolean).join(' ').toLowerCase()} WHERE id=${applicationId}`;
      } else if ('action' in body && !('metadata' in body)) {
        const action = choice(body.action,['publish','unpublish','archive','activate']);
        if (action === 'publish') {
          const [app] = await tx`SELECT active FROM applications WHERE id=${applicationId}`;
          if (!app.active) throw new AdminError(409,'APPLICATION_DISABLED');
          await tx`UPDATE applications SET published=true WHERE id=${applicationId}`;
        } else if (action === 'unpublish') await tx`UPDATE applications SET published=false WHERE id=${applicationId}`;
        else if (action === 'archive') await tx`UPDATE applications SET active=false,published=false WHERE id=${applicationId}`;
        else await tx`UPDATE applications SET active=true,published=false WHERE id=${applicationId}`;
      } else throw invalid();
      const [row] = await tx`SELECT * FROM applications WHERE id=${applicationId}`;
      return view(row);
    });
  }
}
