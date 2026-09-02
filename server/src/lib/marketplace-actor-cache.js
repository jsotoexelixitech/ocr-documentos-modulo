const store = new Map();
const TTL_MS = 8 * 60 * 60 * 1000;

function preferGestor(a, b) {
  const sa = a != null ? String(a).trim() : '';
  const sb = b != null ? String(b).trim() : '';
  if (!sa) return sb;
  if (!sb) return sa;
  if (sb.startsWith(`${sa}-`)) return sb;
  if (sa.startsWith(`${sb}-`)) return sa;
  if (sa.includes('-') && !sb.includes('-')) return sa;
  if (sb.includes('-') && !sa.includes('-')) return sb;
  return sa;
}

function sidFromReq(req) {
  if (req.query?.sid) return String(req.query.sid);
  if (req.body?.sid) return String(req.body.sid);
  try {
    const ref = req.headers?.referer || '';
    if (ref) return new URL(ref).searchParams.get('sid');
  } catch { /* ignore */ }
  return null;
}

function keysFrom(req, meta = {}) {
  const sid = sidFromReq(req);
  return [
    sid ? `sid:${sid}` : '',
    meta.citem ? `item:${meta.citem}` : '',
    meta.cproductor ? `prod:${meta.cproductor}` : '',
    meta.centidad && meta.citem ? `${meta.centidad}:${meta.citem}` : '',
  ].filter(Boolean);
}

function remember(cgestor, keys) {
  const g = cgestor != null ? String(cgestor).trim() : '';
  if (!g || !keys.length) return;
  const rec = { cgestor: g, at: Date.now() };
  for (const key of keys) store.set(key, rec);
}

function lookup(keys) {
  let best = '';
  for (const key of keys) {
    const rec = store.get(key);
    if (!rec || Date.now() - rec.at > TTL_MS) continue;
    best = preferGestor(best, rec.cgestor);
  }
  return best;
}

function restoreMarketplaceActor(req) {
  const meta = req.nexusMetadata && typeof req.nexusMetadata === 'object'
    ? req.nexusMetadata
    : {};
  const keys = keysFrom(req, meta);
  if (meta.cgestor) remember(meta.cgestor, keys);
  const cached = lookup(keys);
  const cgestor = preferGestor(meta.cgestor, cached);
  if (cgestor) {
    remember(cgestor, keys);
    req.nexusMetadata = { ...meta, cgestor };
  }
}

module.exports = { restoreMarketplaceActor };
