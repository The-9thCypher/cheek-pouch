// Cheek Pouch API: wallet sign-in (EIP-4361 message, free, no transaction), saved progress per wallet,
// Daily Burrow (same run for everyone, verified by replaying the key presses), Block Champion,
// daily and weekly missions, streaks, XP and the wardrobe.

import { getAddress, isAddress, verifyMessage } from 'viem';
import SIM from './sim.gen.js';

const ALLOWED_ORIGINS = new Set([
  'https://cheek-pouch.live',
  'https://www.cheek-pouch.live',
  'https://the-9thcypher.github.io',
  'http://127.0.0.1:8767',
  'http://localhost:8767',
]);
const SITE = 'cheek-pouch.live';
const NONCE_TTL = 10 * 60;            // seconds
const SESSION_TTL = 30 * 24 * 3600;   // seconds
const HOLDINGS_TTL = 60 * 60;         // refresh Squeek holdings at most hourly
const STATUS_TTL = 30 * 1000;         // ms; Squeekchain status cache
const MAX_INPUTS = 40000;             // flat [tick, bits] entries in one replay

const DAILY_POOL = [
  { id: 'haul8', title: 'Bank 8+ seeds in one trip', metric: 'maxHaul', goal: 8, run: true },
  { id: 'lvl4', title: 'Reach level 4', metric: 'level', goal: 4, run: true },
  { id: 'gold2', title: 'Catch 2 golden seeds in one run', metric: 'golds', goal: 2, run: true },
  { id: 'pts400', title: 'Bank 400 points today', metric: 'score', goal: 400 },
  { id: 'runs3', title: 'Play 3 runs', metric: 'runs', goal: 3 },
  { id: 'paw4', title: 'Hop over 4 cat paws', metric: 'pawsDodged', goal: 4 },
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

function cors(req) {
  const origin = req.headers.get('Origin');
  return ALLOWED_ORIGINS.has(origin)
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
function perksOf(p) { return { crown: p.squeeks >= 1, shades: p.staked >= 1, scarf: p.top_level >= 2, gold: p.squeeks >= 10 }; }
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
    equip: equipOf(p), blocksWon: ex.blocksWon, podiums: ex.podiums,
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
  const mode = b.mode === 'daily' ? 'daily' : 'classic';
  const id = randomHex(16), day = today();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM runs WHERE started_at < ?').bind(nowS() - 24 * 3600),
    env.DB.prepare('INSERT INTO runs (id, address, started_at, mode, day) VALUES (?, ?, ?, ?, ?)').bind(id, address, nowS(), mode, day),
  ]);
  const out = { runId: id, mode, day };
  if (mode === 'daily') Object.assign(out, await dailyInfo(env, day));
  return json(req, out);
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

  let stats, ticks = 0, inputs = null;
  if (run.mode === 'daily') {
    // replay the key presses on the same day's run and compare
    ticks = Math.floor(Number(b.ticks));
    inputs = b.inputs;
    if (!Number.isInteger(ticks) || ticks < 1 || !validInputs(inputs, ticks)) return reject('That run could not be read, so it was not saved.');
    if (ticks / SIM.HZ > secs * 1.1 + 5) return reject('That run was faster than real time, so it was not saved.');
    const info = await dailyInfo(env, run.day);
    const s = SIM.replay({ seed: info.seed, goldTicks: info.goldTicks, mult: 1 }, inputs, ticks);
    if (!s.over || s.tick !== ticks || s.score !== score || s.level !== level) return reject('That run did not replay the same way, so it was not saved.');
    stats = s.stats;
  } else {
    const maxLevel = 1 + Math.floor(secs / SIM.LEVEL_SECS) + 1;
    if (level > maxLevel || score > 40 * secs + 400) return reject();
    const c = b.stats || {}, cap = (v, max) => Math.max(0, Math.min(Math.floor(Number(v) || 0), Math.floor(max)));
    stats = {
      seeds: cap(c.seeds, secs * 4 + 20), golds: cap(c.golds, 40), maxHaul: cap(c.maxHaul, SIM.CAP_BIG), fullHauls: cap(c.fullHauls, secs / 5 + 1),
      pawsDodged: cap(c.pawsDodged, secs / 4 + 1), owlsDodged: cap(c.owlsDodged, secs / 6 + 1), powerups: cap(c.powerups, secs / 14 + 1),
      hits: cap(c.hits, 3), hops: cap(c.hops, secs * 3 + 5),
    };
  }

  const p = await getPlayer(env, address);
  const day = today(), yesterday = addDays(day, -1);
  const newDay = p.last_play_day !== day;
  const streak = !newDay ? p.streak : p.last_play_day === yesterday ? p.streak + 1 : 1;

  // Block Champion: the best score set while the current Squeekchain block is mined
  const st = await squeekStatus();
  let block = null;
  if (st) {
    const cur = await env.DB.prepare('SELECT address, score FROM block_best WHERE block = ?').bind(st.block).first();
    const lead = !cur || score > cur.score;
    if (lead) await env.DB.prepare('INSERT INTO block_best (block, address, score, at) VALUES (?, ?, ?, ?) ON CONFLICT (block) DO UPDATE SET address = excluded.address, score = excluded.score, at = excluded.at')
      .bind(st.block, address, score, nowS()).run();
    block = { block: st.block, lead, took: lead && (!cur || cur.address !== address), best: lead ? score : cur.score };
  }

  const metrics = {
    ...stats, score, level, runs: 1, daily: run.mode === 'daily' ? 1 : 0, newDay: newDay ? 1 : 0,
    awake: st && st.running ? 1 : 0, blockLead: block && block.took ? 1 : 0,
  };
  const ms = await applyMissions(env, address, day, metrics);
  const streakXp = newDay ? Math.min(10 * streak, 100) : 0;
  const xpGained = score + 25 + streakXp + ms.xp;
  const lvlBefore = SIM.levelForXp(p.xp || 0), lvlAfter = SIM.levelForXp((p.xp || 0) + xpGained);
  const isBest = score > p.best_score;

  const writes = [
    env.DB.prepare('UPDATE runs SET finished_at = ?, score = ?, level = ? WHERE id = ?').bind(nowS(), score, level, id),
    env.DB.prepare(
      `UPDATE players SET runs = runs + 1, total_score = total_score + ?, last_run_at = ?, xp = xp + ?,
         streak = ?, best_streak = MAX(best_streak, ?), last_play_day = ?,
         best_level = CASE WHEN ? > best_score THEN ? ELSE best_level END,
         best_secs  = CASE WHEN ? > best_score THEN ? ELSE best_secs END,
         best_score = MAX(best_score, ?)
       WHERE address = ?`
    ).bind(score, nowS(), xpGained, streak, streak, day, score, level, score, secs, score, address),
  ];
  let daily = null;
  if (run.mode === 'daily') {
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
    xpGained, streakXp, levelUp: lvlAfter > lvlBefore ? lvlAfter : null, missionsDone: ms.completed, streak, stats,
  });
}

// ---------- boards ----------
const boardRow = (p, i) => ({ rank: i + 1, id: p.address, address: short(p.address), nick: p.nick || null, holder: p.squeeks > 0, streak: p.last_play_day && p.last_play_day >= addDays(today(), -1) ? p.streak : 0, hamsterLevel: SIM.levelForXp(p.xp || 0) });

async function leaderboard(req, env) {
  const { results } = await env.DB.prepare(
    'SELECT address, nick, best_score, best_level, squeeks, streak, last_play_day, xp FROM players WHERE best_score > 0 ORDER BY best_score DESC, last_run_at ASC LIMIT 20'
  ).all();
  return json(req, { players: results.map((p, i) => ({ ...boardRow(p, i), bestScore: p.best_score, bestLevel: p.best_level })) });
}

async function daily(req, env, address) {
  const url = new URL(req.url);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('day') || '') ? url.searchParams.get('day') : today();
  if (day > today() || day < addDays(today(), -7)) return fail(req, 400, 'bad_day', 'Daily runs are kept for 7 days.');
  const info = await dailyInfo(env, day);
  const { results } = await env.DB.prepare(
    `SELECT d.address, d.score, d.level, p.nick, p.squeeks, p.streak, p.last_play_day, p.xp FROM daily_best d JOIN players p ON p.address = d.address
     WHERE d.day = ? ORDER BY d.score DESC, d.at ASC LIMIT 20`
  ).bind(day).all();
  let mine = null;
  if (address) {
    const m = await env.DB.prepare('SELECT score FROM daily_best WHERE day = ? AND address = ?').bind(day, address).first();
    if (m) mine = { score: m.score, rank: (await env.DB.prepare('SELECT COUNT(*) + 1 AS rank FROM daily_best WHERE day = ? AND score > ?').bind(day, m.score).first()).rank };
  }
  return json(req, { ...info, top: results.map((p, i) => ({ ...boardRow(p, i), score: p.score, level: p.level })), me: mine });
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
      if (!address) return fail(req, 401, 'signed_out', 'Sign in with your wallet first.');
      if (req.method === 'GET' && path === '/me') return me(req, env, address);
      if (req.method === 'PATCH' && path === '/me') return patchMe(req, env, address);
      if (req.method === 'POST' && path === '/runs') return startRun(req, env, address);
      const fin = path.match(/^\/runs\/([0-9a-f]{32})\/finish$/);
      if (req.method === 'POST' && fin) return finishRun(req, env, address, fin[1]);
      return fail(req, 404, 'not_found', 'No such endpoint.');
    } catch (e) {
      console.error(e);
      return fail(req, 500, 'server_error', 'Something went wrong on the server.');
    }
  },
};
