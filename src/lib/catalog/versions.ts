export type VersionedApplication = {
  id: number;
  name: string | null;
  version: string | null;
  platform: string | null;
  createdAt?: Date | string | null;
};

function normalizeIdentity(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFKC")
    .replace(/\.(apk|xapk|apks|aab|zip|exe|msi|dmg|ipa)$/i, "")
    // Catalog numbers such as "01 CAPCUT PRO" are labels, not part of the app identity.
    .replace(/^\s*(?:#?\d{1,3})[\s.)_-]+(?=[\p{L}])/u, "")
    .replace(/(?:^|[\s_-])v?\d+(?:\.\d+){1,5}(?:[-+][\p{L}\p{N}.-]+)?(?=$|[\s_-])/giu, " ")
    .replace(/_/g, " ")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function normalizePlatform(value: string | null | undefined): string {
  const raw = normalizeIdentity(value);
  if (!raw) return "unspecified";
  if (raw.includes("android")) return "android";
  if (raw.includes("windows") || raw === "win32" || raw === "win64" || raw === "pc") return "windows";
  if (raw.startsWith("ios") || raw === "iphone" || raw === "ipad") return "ios";
  if (raw.includes("macos") || raw.includes("macosx") || raw === "mac") return "macos";
  if (raw.includes("linux")) return "linux";
  return raw;
}

/** Same app title + operating-system track forms a release family. */
export function applicationFamilyKey(app: Pick<VersionedApplication, "name" | "platform"> & { id?: number }): string {
  const name = normalizeIdentity(app.name);
  return name ? name + "::" + normalizePlatform(app.platform) : "id::" + String(app.id ?? "");
}

function timestamp(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function releaseNumbers(version: string | null | undefined): number[] {
  return (version || "").match(/\d+/g)?.slice(0, 12).map(Number) || [];
}

function isPrerelease(version: string | null | undefined): boolean {
  return /\b(alpha|beta|rc|preview|pre[- ]?release|dev|nightly)\b|تجريبي/i.test(version || "");
}

/** Positive means a is newer than b. Numeric versions beat date-only guesses. */
export function compareApplicationVersions(a: VersionedApplication, b: VersionedApplication): number {
  const av = (a.version || "").trim(), bv = (b.version || "").trim();
  const an = releaseNumbers(av), bn = releaseNumbers(bv);
  if (an.length && bn.length) {
    const length = Math.max(an.length, bn.length);
    for (let index = 0; index < length; index++) {
      const left = an[index] || 0, right = bn[index] || 0;
      if (left !== right) return left > right ? 1 : -1;
    }
  } else if (an.length !== bn.length) {
    if (an.length) return 1;
    if (bn.length) return -1;
  }
  if (Boolean(av) !== Boolean(bv)) return av ? 1 : -1;
  const ap = isPrerelease(av), bp = isPrerelease(bv);
  if (ap !== bp) return ap ? -1 : 1;
  const dateDiff = timestamp(a.createdAt) - timestamp(b.createdAt);
  if (dateDiff) return dateDiff > 0 ? 1 : -1;
  return a.id === b.id ? 0 : a.id > b.id ? 1 : -1;
}

/** Return one representative per app family, retaining its first list position. */
export function latestPerApplication<T extends VersionedApplication>(items: readonly T[]): T[] {
  const winners = new Map<string, T>();
  for (const item of items) {
    const key = applicationFamilyKey(item);
    const current = winners.get(key);
    if (!current || compareApplicationVersions(item, current) > 0) winners.set(key, item);
  }
  const seen = new Set<string>();
  const ordered: T[] = [];
  for (const item of items) {
    const key = applicationFamilyKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    const winner = winners.get(key);
    if (winner) ordered.push(winner);
  }
  return ordered;
}

export function sortApplicationVersions<T extends VersionedApplication>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareApplicationVersions(b, a));
}
