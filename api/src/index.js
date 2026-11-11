// Cheek Pouch API: wallet sign-in (EIP-4361 message, free, no transaction), saved progress per wallet,
// Daily Burrow (same run for everyone, verified by replaying the key presses), Block Champion,
// daily and weekly missions, streaks, XP and the wardrobe.

import { getAddress, isAddress, verifyMessage } from 'viem';
import SIM from './sim.gen.js';

const ALLOWED_ORIGINS = new Set([
  'https://cheek-pouch.live',
  'https://www.cheek-pouch.live',
  'https://the-9thcypher.github.io',
]);
const SITE = 'cheek-pouch.live';
const NONCE_TTL = 10 * 60;            // seconds
const SESSION_TTL = 30 * 24 * 3600;   // seconds
const HOLDINGS_TTL = 60 * 60;         // refresh Squeek holdings at most hourly
const STATUS_TTL = 30 * 1000;         // ms; Squeekchain status cache
const MAX_INPUTS = 40000;             // flat [tick, bits] entries in one replay
const MAX_OPEN_NONCES = 5;            // unexpired sign-in requests per address
const MAX_RUNS_PER_MINUTE = 6;        // run starts per player per minute

const DAILY_POOL = [
  { id: 'haul8', title: 'Bank 8+ seeds in one trip', metric: 'maxHaul', goal: 8, run: true },
  { id: 'lvl4', title: 'Reach level 4', metric: 'level', goal: 4, run: true },
  { id: 'gold2', title: 'Catch 2 golden seeds in one run', metric: 'golds', goal: 2, run: true },
  { id: 'pts400', title: 'Bank 400 points today', metric: 'score', goal: 400 },
  { id: 'runs3', title: 'Play 3 runs', metric: 'runs', goal: 3 },
  { id: 'paw4', title: 'Survive 4 cat paws', metric: 'pawsDodged', goal: 4 },
  { id: 'power1', title: 'Grab a power-up', metric: 'powerups', goal: 1 },
  { id: 'daily1', title: "Play today's Daily Burrow", metric: 'daily', goal: 1 },
  { id: 'seeds60', title: 'Catch 60 seeds', metric: 'seeds', goal: 60 },
];
const WEEKLY_POOL = [
  { id: 'pts3000', title: 'Bank 3,000 points this week', metric: 'score', goal: 3000 },
  { id: 'lvl7', title: 'Reach level 7', metric: 'level', goal: 7, run: true },
  { id: 'full5', title: 'Bank five full 12-seed hauls', metric: 'fullHauls', goal: 5 },
  { id: 'days4', title: 'Play on 4 different days', metric: 'newDay', goal: 4 },
  { id: 'awake1', title: 'Play a run while Squeektoshi is running', metric: 'awake', goal: 1 },
  { id: 'block1', title: 'Take the lead on a Squeekchain block', metric: 'blockLead', goal: 1 },
  { id: 'owl10', title: 'Dodge 10 owl swoops', metric: 'owlsDodged', goal: 10 },
];
const DAILY_XP = 100, WEEKLY_XP = 400;
const DUEL_TTL = 48 * 3600;           // seconds to accept and play a duel
const DUEL_GRACE = 3600;              // a run started before expiry may still finish
const DUEL_PLAY_XP = 25, DUEL_WIN_XP = 150, DUEL_TIE_XP = 75;
const DUEL_PRIZES_PER_DAY = 3;        // prize-paying duels per player per UTC day
const MAX_OPEN_DUELS = 5;             // unaccepted duels per challenger
const MAX_LIVE_DUELS = 12;            // unfinished duels per challenger, rematches included
const CUP_XP = 500;                   // weekly Duel Cup champion

const nowS = () => Math.floor(Date.now() / 1000);
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const randomHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
async function sha256(text) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}
const today = () => new Date().toISOString().slice(0, 10);
function addDays(day, n) { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function weekStart(day) { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
const short = a => a.slice(0, 6) + '…' + a.slice(-4);

let devOrigin = null; // set from env.DEV_ORIGIN for local testing only
function cors(req) {
  const origin = req.headers.get('Origin');
  return ALLOWED_ORIGINS.has(origin) || (devOrigin && origin === devOrigin)
    ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS', 'Access-Control-Max-Age': '86400' }
    : { 'Vary': 'Origin' };
}
function json(req, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(req) } });
}
const fail = (req, status, error, message) => json(req, { error, message }, status);
async function body(req) { try { return await req.json(); } catch { return {}; } }

// ---------- Squeekchain ----------
let statusCache = { at: 0, value: null };
async function squeekStatus() {
  if (Date.now() - statusCache.at < STATUS_TTL && statusCache.value) return statusCache.value;
  try {
    const r = await fetch('https://api.squeekchain.com/v1/status', { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('status ' + r.status);
    const d = await r.json();
    const m = d.measurement || {}, b = d.builder || {}, p = b.projected || b.anchor || {};
    const height = Number(p.blockHeight) || 0;
    if (!height) throw new Error('no height');
    const fresh = m.freshness === 'online';
    const value = { height, block: height + 1, running: fresh && ((m.coreStatus && m.coreStatus !== 'IDLE') || Number(m.rpmMilli) > 0) };
    statusCache = { at: Date.now(), value };
    return value;
  } catch (e) {
    return statusCache.value; // last good reading, or null
  }
}

// the day's golden-seed plan comes from Squeektoshi's wheel work the day before, fixed once known
async function dailyInfo(env, day) {
  const row = await env.DB.prepare('SELECT work FROM daily_info WHERE day = ?').bind(day).first();
  let work = row ? row.work : null;
  if (work === null) {
    try {
      const r = await fetch('https://api.squeekchain.com/v1/measurement/stats?range=7d', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('stats ' + r.status);
      const d = await r.json();
      const prev = ((d.activity && d.activity.days) || []).find(x => x.date === addDays(day, -1));
      work = prev ? Number(prev.observedWorkUnits) || 0 : 0;
      await env.DB.prepare('INSERT OR IGNORE INTO daily_info (day, work) VALUES (?, ?)').bind(day, work).run();
    } catch (e) {
      work = 0; // not stored, so the real figure is used once Squeekchain answers
    }
  }
  const plan = SIM.goldPlan(day, work);
  return { day, seed: SIM.daySeed(day), work, golds: plan.count, goldTicks: plan.ticks };
}

// ---------- players ----------
const defaultEquip = { hat: 'none', fur: 'classic', extra: 'none' };
function perksOf(p) {
  const w = p.duel_wins || 0;
  return { crown: p.squeeks >= 1, shades: p.staked >= 1, scarf: p.top_level >= 2, gold: p.squeeks >= 10, duel1: w >= 1, duel5: w >= 5, duel15: w >= 15, duel30: w >= 30, cup: (p.cups || 0) >= 1 };
}
function equipOf(p) {
  let e = {};
  try { e = JSON.parse(p.equip || '{}') || {}; } catch { e = {}; }
  const lvl = SIM.levelForXp(p.xp || 0), perks = perksOf(p), out = {};
  for (const slot of Object.keys(defaultEquip)) {
    const item = SIM.COSMETICS[slot].find(c => c.id === e[slot]);
    out[slot] = item && SIM.unlocked(item, lvl, perks) ? item.id : defaultEquip[slot];
  }
  return out;
}
async function extras(env, address) {
  const st = await squeekStatus();
  const won = st
    ? await env.DB.prepare('SELECT COUNT(*) AS n FROM block_best WHERE address = ? AND block <= ?').bind(address, st.height).first()
    : { n: 0 };
  const podiums = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM daily_best d WHERE d.address = ? AND d.day < ?
       AND (SELECT COUNT(*) FROM daily_best d2 WHERE d2.day = d.day AND d2.score > d.score) < 3`
  ).bind(address, today()).first();
  return { blocksWon: won.n, podiums: podiums.n };
}
async function publicPlayer(env, p) {
  if (!p) return null;
  const lvl = SIM.levelForXp(p.xp || 0);
  const ex = await extras(env, p.address);
  return {
    address: p.address, nick: p.nick || null,
    bestScore: p.best_score, bestLevel: p.best_level, bestSecs: p.best_secs,
    runs: p.runs, totalScore: p.total_score,
    squeeks: p.squeeks, staked: p.staked, topLevel: p.top_level,
    perks: perksOf(p),
    xp: p.xp || 0, hamsterLevel: lvl, xpLevelStart: SIM.xpForLevel(lvl), xpNextLevel: SIM.xpForLevel(lvl + 1),
    streak: p.last_play_day && p.last_play_day >= addDays(today(), -1) ? p.streak : 0, bestStreak: p.best_streak,
    equip: equipOf(p), blocksWon: ex.blocksWon, podiums: ex.podiums, duelWins: p.duel_wins || 0, duelLosses: p.duel_losses || 0, cups: p.cups || 0,
  };
}
const getPlayer = (env, address) => env.DB.prepare('SELECT * FROM players WHERE address = ?').bind(address).first();

async function refreshHoldings(env, address, force = false) {
  const p = await getPlayer(env, address);
  if (p && !force && nowS() - p.holdings_at < HOLDINGS_TTL) return p;
  try {
    const base = `https://api.squeekchain.com/v1/accounts/${address}`;
    let url = base, pages = 0, counts = null, top = 0;
    while (url && pages < 4) {
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('squeekchain ' + r.status);
      const d = await r.json();
      counts = counts || d.tokenCounts || {};
      for (const t of d.tokens || []) top = Math.max(top, Number(t.level) || 0);
      pages++;
      url = d.nextCursor ? `${base}?cursor=${encodeURIComponent(d.nextCursor)}` : null;
    }
    const staked = Number(counts.staking) || 0, held = Number(counts.wallet) || 0;
    await env.DB.prepare('UPDATE players SET squeeks = ?, staked = ?, top_level = ?, holdings_at = ? WHERE address = ?')
      .bind(held + staked, staked, top, nowS(), address).run();
  } catch (e) { /* keep the last known holdings; perks are cosmetic */ }
  return getPlayer(env, address);
}

// ---------- auth ----------
async function sessionAddress(req, env) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
  if (!m) return null;
  const row = await env.DB.prepare('SELECT address, expires_at FROM sessions WHERE token_hash = ?').bind(await sha256(m[1])).first();
  return row && row.expires_at > nowS() ? row.address : null;
}
async function nonce(req, env) {
  const { address } = await body(req);
  if (!address || !isAddress(address, { strict: false })) return fail(req, 400, 'bad_address', 'That is not a wallet address.');
  const checksummed = getAddress(address);
  const open = await env.DB.prepare('SELECT COUNT(*) AS n FROM nonces WHERE address = ? AND expires_at > ?').bind(checksummed.toLowerCase(), nowS()).first();
  if (open.n >= MAX_OPEN_NONCES) return fail(req, 429, 'slow_down', 'Too many sign-in attempts. Wait a few minutes and try again.');
  const n = randomHex(16);
  const message =
    `${SITE} wants you to sign in with your Ethereum account:\n${checksummed}\n\n` +
    `Sign in to Cheek Pouch to save your progress. This is free and does not send a transaction.\n\n` +
    `URI: https://${SITE}\nVersion: 1\nChain ID: 1\nNonce: ${n}\nIssued At: ${new Date().toISOString()}`;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM nonces WHERE expires_at < ?').bind(nowS()),
    env.DB.prepare('INSERT INTO nonces (nonce, address, message, expires_at) VALUES (?, ?, ?, ?)').bind(n, checksummed.toLowerCase(), message, nowS() + NONCE_TTL),
  ]);
  return json(req, { message });
}
async function verify(req, env) {
  const { message, signature } = await body(req);
  const n = typeof message === 'string' && (message.match(/\nNonce: ([0-9a-f]{32})\n/) || [])[1];
  if (!n || typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature)) return fail(req, 400, 'bad_request', 'Missing message or signature.');
  const row = await env.DB.prepare('SELECT * FROM nonces WHERE nonce = ?').bind(n).first();
  await env.DB.prepare('DELETE FROM nonces WHERE nonce = ?').bind(n).run();
  if (!row || row.expires_at < nowS() || row.message !== message) return fail(req, 401, 'expired', 'That sign-in request expired. Try again.');
  let ok = false;
  try { ok = await verifyMessage({ address: getAddress(row.address), message, signature }); } catch { ok = false; }
  if (!ok) return fail(req, 401, 'bad_signature', 'The signature does not match this wallet.');
  const address = row.address, token = randomHex(32);
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO players (address, created_at) VALUES (?, ?)').bind(address, nowS()),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(nowS()),
    env.DB.prepare('INSERT INTO sessions (token_hash, address, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), address, nowS() + SESSION_TTL),
  ]);
  return json(req, { token, player: await publicPlayer(env, await refreshHoldings(env, address, true)) });
}
async function logout(req, env) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
  if (m) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(m[1])).run();
  return json(req, { ok: true });
}

// ---------- profile ----------
async function me(req, env, address) {
  return json(req, { player: await publicPlayer(env, await refreshHoldings(env, address)) });
}
async function patchMe(req, env, address) {
  const b = await body(req);
  const p = await getPlayer(env, address);
  if (typeof b.nick === 'string') {
    const clean = b.nick.normalize('NFKC').replace(/[^\p{L}\p{N} ._\-!?]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
    await env.DB.prepare('UPDATE players SET nick = ? WHERE address = ?').bind(clean || null, address).run();
  }
  if (b.equip && typeof b.equip === 'object') {
    const lvl = SIM.levelForXp(p.xp || 0), perks = perksOf(p), cur = equipOf(p);
    for (const slot of Object.keys(defaultEquip)) {
      if (!(slot in b.equip)) continue;
      const item = SIM.COSMETICS[slot].find(c => c.id === b.equip[slot]);
      if (!item) return fail(req, 400, 'bad_item', 'That item does not exist.');
      if (!SIM.unlocked(item, lvl, perks)) return fail(req, 403, 'locked', `${item.name} is still locked.`);
      cur[slot] = item.id;
    }
    await env.DB.prepare('UPDATE players SET equip = ? WHERE address = ?').bind(JSON.stringify(cur), address).run();
  }
  return json(req, { player: await publicPlayer(env, await getPlayer(env, address)) });
}

// ---------- missions ----------
function pick(pool, key, n = 3) {
  const r = SIM.rng(SIM.hashSeed(key));
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}
function missionSets(day) {
  const dKey = 'd:' + day, wKey = 'w:' + weekStart(day);
  return [
    { period: dKey, kind: 'daily', xp: DAILY_XP, list: pick(DAILY_POOL, dKey) },
    { period: wKey, kind: 'weekly', xp: WEEKLY_XP, list: pick(WEEKLY_POOL, wKey) },
  ];
}
async function missionsView(env, address, day = today()) {
  const sets = missionSets(day);
  const rows = address
    ? (await env.DB.prepare('SELECT period, mission, progress, done FROM mission_progress WHERE address = ? AND period IN (?, ?)').bind(address, sets[0].period, sets[1].period).all()).results
    : [];
  const view = {};
  for (const set of sets) {
    view[set.kind] = set.list.map(m => {
      const r = rows.find(x => x.period === set.period && x.mission === m.id);
      return { id: m.id, title: m.title, goal: m.goal, progress: r ? Math.min(r.progress, m.goal) : 0, done: !!(r && r.done), xp: set.xp };
    });
  }
  const tomorrow = addDays(day, 1), nextWeek = addDays(weekStart(day), 7);
  view.resets = { daily: tomorrow + 'T00:00:00Z', weekly: nextWeek + 'T00:00:00Z' };
  return view;
}
async function applyMissions(env, address, day, metrics) {
  const sets = missionSets(day);
  const rows = (await env.DB.prepare('SELECT period, mission, progress, done FROM mission_progress WHERE address = ? AND period IN (?, ?)').bind(address, sets[0].period, sets[1].period).all()).results;
  const writes = [], completed = [];
  let xp = 0;
  for (const set of sets) {
    for (const m of set.list) {
      const r = rows.find(x => x.period === set.period && x.mission === m.id) || { progress: 0, done: 0 };
      if (r.done) continue;
      const v = Number(metrics[m.metric]) || 0;
      const progress = m.run ? Math.max(r.progress, v) : r.progress + v;
      const done = progress >= m.goal ? 1 : 0;
      if (progress === r.progress && !done) continue;
      if (done) { xp += set.xp; completed.push({ title: m.title, xp: set.xp, kind: set.kind }); }
      writes.push(env.DB.prepare(
        'INSERT INTO mission_progress (address, period, mission, progress, done) VALUES (?, ?, ?, ?, ?) ON CONFLICT (address, period, mission) DO UPDATE SET progress = excluded.progress, done = excluded.done'
      ).bind(address, set.period, m.id, progress, done));
    }
  }
  if (writes.length) await env.DB.batch(writes);
  return { xp, completed };
}

// ---------- runs ----------
async function startRun(req, env, address) {
  const b = await body(req);
  const mode = b.mode === 'daily' || b.mode === 'duel' ? b.mode : 'classic';
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM runs WHERE address = ? AND started_at > ?').bind(address, nowS() - 60).first();
  if (recent.n >= MAX_RUNS_PER_MINUTE) return fail(req, 429, 'slow_down', 'Too many runs started in a minute. Take a breath and try again.');
  if (mode === 'duel') return startDuelRun(req, env, address, String(b.duel || ''));
  const id = randomHex(16), day = today();
  // the daily plan is fixed when the run starts, so the replay uses exactly what the player saw
  const info = mode === 'daily' ? await dailyInfo(env, day) : null;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM runs WHERE started_at < ?').bind(nowS() - 24 * 3600),
    env.DB.prepare('INSERT INTO runs (id, address, started_at, mode, day, work) VALUES (?, ?, ?, ?, ?, ?)').bind(id, address, nowS(), mode, day, info ? info.work : null),
  ]);
  return json(req, { runId: id, mode, day, ...(info || {}) });
}

function validInputs(inputs, ticks) {
  if (!Array.isArray(inputs) || inputs.length % 2 || inputs.length > MAX_INPUTS) return false;
  let prev = 0;
  for (let i = 0; i < inputs.length; i += 2) {
    const t = inputs[i], b = inputs[i + 1];
    if (!Number.isInteger(t) || !Number.isInteger(b) || t < prev || t > ticks || b < 0 || b > 7) return false;
    prev = t;
  }
  return true;
}

async function finishRun(req, env, address, id) {
  const b = await body(req);
  const run = await env.DB.prepare('SELECT * FROM runs WHERE id = ? AND address = ?').bind(id, address).first();
  if (!run) return fail(req, 404, 'no_run', 'That run was not found.');
  if (run.finished_at) return fail(req, 409, 'already_finished', 'That run was already saved.');
  const secs = nowS() - run.started_at;
  const score = Math.floor(Number(b.score)), level = Math.floor(Number(b.level));
  const reject = async msg => {
    await env.DB.prepare('UPDATE runs SET finished_at = ? WHERE id = ?').bind(nowS(), id).run();
    return fail(req, 422, 'run_rejected', msg || 'That run did not add up, so it was not saved.');
  };
  if (!Number.isFinite(score) || !Number.isFinite(level) || score < 0 || level < 1) return reject();

  // Free play can't be replayed (its live events can't be reproduced), so it is practice:
  // it counts as a run for streaks and run-count missions, but only verified Daily Burrow runs
  // reach the boards, Block Champion and XP.
  const verified = run.mode === 'daily';
  const duel = run.mode === 'duel' ? await getDuel(env, run.duel) : null;
  const replayed = verified || !!duel;
  let stats = { seeds: 0, golds: 0, maxHaul: 0, fullHauls: 0, pawsDodged: 0, owlsDodged: 0, powerups: 0, hits: 0, hops: 0 }, ticks = 0, inputs = null;
  if (replayed) {
    ticks = Math.floor(Number(b.ticks));
    inputs = b.inputs;
    if (!Number.isInteger(ticks) || ticks < 1 || !validInputs(inputs, ticks)) return reject('That run could not be read, so it was not saved.');
    if (ticks / SIM.HZ > secs * 1.1 + 5) return reject('That run was faster than real time, so it was not saved.');
    const work = run.work != null ? run.work : (await dailyInfo(env, run.day)).work;
    const plan = SIM.goldPlan(run.day, work);
    const s = SIM.replay({ seed: duel ? duel.seed : SIM.daySeed(run.day), goldTicks: plan.ticks, mult: 1 }, inputs, ticks);
    if (!s.over || s.tick !== ticks || s.score !== score || s.level !== level) return reject('That run did not replay the same way, so it was not saved.');
    stats = s.stats;
  }

  const p = await getPlayer(env, address);
  const day = today(), yesterday = addDays(day, -1);
  const newDay = p.last_play_day !== day;
  const streak = !newDay ? p.streak : p.last_play_day === yesterday ? p.streak + 1 : 1;

  // Block Champion: the best score set while the current Squeekchain block is mined
  const st = await squeekStatus();
  let block = null;
  if (st && verified) {
    const cur = await env.DB.prepare('SELECT address, score FROM block_best WHERE block = ?').bind(st.block).first();
    const lead = !cur || score > cur.score;
    if (lead) await env.DB.prepare('INSERT INTO block_best (block, address, score, at) VALUES (?, ?, ?, ?) ON CONFLICT (block) DO UPDATE SET address = excluded.address, score = excluded.score, at = excluded.at')
      .bind(st.block, address, score, nowS()).run();
    block = { block: st.block, lead, took: lead && (!cur || cur.address !== address), best: lead ? score : cur.score };
  }

  // a duel result is saved before XP, so the second finisher settles the duel and both prizes at once
  let duelRes = null;
  if (duel) {
    const side = duel.a === address ? 'a' : 'b';
    await env.DB.prepare(`UPDATE duels SET ${side}_score = ?, ${side}_level = ?, ${side}_ticks = ?, ${side}_inputs = ? WHERE id = ? AND ${side}_run = ? AND ${side}_score IS NULL`)
      .bind(score, level, ticks, JSON.stringify(inputs), duel.id, id).run();
    duelRes = await duelView(env, await resolveDuel(env, await getDuel(env, duel.id)), address);
  }
  const duelPrize = duelRes ? duelRes[duelRes.you].prize : 0; // already added to xp by resolveDuel

  const metrics = {
    ...stats, score: replayed ? score : 0, level: replayed ? level : 0, runs: 1, daily: verified ? 1 : 0, newDay: newDay ? 1 : 0,
    awake: st && st.running ? 1 : 0, blockLead: block && block.took ? 1 : 0,
  };
  const ms = await applyMissions(env, address, day, metrics);
  const streakXp = newDay ? Math.min(10 * streak, 100) : 0;
  const xpGained = (verified ? score + 25 : duel ? DUEL_PLAY_XP : 0) + streakXp + ms.xp + duelPrize;
  const lvlBefore = SIM.levelForXp(p.xp || 0), lvlAfter = SIM.levelForXp((p.xp || 0) + xpGained);
  const isBest = verified && score > p.best_score;
  const bestScore = verified ? score : 0; // Free play never sets the all-time best

  const writes = [
    env.DB.prepare('UPDATE runs SET finished_at = ?, score = ?, level = ? WHERE id = ?').bind(nowS(), score, level, id),
    env.DB.prepare(
      `UPDATE players SET runs = runs + 1, total_score = total_score + ?, last_run_at = ?, xp = xp + ?,
         streak = ?, best_streak = MAX(best_streak, ?), last_play_day = ?,
         best_level = CASE WHEN ? > best_score THEN ? ELSE best_level END,
         best_secs  = CASE WHEN ? > best_score THEN ? ELSE best_secs END,
         best_score = MAX(best_score, ?)
       WHERE address = ?`
    ).bind(bestScore, nowS(), xpGained - duelPrize, streak, streak, day, bestScore, level, bestScore, secs, bestScore, address),
  ];
  let daily = null;
  if (verified) {
    const prev = await env.DB.prepare('SELECT score FROM daily_best WHERE day = ? AND address = ?').bind(run.day, address).first();
    if (!prev || score > prev.score) {
      writes.push(env.DB.prepare(
        'INSERT INTO daily_best (day, address, score, level, ticks, inputs, at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (day, address) DO UPDATE SET score = excluded.score, level = excluded.level, ticks = excluded.ticks, inputs = excluded.inputs, at = excluded.at'
      ).bind(run.day, address, score, level, ticks, JSON.stringify(inputs), nowS()));
    }
    daily = { day: run.day, best: Math.max(score, prev ? prev.score : 0), improved: !prev || score > prev.score };
  }
  await env.DB.batch(writes);
  if (daily) {
    const r = await env.DB.prepare('SELECT COUNT(*) + 1 AS rank FROM daily_best WHERE day = ? AND score > ?').bind(daily.day, daily.best).first();
    daily.rank = r.rank;
  }

  const fresh = await refreshHoldings(env, address);
  const rank = await env.DB.prepare('SELECT COUNT(*) + 1 AS rank FROM players WHERE best_score > ?').bind(fresh.best_score).first();
  return json(req, {
    player: await publicPlayer(env, fresh), isBest, rank: rank.rank, daily, block,
    xpGained, streakXp, levelUp: lvlAfter > lvlBefore ? lvlAfter : null, levelFrom: lvlBefore, missionsDone: ms.completed, streak, verified,
    duel: duelRes,
  });
}

// ---------- duels ----------
const getDuel = (env, id) => env.DB.prepare('SELECT * FROM duels WHERE id = ?').bind(id).first();
const dayStartS = () => Math.floor(Date.parse(today() + 'T00:00:00Z') / 1000);

async function createDuel(req, env, address) {
  const b = await body(req);
  let rival = null;
  if (b.rematch) {
    const old = await getDuel(env, String(b.rematch));
    if (!old || !old.resolved_at || !old.b || (old.a !== address && old.b !== address)) return fail(req, 400, 'no_rematch', 'That duel cannot be rematched.');
    rival = old.a === address ? old.b : old.a;
    // one unfinished duel per pair: hand back the one already waiting
    const waiting = await env.DB.prepare('SELECT * FROM duels WHERE resolved_at IS NULL AND expires_at > ? AND ((a = ? AND b = ?) OR (a = ? AND b = ?)) ORDER BY created_at DESC LIMIT 1')
      .bind(nowS(), address, rival, rival, address).first();
    if (waiting) return json(req, { duel: await duelView(env, waiting, address) });
  }
  const live = await env.DB.prepare('SELECT COUNT(*) AS n FROM duels WHERE a = ? AND resolved_at IS NULL AND expires_at > ?').bind(address, nowS()).first();
  if (live.n >= MAX_LIVE_DUELS) return fail(req, 429, 'too_many_duels', 'You have a lot of duels going. Finish some first.');
  const open = await env.DB.prepare('SELECT COUNT(*) AS n FROM duels WHERE a = ? AND b IS NULL AND resolved_at IS NULL AND expires_at > ?').bind(address, nowS()).first();
  if (!rival && open.n >= MAX_OPEN_DUELS) return fail(req, 429, 'too_many_duels', `You already have ${MAX_OPEN_DUELS} duels nobody has accepted. Share those first.`);
  const day = today(), info = await dailyInfo(env, day);
  const id = randomHex(5), seed = crypto.getRandomValues(new Uint32Array(1))[0];
  await env.DB.prepare('INSERT INTO duels (id, seed, day, work, a, b, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, seed, day, info.work, address, rival, nowS(), nowS() + DUEL_TTL).run();
  return json(req, { duel: await duelView(env, await getDuel(env, id), address) });
}

// settles a duel once both have played, or when it runs out; pays prizes exactly once
async function resolveDuel(env, d) {
  if (!d || d.resolved_at) return d;
  const now = nowS(), doneA = d.a_score != null, doneB = d.b_score != null;
  if (!(doneA && doneB) && now < d.expires_at + DUEL_GRACE) return d;
  const sa = d.a_score || 0, sb = d.b_score || 0;
  const winner = !d.b ? null : sa === sb ? 'tie' : sa > sb ? d.a : d.b;
  const claim = await env.DB.prepare('UPDATE duels SET resolved_at = ?, winner = ? WHERE id = ? AND resolved_at IS NULL').bind(now, winner, d.id).run();
  if (!claim.meta.changes) return getDuel(env, d.id);
  if (winner && (doneA || doneB)) {
    const capped = async addr => (await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM duels WHERE resolved_at >= ? AND ((a = ? AND prize_a > 0) OR (b = ? AND prize_b > 0))'
    ).bind(dayStartS(), addr, addr).first()).n >= DUEL_PRIZES_PER_DAY;
    let pa = 0, pb = 0;
    const writes = [];
    if (winner === 'tie') {
      if (doneA && !(await capped(d.a))) pa = DUEL_TIE_XP;
      if (doneB && !(await capped(d.b))) pb = DUEL_TIE_XP;
    } else {
      const loser = winner === d.a ? d.b : d.a, xp = (await capped(winner)) ? 0 : DUEL_WIN_XP;
      if (winner === d.a) pa = xp; else pb = xp;
      writes.push(env.DB.prepare('UPDATE players SET duel_wins = duel_wins + 1 WHERE address = ?').bind(winner));
      writes.push(env.DB.prepare('UPDATE players SET duel_losses = duel_losses + 1 WHERE address = ?').bind(loser));
    }
    writes.push(env.DB.prepare('UPDATE duels SET prize_a = ?, prize_b = ? WHERE id = ?').bind(pa, pb, d.id));
    if (pa) writes.push(env.DB.prepare('UPDATE players SET xp = xp + ? WHERE address = ?').bind(pa, d.a));
    if (pb) writes.push(env.DB.prepare('UPDATE players SET xp = xp + ? WHERE address = ?').bind(pb, d.b));
    await env.DB.batch(writes);
  }
  return getDuel(env, d.id);
}

async function duelView(env, d, me) {
  const ids = [d.a, d.b].filter(Boolean), who = {};
  const { results } = await env.DB.prepare(`SELECT address, nick, xp, squeeks FROM players WHERE address IN (${ids.map(() => '?').join(', ')})`).bind(...ids).all();
  for (const r of results) who[r.address] = r;
  const side = k => {
    const addr = d[k];
    if (!addr) return null;
    const p = who[addr] || {};
    return { id: addr, address: short(addr), nick: p.nick || null, holder: p.squeeks > 0, hamsterLevel: SIM.levelForXp(p.xp || 0),
      started: !!d[k + '_run'], done: d[k + '_score'] != null, score: d[k + '_score'], level: d[k + '_level'], prize: d['prize_' + k] };
  };
  return {
    id: d.id, status: d.resolved_at ? 'done' : !d.b ? 'open' : 'live', winner: d.winner,
    createdAt: d.created_at, expiresAt: d.expires_at, a: side('a'), b: side('b'),
    you: me === d.a ? 'a' : me && me === d.b ? 'b' : null,
  };
}

// ---------- weekly Duel Cup ----------
const weekStartS = day => Math.floor(Date.parse(weekStart(day) + 'T00:00:00Z') / 1000);
async function cupStandings(env, from, to, limit) {
  return (await env.DB.prepare(
    `SELECT d.winner AS address, COUNT(*) AS wins, MAX(d.resolved_at) AS last, p.nick, p.squeeks, p.streak, p.last_play_day, p.xp, p.duel_wins, p.duel_losses
     FROM duels d JOIN players p ON p.address = d.winner
     WHERE d.resolved_at >= ? AND d.resolved_at < ? AND d.winner IS NOT NULL AND d.winner != 'tie'
     GROUP BY d.winner ORDER BY wins DESC, last ASC LIMIT ?`
  ).bind(from, to, limit).all()).results;
}
// last week's champion, settled (and paid) the first time anyone asks after Monday 00:00 UTC
async function cupChampion(env) {
  const week = addDays(weekStart(today()), -7);
  let row = await env.DB.prepare('SELECT address, wins FROM duel_cups WHERE week = ?').bind(week).first();
  if (!row) {
    const [top] = await cupStandings(env, weekStartS(week), weekStartS(today()), 1);
    const put = await env.DB.prepare('INSERT OR IGNORE INTO duel_cups (week, address, wins) VALUES (?, ?, ?)').bind(week, top ? top.address : null, top ? top.wins : 0).run();
    if (put.meta.changes && top) await env.DB.prepare('UPDATE players SET cups = cups + 1, xp = xp + ? WHERE address = ?').bind(CUP_XP, top.address).run();
    row = { address: top ? top.address : null, wins: top ? top.wins : 0 };
  }
  return { week, ...row };
}

async function duelGet(req, env, address, id) {
  const d = await resolveDuel(env, await getDuel(env, id));
  if (!d) return fail(req, 404, 'no_duel', 'That duel was not found.');
  return json(req, { duel: await duelView(env, d, address) });
}

async function myDuels(req, env, address) {
  const { results } = await env.DB.prepare('SELECT * FROM duels WHERE a = ? OR b = ? ORDER BY created_at DESC LIMIT 8').bind(address, address).all();
  const list = [];
  for (const d of results) list.push(await duelView(env, await resolveDuel(env, d), address));
  return json(req, { duels: list, prizesPerDay: DUEL_PRIZES_PER_DAY, winXp: DUEL_WIN_XP });
}

async function startDuelRun(req, env, address, duelId) {
  const d = await getDuel(env, duelId);
  if (!d) return fail(req, 404, 'no_duel', 'That duel was not found.');
  if (d.resolved_at || nowS() >= d.expires_at) return fail(req, 410, 'duel_over', 'This duel has ended.');
  let side = d.a === address ? 'a' : d.b === address ? 'b' : null;
  if (!side) {
    const claim = d.b ? null : await env.DB.prepare('UPDATE duels SET b = ? WHERE id = ? AND b IS NULL').bind(address, d.id).run();
    if (!claim || !claim.meta.changes) return fail(req, 403, 'duel_full', 'Two hamsters are already in this duel.');
    side = 'b';
  } else if (d[side + '_run']) return fail(req, 409, 'duel_played', 'You have had your go in this duel.');
  const id = randomHex(16);
  const took = await env.DB.prepare(`UPDATE duels SET ${side}_run = ? WHERE id = ? AND ${side}_run IS NULL`).bind(id, d.id).run();
  if (!took.meta.changes) return fail(req, 409, 'duel_played', 'You have had your go in this duel.');
  await env.DB.prepare('INSERT INTO runs (id, address, started_at, mode, day, work, duel) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, address, nowS(), 'duel', d.day, d.work, d.id).run();
  const o = side === 'a' ? 'b' : 'a';
  const rival = d[o + '_score'] != null
    ? { id: d[o], address: short(d[o]), nick: (await getPlayer(env, d[o]) || {}).nick || null, score: d[o + '_score'], level: d[o + '_level'], ticks: d[o + '_ticks'], inputs: JSON.parse(d[o + '_inputs']) }
    : null;
  return json(req, { runId: id, mode: 'duel', duel: d.id, day: d.day, seed: d.seed, goldTicks: SIM.goldPlan(d.day, d.work).ticks, rival });
}

// ---------- boards ----------
const boardRow = (p, i, champ) => ({ rank: i + 1, id: p.address, cup: !!champ && p.address === champ, address: short(p.address), nick: p.nick || null, holder: p.squeeks > 0, streak: p.last_play_day && p.last_play_day >= addDays(today(), -1) ? p.streak : 0, hamsterLevel: SIM.levelForXp(p.xp || 0) });

async function leaderboard(req, env) {
  const champ = await cupChampion(env);
  if (new URL(req.url).searchParams.get('by') === 'duels') {
    const rows = await cupStandings(env, weekStartS(today()), nowS() + 60, 20);
    let lastName = null;
    if (champ.address) { const c = await getPlayer(env, champ.address); lastName = (c && c.nick) || short(champ.address); }
    return json(req, {
      players: rows.map((p, i) => ({ ...boardRow(p, i, champ.address), wins: p.wins, record: `${p.duel_wins}–${p.duel_losses}` })),
      champion: champ.address ? { id: champ.address, name: lastName, wins: champ.wins } : null,
      endsAt: addDays(weekStart(today()), 7) + 'T00:00:00Z', prizeXp: CUP_XP,
    });
  }
  const { results } = await env.DB.prepare(
    'SELECT address, nick, best_score, best_level, squeeks, streak, last_play_day, xp FROM players WHERE best_score > 0 ORDER BY best_score DESC, last_run_at ASC LIMIT 20'
  ).all();
  return json(req, { players: results.map((p, i) => ({ ...boardRow(p, i, champ.address), bestScore: p.best_score, bestLevel: p.best_level })) });
}

async function daily(req, env, address) {
  const url = new URL(req.url);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('day') || '') ? url.searchParams.get('day') : today();
  if (day > today() || day < addDays(today(), -7)) return fail(req, 400, 'bad_day', 'Daily runs are kept for 7 days.');
  const info = await dailyInfo(env, day), champ = await cupChampion(env);
  const { results } = await env.DB.prepare(
    `SELECT d.address, d.score, d.level, p.nick, p.squeeks, p.streak, p.last_play_day, p.xp FROM daily_best d JOIN players p ON p.address = d.address
     WHERE d.day = ? ORDER BY d.score DESC, d.at ASC LIMIT 20`
  ).bind(day).all();
  let mine = null;
  if (address) {
    const m = await env.DB.prepare('SELECT score FROM daily_best WHERE day = ? AND address = ?').bind(day, address).first();
    if (m) mine = { score: m.score, rank: (await env.DB.prepare('SELECT COUNT(*) + 1 AS rank FROM daily_best WHERE day = ? AND score > ?').bind(day, m.score).first()).rank };
  }
  return json(req, { ...info, top: results.map((p, i) => ({ ...boardRow(p, i, champ.address), score: p.score, level: p.level })), me: mine });
}

async function ghost(req, env) {
  const url = new URL(req.url);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('day') || '') ? url.searchParams.get('day') : today();
  const g = await env.DB.prepare(
    `SELECT d.address, d.score, d.level, d.ticks, d.inputs, p.nick FROM daily_best d JOIN players p ON p.address = d.address
     WHERE d.day = ? ORDER BY d.score DESC, d.at ASC LIMIT 1`
  ).bind(day).first();
  if (!g) return json(req, { ghost: null });
  return json(req, { ghost: { id: g.address, address: short(g.address), nick: g.nick || null, score: g.score, level: g.level, ticks: g.ticks, inputs: JSON.parse(g.inputs) } });
}

async function blocks(req, env) {
  const st = await squeekStatus();
  if (!st) return json(req, { current: null, recent: [] });
  const cur = await env.DB.prepare(
    'SELECT b.block, b.address, b.score, p.nick, p.squeeks FROM block_best b JOIN players p ON p.address = b.address WHERE b.block = ?'
  ).bind(st.block).first();
  const { results } = await env.DB.prepare(
    'SELECT b.block, b.address, b.score, p.nick, p.squeeks FROM block_best b JOIN players p ON p.address = b.address WHERE b.block <= ? ORDER BY b.block DESC LIMIT 6'
  ).bind(st.height).all();
  const row = b => b && { block: b.block, id: b.address, address: short(b.address), nick: b.nick || null, score: b.score, holder: b.squeeks > 0 };
  return json(req, { current: { block: st.block, height: st.height, running: st.running, leader: row(cur) }, recent: results.map(row) });
}

export default {
  async fetch(req, env) {
    devOrigin = env.DEV_ORIGIN || null;
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const path = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
    try {
      if (req.method === 'GET' && path === '/') return json(req, { ok: true, service: 'cheek-pouch-api' });
      if (req.method === 'GET' && path === '/leaderboard') return leaderboard(req, env);
      if (req.method === 'GET' && path === '/blocks') return blocks(req, env);
      if (req.method === 'GET' && path === '/daily/ghost') return ghost(req, env);
      if (req.method === 'POST' && path === '/auth/nonce') return nonce(req, env);
      if (req.method === 'POST' && path === '/auth/verify') return verify(req, env);
      if (req.method === 'POST' && path === '/auth/logout') return logout(req, env);

      const address = await sessionAddress(req, env);
      if (req.method === 'GET' && path === '/daily') return daily(req, env, address);
      if (req.method === 'GET' && path === '/missions') return json(req, await missionsView(env, address));
      const duelPath = path.match(/^\/duels\/([0-9a-f]{10})$/);
      if (req.method === 'GET' && duelPath) return duelGet(req, env, address, duelPath[1]);
      if (!address) return fail(req, 401, 'signed_out', 'Sign in with your wallet first.');
      if (req.method === 'GET' && path === '/me') return me(req, env, address);
      if (req.method === 'PATCH' && path === '/me') return patchMe(req, env, address);
      if (req.method === 'POST' && path === '/runs') return startRun(req, env, address);
      if (req.method === 'GET' && path === '/duels') return myDuels(req, env, address);
      if (req.method === 'POST' && path === '/duels') return createDuel(req, env, address);
      const fin = path.match(/^\/runs\/([0-9a-f]{32})\/finish$/);
      if (req.method === 'POST' && fin) return finishRun(req, env, address, fin[1]);
      return fail(req, 404, 'not_found', 'No such endpoint.');
    } catch (e) {
      console.error(e);
      return fail(req, 500, 'server_error', 'Something went wrong on the server.');
    }
  },
};
