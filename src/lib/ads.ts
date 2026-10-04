/** Edge-compatible, exact-value gates. Attestations never imply Google verification. */
export function adsenseState(env: NodeJS.ProcessEnv = process.env) {
  const publisherId = /^ca-pub-[0-9]{16}$/.test(env.ADSENSE_PUBLISHER_ID || '') ? env.ADSENSE_PUBLISHER_ID! : null;
  const contentReviewed = env.ADSENSE_CONTENT_REVIEWED === 'true';
  const siteApproved = env.ADSENSE_SITE_APPROVED === 'true';
  const privacyReady = env.ADSENSE_PRIVACY_READY === 'true';
  const enabled = env.ADSENSE_ENABLED === 'true';
  return { publisherId, contentReviewed, siteApproved, privacyReady, enabled,
    serving: Boolean(publisherId && contentReviewed && siteApproved && privacyReady && enabled) };
}
export const ADSENSE_PUBLISHER_ID = adsenseState().publisherId;
export const ADSENSE_READY = adsenseState().serving;
/** Only reviewed detail pages may host manually configured inventory. */
export function adRouteAllowed(path: string): boolean {
  return /^\/(apps|games)\/[\p{L}\p{N}][\p{L}\p{N}-]*-[1-9][0-9]{0,9}$/u.test(path);
}
export function manualAdConfig(env: NodeJS.ProcessEnv = process.env) {
  const state = adsenseState(env);
  const slotId = /^[0-9]{10}$/.test(env.ADSENSE_DETAIL_SLOT_ID || '') ? env.ADSENSE_DETAIL_SLOT_ID! : null;
  const cmpId = /^[1-9][0-9]{0,4}$/.test(env.ADSENSE_CMP_ID || '') ? Number(env.ADSENSE_CMP_ID) : null;
  return state.serving && slotId && cmpId ? { publisherId: state.publisherId!, slotId, cmpId } : null;
}
export function adsTxt(env: NodeJS.ProcessEnv = process.env): string | null {
  const { publisherId } = adsenseState(env);
  // Google requires seller ID pub-… here, while ad client/meta use ca-pub-….
  return publisherId ? `google.com, ${publisherId.slice(3)}, DIRECT, f08c47fec0942fa0\n` : null;
}
