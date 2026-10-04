import 'server-only';
/** This exact opt-in field alone is publishable. Never fall back to private email settings. */
export function publicContactEmail(env:NodeJS.ProcessEnv=process.env):string|null {
  const email=env.PUBLIC_CONTACT_EMAIL;
  if(typeof email!=='string'||email.length>254||email.trim()!==email)return null;
  if(!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,63}$/.test(email))return null;
  const local=email.split('@')[0];
  return local.includes('..')||local.endsWith('.')?null:email;
}
