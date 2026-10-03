import 'server-only';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getSql } from '@/lib/db';
import { SITE_URL } from '@/lib/site';
import { downloadBody } from '@/lib/downloads/http';
import { consumeWindow, requestNetwork } from '@/lib/security/limits';

const scrypt=promisify(scryptCallback);
const COOKIE=process.env.NODE_ENV==='production'?'__Host-wz_session':'wz_session';
const SESSION_SECONDS=7*24*60*60;
export type SiteUser={id:string;name:string;email:string};

export function authDb() { const sql=getSql(); if(!sql) throw new Error('Database unavailable'); return sql; }
export function ensureAuthTables() {
  const sql=authDb();
  // Operator-owned migration. Read-only checks cannot silently create schema.
  return sql`SELECT token_hash,user_id,expires_at FROM site_sessions LIMIT 0`;
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
  try { return await downloadBody(request,false,4096); } catch { return null; }
}
export async function allowAttempt(request:Request,scope:string,identity:string,limit:number,seconds:number) {
  const sql=authDb(), network=requestNetwork(request,process.env);
  // The fallback is a shared bucket, never a caller-forged forwarding address.
  const networkLimit=network==='shared' ? (scope==='register'?60:Math.max(240,limit*4)) : limit*4;
  if(!await consumeWindow(sql,`${scope}:network:${network}`,networkLimit,seconds)) return false;
  return consumeWindow(sql,`${scope}:identity:${identity}`,limit,seconds);
}
export async function createSession(userId:string) {
  const sql=authDb(), token=randomBytes(32).toString('base64url'),jar=await cookies();
  const previous=jar.get(COOKIE)?.value;
  await sql.begin(async tx=>{
    if(previous && /^[A-Za-z0-9_-]{43}$/.test(previous)) await tx`DELETE FROM site_sessions WHERE token_hash=${hashToken(previous)}`;
    await tx`INSERT INTO site_sessions (token_hash,user_id,expires_at) VALUES (${hashToken(token)},${userId},NOW()+${SESSION_SECONDS} * INTERVAL '1 second')`;
  });
  jar.set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:SESSION_SECONDS});
}
export const getCurrentUser = cache(async ():Promise<SiteUser|null> => {
  const token=(await cookies()).get(COOKIE)?.value;
  if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token)||!getSql()) return null;
  try { const sql=authDb();
    const [row]=await sql`SELECT u.id,u.name,u.email FROM site_sessions s JOIN site_users u ON u.id=s.user_id WHERE s.token_hash=${hashToken(token)} AND s.expires_at>NOW() LIMIT 1`;
    return row?{id:String(row.id),name:String(row.name),email:String(row.email)}:null;
  } catch { return null; }
});
export async function destroySession() {
  const jar=await cookies(),token=jar.get(COOKIE)?.value;
  if(token&&getSql()) { await ensureAuthTables(); const sql=authDb(); await sql`DELETE FROM site_sessions WHERE token_hash=${hashToken(token)}`; }
  // __Host- deletion must satisfy the same Secure/Path constraints as creation.
  jar.set(COOKIE,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:0});
}
