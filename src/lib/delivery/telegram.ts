/** Pure validation shared by admin and server delivery. Never accepts a stored URL. */
export function channelUsername(value: unknown): string {
  if (typeof value !== 'string') throw new Error('INVALID_CHANNEL');
  const name = value.replace(/^@/, '').toLowerCase();
  if (!/^[a-z][a-z0-9_]{4,31}$/.test(name)) throw new Error('INVALID_CHANNEL');
  return name;
}
export function configuredChannel(env: NodeJS.ProcessEnv): string {
  // Never mix the ID of one channel with another channel's username.
  if (env.FILES_CHANNEL_ID || env.FILES_CHANNEL_USERNAME) return channelUsername(env.FILES_CHANNEL_USERNAME);
  return channelUsername(env.CHANNEL_USERNAME);
}
export function messageId(value: unknown): number {
  if (typeof value === 'string' && /^[1-9][0-9]{0,9}$/.test(value)) value = Number(value);
  if (!Number.isInteger(value) || Number(value) <= 0 || Number(value) > 2147483647) throw new Error('INVALID_MESSAGE_ID');
  return Number(value);
}
export function telegramDestination(username: unknown, message: unknown, env: NodeJS.ProcessEnv): string {
  const channel = configuredChannel(env);
  if (channelUsername(username) !== channel) throw new Error('WRONG_CHANNEL');
  return `https://t.me/${channel}/${messageId(message)}`;
}
export function telegramReference(body: Record<string, unknown>, env: NodeJS.ProcessEnv) {
  let username = body.channel_username, message = body.message_id;
  if ('url' in body) {
    if (Object.keys(body).some(k => k !== 'url')) throw new Error('INVALID_SOURCE');
    if (typeof body.url !== 'string' || body.url.length > 200) throw new Error('INVALID_SOURCE');
    const url = new URL(body.url);
    if (url.protocol !== 'https:' || url.hostname !== 't.me' || url.port || url.username || url.password || url.search || url.hash)
      throw new Error('INVALID_SOURCE');
    const match = /^\/([a-zA-Z][a-zA-Z0-9_]{4,31})\/([1-9][0-9]{0,9})$/.exec(url.pathname);
    if (!match) throw new Error('INVALID_SOURCE');
    [, username, message] = match;
  } else if (Object.keys(body).some(k => !['channel_username','message_id'].includes(k))) throw new Error('INVALID_SOURCE');
  telegramDestination(username, message, env);
  return { username: channelUsername(username), messageId: messageId(message) };
}
