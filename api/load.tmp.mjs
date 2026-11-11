// production check: a long (~3 min) Daily Burrow replay must fit Cloudflare's CPU limit
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createRequire } from 'module';
const SIM = createRequire(import.meta.url)(process.env.SIMCJS);
const API = 'https://cheek-pouch-api.cheek-pouch-api.workers.dev', H = { 'Content-Type': 'application/json', Origin: 'https://cheek-pouch.live' };
let tok; const call = async (p, m = 'GET', b) => { const r = await fetch(API + p, { method: m, headers: { ...H, ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: b ? JSON.stringify(b) : undefined }); return [r.status, await r.json().catch(() => ({}))]; };
const a = privateKeyToAccount(generatePrivateKey());
let [, d] = await call('/auth/nonce', 'POST', { address: a.address });
[, d] = await call('/auth/verify', 'POST', { message: d.message, signature: await a.signMessage({ message: d.message }) }); tok = d.token;
const [, run] = await call('/runs', 'POST', { mode: 'daily' });
const g = SIM.create({ seed: run.seed, goldTicks: run.goldTicks, mult: 1 }), inputs = []; let last = -1;
while (!g.s.over && g.s.tick < 30 * 600) {
  const s = g.s, h = s.ham; let bits = 0, tx = h.held.length >= 8 ? 60 : null, bd = 1e9;
  if (tx == null) for (const it of s.items) if (it.kind !== 'pebble') { const dd = Math.abs(it.x - h.x); if (dd < bd) { bd = dd; tx = it.x; } }
  for (const it of s.items) if (it.kind === 'pebble' && Math.abs(it.x - h.x) < 40 && it.y > 250) tx = h.x + (it.x > h.x ? -120 : 120);
  if (tx != null) bits |= tx < h.x - 6 ? SIM.LEFT : tx > h.x + 6 ? SIM.RIGHT : 0;
  if (s.paw && s.paw.warn <= 0 && Math.abs(s.paw.x - h.x) < 140) bits |= SIM.JUMP;
  if (bits !== last) { inputs.push(s.tick + 1, bits); last = bits; } g.step(bits); g.s.ev.length = 0;
}
await new Promise(r => setTimeout(r, Math.ceil(g.s.tick / 30) * 1000));
const [st, res] = await call(`/runs/${run.runId}/finish`, 'POST', { score: g.s.score, level: g.s.level, ticks: g.s.tick, inputs });
console.log(`run ${(g.s.tick / 30 / 60).toFixed(1)} min, score ${g.s.score}, L${g.s.level} -> HTTP ${st} ${res.error || 'accepted, daily rank ' + (res.daily && res.daily.rank)}`);
console.log('TEST_ADDRESS', a.address.toLowerCase());
