import 'server-only';
const sensitive=/authorization|cookie|password|token|secret|signing.?key|database.?url|access.?key/i;
export function redactText(input: string, env: NodeJS.ProcessEnv = process.env): string {
  let value=input.slice(0,16384);
  for(const [key,secret] of Object.entries(env)) if(secret && sensitive.test(key)) value=value.split(secret).join('[REDACTED]');
  return value
    .replace(/https?:\/\/api\.telegram\.org\/(?:file\/)?bot[^\s'"<>]+/gi,'[TELEGRAM_URL_REDACTED]')
    .replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi,'[DATABASE_URL_REDACTED]')
    .replace(/https?:\/\/[^\s'"<>]+\?[^\s'"<>]+/gi,'[URL_QUERY_REDACTED]')
    .replace(/https?:\/\/[^\s/@'"<>]+:[^\s/@'"<>]+@[^\s'"<>]+/gi,'[URL_CREDENTIALS_REDACTED]')
    .replace(/(authorization|password|token|secret|signing.?key|api.?key)([\s'"=:]+)(?:Bearer\s+)?[^\s,;'"}]+/gi,'$1$2[REDACTED]')
    .replace(/(cookie[\s'"=:]+)[^\r\n]+/gi,'$1[REDACTED]')
    .replace(/(cookie\s*:\s*)[^\r\n]+/gi,'$1[REDACTED]');
}
export function redact(value: unknown, env: NodeJS.ProcessEnv = process.env, depth=0): unknown {
  if(depth>6) return '[TRUNCATED]';
  if(typeof value==='string') return redactText(value,env);
  if(value instanceof Error) return {name:value.name,message:redactText(value.message,env)};
  if(Array.isArray(value)) return value.slice(0,100).map(v=>redact(v,env,depth+1));
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).slice(0,100)
    .map(([key,v])=>[key,sensitive.test(key)?'[REDACTED]':redact(v,env,depth+1)]));
  return value;
}
/** Log codes only, never SQL/stack/error objects or request headers. */
export function logFailure(area: string, code: string) {
  console.error(JSON.stringify(redact({area,code})));
}
