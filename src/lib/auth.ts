import 'server-only';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { getSql } from '@/lib/db';
import { SITE_URL } from '@/lib/site';

const scrypt=promisify(scryptCallback);
const COOKIE=process.env.NODE_ENV==='production'?'__Host-wz_session':'wz_session';
const SESSION_SECONDS=7*24*60*60;
let ready:Promise<void>|undefined;
export type SiteUser={id:string;name:string;email:string};

export function authDb() { const sql=getSql(); if(!sql) throw new Error('Database unavailable'); return sql; }
export function ensureAuthTables() {
  const sql=authDb();
  ready ??= (async()=>{
    await sql`CREATE TABLE IF NOT EXISTS site_users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS site_sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES site_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS site_sessions_user_id_idx ON site_sessions(user_id)`;
    await sql`CREATE TABLE IF NOT EXISTS site_favorites (
      user_id TEXT NOT NULL REFERENCES site_users(id) ON DELETE CASCADE,
      application_id INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id,application_id)
    )`;
    await sql`CREATE TABLE IF NOT EXISTS site_rate_limits (
      key TEXT PRIMARY KEY, hits INTEGER NOT NULL, reset_at TIMESTAMPTZ NOT NULL
    )`;
  })().catch(e=>{ready=undefined;throw e;});
  return ready;
}
export function hashToken(token:string) { return createHash('sha256').update(token).digest('hex'); }
export async function hashPassword(password:string) {
  const salt=randomBytes(16).toString('hex');
  const key=await scrypt(password,salt,64) as Buffer;
  return `scrypt$16384$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password:string,stored:string) {
  const [method,cost,salt,hash]=stored.split('$');
  if(method!=='scrypt'||cost!=='16384'||!salt||!hash||!/^([a-f0-9]{128})$/.test(hash)) return false;
  const key=await scrypt(password,salt,64) as Buffer;
  return timingSafeEqual(key,Buffer.from(hash,'hex'));
}
export function normalizedEmail(value:unknown) { return typeof value==='string'?value.trim().toLowerCase():''; }
export function validEmail(value:string) { return value.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
export function validPassword(value:unknown):value is string { return typeof value==='string'&&value.length>=12&&value.length<=128; }
export function sameOrigin(request:Request) {
  const origin=request.headers.get('origin');
  const allowed=process.env.NODE_ENV==='development'?new URL(request.url).origin:new URL(SITE_URL).origin;
  const site=request.headers.get('sec-fetch-site');
  return origin===allowed && (!site||site==='same-origin');
}
export async function readJson(request:Request):Promise<Record<string,unknown>|null> {
  if(!request.headers.get('content-type')?.startsWith('application/json')) return null;
  if(Number(request.headers.get('content-length')||0)>4096) return null;
  try { const raw=await request.text(); if(raw.length>4096) return null; const data=JSON.parse(raw); return data&&typeof data==='object'&&!Array.isArray(data)?data:null; } catch { return null; }
}
export async function allowAttempt(request:Request,scope:string,identity:string,limit:number,seconds:number) {
  await ensureAuthTables(); const sql=authDb();
  const ip=(request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown').slice(0,64);
  // Apply both per-identity and per-IP limits so rotating email addresses alone does not bypass throttling.
  async function increment(value:string) {
    const key=createHash('sha256').update(`${scope}:${value}`).digest('hex');
    const [row]=await sql`INSERT INTO site_rate_limits (key,hits,reset_at) VALUES (${key},1,NOW()+${seconds} * INTERVAL '1 second')
      ON CONFLICT (key) DO UPDATE SET hits=CASE WHEN site_rate_limits.reset_at<=NOW() THEN 1 ELSE site_rate_limits.hits+1 END,
      reset_at=CASE WHEN site_rate_limits.reset_at<=NOW() THEN NOW()+${seconds} * INTERVAL '1 second' ELSE site_rate_limits.reset_at END
      RETURNING hits`;
    return Number(row?.hits);
  }
  const identityHits=await increment(`identity:${identity}`);
  const ipHits=await increment(`ip:${ip}`);
  if(Math.random()<0.01) await sql`DELETE FROM site_rate_limits WHERE reset_at<NOW()-INTERVAL '1 day'`;
  return identityHits<=limit && ipHits<=limit*4;
}
export async function createSession(userId:string) {
  const sql=authDb(), token=randomBytes(32).toString('base64url');
  await sql`INSERT INTO site_sessions (token_hash,user_id,expires_at) VALUES (${hashToken(token)},${userId},NOW()+${SESSION_SECONDS} * INTERVAL '1 second')`;
  (await cookies()).set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:SESSION_SECONDS});
}
export async function getCurrentUser():Promise<SiteUser|null> {
  const token=(await cookies()).get(COOKIE)?.value;
  if(!token||token.length>128||!getSql()) return null;
  try { await ensureAuthTables(); const sql=authDb();
    const [row]=await sql`SELECT u.id,u.name,u.email FROM site_sessions s JOIN site_users u ON u.id=s.user_id WHERE s.token_hash=${hashToken(token)} AND s.expires_at>NOW() LIMIT 1`;
    return row?{id:String(row.id),name:String(row.name),email:String(row.email)}:null;
  } catch { return null; }
}
export async function destroySession() {
  const jar=await cookies(),token=jar.get(COOKIE)?.value;
  if(token&&getSql()) { await ensureAuthTables(); const sql=authDb(); await sql`DELETE FROM site_sessions WHERE token_hash=${hashToken(token)}`; }
  jar.delete(COOKIE);
}
