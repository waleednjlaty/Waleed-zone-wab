/** Advertising remains off until the catalog has passed a publisher-policy review. */
export const ADSENSE_PUBLISHER_ID = /^ca-pub-\d{16}$/.test(process.env.ADSENSE_PUBLISHER_ID || '')
  ? process.env.ADSENSE_PUBLISHER_ID!
  : null;

export const ADSENSE_READY = Boolean(
  ADSENSE_PUBLISHER_ID &&
  process.env.ADSENSE_CONTENT_REVIEWED === 'true' &&
  process.env.ADSENSE_ENABLED === 'true'
);
