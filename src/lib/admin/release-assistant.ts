import 'server-only';

export type ReleaseSuggestionCandidate = {
  id: number; name: string; description: string | null; version: string | null; size: string | null;
  category: string | null; platform: string | null; developer: string | null; image_url: string | null;
  active: boolean; published: boolean;
};
type Input = { name: string; version: string; platform: string };
type Match = ReleaseSuggestionCandidate & { confidence: number; reason: string; duplicateVersion: boolean };
type Provider = 'openai' | 'similarity';

function clean(value: unknown) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/(?:^|[\s_-])v?\d+(?:\.\d+){1,5}(?:[-+][\w.-]+)?(?=$|[\s_-])/giu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
function platformKey(value: unknown) {
  const p = clean(value).replace(/ /g, '');
  if (!p) return 'unspecified';
  if (p.includes('android')) return 'android';
  if (p.includes('windows') || ['win32','win64','pc'].includes(p)) return 'windows';
  if (['ios','iphone','ipad'].includes(p) || p.startsWith('ios')) return 'ios';
  if (p.includes('macos') || p === 'mac') return 'macos';
  if (p.includes('linux')) return 'linux';
  return p;
}
function similarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const a = new Set(left.split(' ')), b = new Set(right.split(' '));
  const intersection = [...a].filter(token => b.has(token)).length;
  const tokenDice = 2 * intersection / Math.max(1, a.size + b.size);
  const compactA = left.replace(/ /g, ''), compactB = right.replace(/ /g, '');
  if (compactA === compactB) return 0.98;
  if (compactA.includes(compactB) || compactB.includes(compactA)) {
    return Math.min(0.94, 0.72 + Math.min(compactA.length, compactB.length) / Math.max(compactA.length, compactB.length) * 0.22);
  }
  const bigrams = (value: string) => {
    const set = new Set<string>();
    for (let i = 0; i < value.length - 1; i++) set.add(value.slice(i, i + 2));
    return set;
  };
  const ga = bigrams(compactA), gb = bigrams(compactB);
  const bigramDice = 2 * [...ga].filter(x => gb.has(x)).length / Math.max(1, ga.size + gb.size);
  return Math.max(tokenDice, bigramDice * 0.92);
}
function heuristicScore(input: Input, candidate: ReleaseSuggestionCandidate) {
  const wantedPlatform = platformKey(input.platform), gotPlatform = platformKey(candidate.platform);
  if (wantedPlatform !== 'unspecified' && gotPlatform !== 'unspecified' && wantedPlatform !== gotPlatform) return 0;
  const nameScore = similarity(clean(input.name), clean(candidate.name));
  const platformBoost = wantedPlatform === gotPlatform ? 0.04 : 0;
  return Math.min(1, nameScore * 0.96 + platformBoost);
}
async function aiRank(input: Input, candidates: ReleaseSuggestionCandidate[], env: NodeJS.ProcessEnv) {
  const key = env.OPENAI_API_KEY;
  if (!key || !candidates.length) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.RELEASE_MATCH_MODEL || 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a cautious software catalog identity reviewer. Choose only IDs from the provided candidate list that are clearly the same application/product, not merely related apps, editions, or competitors. Platform/OS must match. If uncertain, return no match. Do not invent facts. Return JSON: {"matches":[{"id":number,"confidence":number,"reason":"short Arabic explanation"}]}.' },
          { role: 'user', content: JSON.stringify({ wanted: { name: input.name, version: input.version, platform: input.platform }, candidates: candidates.map(({ id, name, version, platform, category, developer, description }) => ({ id, name, version, platform, category, developer, description: description?.slice(0, 240) ?? null })) }) }
        ]
      })
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object') return null;
    const choices = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices;
    const content = choices?.[0]?.message?.content;
    if (!content || content.length > 4000) return null;
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { matches?: unknown }).matches)) return null;
    const byId = new Map(candidates.map(candidate => [candidate.id, candidate]));
    const seen = new Set<number>();
    const matches: Match[] = [];
    for (const raw of (parsed as { matches: unknown[] }).matches.slice(0, 5)) {
      if (!raw || typeof raw !== 'object') continue;
      const match = raw as { id?: unknown; confidence?: unknown; reason?: unknown };
      if (!Number.isSafeInteger(match.id) || typeof match.confidence !== 'number' || !Number.isFinite(match.confidence)) continue;
      const id = Number(match.id), confidence = Math.max(0, Math.min(1, match.confidence));
      const candidate = byId.get(id);
      if (!candidate || seen.has(id) || confidence < 0.35 || heuristicScore(input, candidate) < 0.22) continue;
      seen.add(id);
      matches.push({ ...candidate, confidence, reason: typeof match.reason === 'string' ? match.reason.slice(0, 180) : 'اقتراح ذكاء اصطناعي؛ يلزم تأكيدك', duplicateVersion: String(candidate.version ?? '').trim().toLocaleLowerCase() === input.version.trim().toLocaleLowerCase() });
    }
    return matches.sort((a, b) => b.confidence - a.confidence);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Read-only, owner-triggered release suggestions. The model can rank only supplied
 * catalog IDs and cannot create, edit, publish, or link any application.
 */
export async function suggestApplicationReleases(candidates: ReleaseSuggestionCandidate[], input: Input, env: NodeJS.ProcessEnv = process.env) {
  const byId = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const shortlisted = [...byId.values()]
    .map(candidate => ({ candidate, score: heuristicScore(input, candidate) }))
    .filter(item => item.score >= 0.24)
    .sort((a, b) => b.score - a.score || (b.candidate.id - a.candidate.id))
    .slice(0, 18)
    .map(item => item.candidate);
  const ai = await aiRank(input, shortlisted, env);
  if (ai !== null) return { provider: 'openai' as Provider, items: ai.slice(0, 5) };
  const items: Match[] = shortlisted.map(candidate => ({
    ...candidate,
    confidence: heuristicScore(input, candidate),
    reason: clean(input.name) === clean(candidate.name) ? 'الاسم مطابق بعد توحيد الكتابة، مع فحص النظام والإصدار.' : 'تشابه في اسم التطبيق؛ تأكد بنفسك قبل اعتماد الاقتراح.',
    duplicateVersion: String(candidate.version ?? '').trim().toLocaleLowerCase() === input.version.trim().toLocaleLowerCase()
  })).filter(item => item.confidence >= 0.30).slice(0, 5);
  return { provider: 'similarity' as Provider, items };
}
