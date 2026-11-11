// Cheek Pouch API: wallet sign-in (EIP-4361 message, free, no transaction),
// saved progress per wallet, server-timed runs and a shared leaderboard.

import { getAddress, isAddress, verifyMessage } from 'viem';

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
const LEVEL_SECS = 20;                // must match the game

const now = () => Math.floor(Date.now() / 1000);
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const randomHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
async function sha256(text) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

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

async function body(req) {
  try { return await req.json(); } catch { return {}; }
}

// ---------- players ----------
function publicPlayer(p) {
  if (!p) return null;
  return {
    address: p.address, nick: p.nick || null,
    bestScore: p.best_score, bestLevel: p.best_level, bestSecs: p.best_secs,
    runs: p.runs, totalScore: p.total_score,
    squeeks: p.squeeks, staked: p.staked, topLevel: p.top_level,
    perks: { crown: p.squeeks >= 1, shades: p.staked >= 1, scarf: p.top_level >= 2, gold: p.squeeks >= 10 },
  };
}
const short = a => a.slice(0, 6) + '…' + a.slice(-4);

async function getPlayer(env, address) {
  return env.DB.prepare('SELECT * FROM players WHERE address = ?').bind(address).first();
}

// Squeek holdings from Squeekchain's public API (first 100 tokens for the top level)
async function refreshHoldings(env, address, force = false) {
  const p = await getPlayer(env, address);
  if (p && !force && now() - p.holdings_at < HOLDINGS_TTL) return p;
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
      .bind(held + staked, staked, top, now(), address).run();
  } catch (e) {
    // keep the last known holdings; perks are cosmetic
  }
  return getPlayer(env, address);
}

// ---------- auth ----------
async function sessionAddress(req, env) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
  if (!m) return null;
  const row = await env.DB.prepare('SELECT address, expires_at FROM sessions WHERE token_hash = ?').bind(await sha256(m[1])).first();
  return row && row.expires_at > now() ? row.address : null;
}

async function nonce(req, env) {
  const { address } = await body(req);
  if (!address || !isAddress(address, { strict: false })) return fail(req, 400, 'bad_address', 'That is not a wallet address.');
  const checksummed = getAddress(address);
  const n = randomHex(16);
  const issued = new Date().toISOString();
  const message =
    `${SITE} wants you to sign in with your Ethereum account:\n${checksummed}\n\n` +
    `Sign in to Cheek Pouch to save your progress. This is free and does not send a transaction.\n\n` +
    `URI: https://${SITE}\nVersion: 1\nChain ID: 1\nNonce: ${n}\nIssued At: ${issued}`;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM nonces WHERE expires_at < ?').bind(now()),
    env.DB.prepare('INSERT INTO nonces (nonce, address, message, expires_at) VALUES (?, ?, ?, ?)').bind(n, checksummed.toLowerCase(), message, now() + NONCE_TTL),
  ]);
  return json(req, { message });
}

async function verify(req, env) {
  const { message, signature } = await body(req);
  const n = typeof message === 'string' && (message.match(/\nNonce: ([0-9a-f]{32})\n/) || [])[1];
  if (!n || typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature)) return fail(req, 400, 'bad_request', 'Missing message or signature.');
  const row = await env.DB.prepare('SELECT * FROM nonces WHERE nonce = ?').bind(n).first();
  await env.DB.prepare('DELETE FROM nonces WHERE nonce = ?').bind(n).run();
  if (!row || row.expires_at < now() || row.message !== message) return fail(req, 401, 'expired', 'That sign-in request expired. Try again.');
  let ok = false;
  try { ok = await verifyMessage({ address: getAddress(row.address), message, signature }); } catch { ok = false; }
  if (!ok) return fail(req, 401, 'bad_signature', 'The signature does not match this wallet.');

  const address = row.address;
  const token = randomHex(32);
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO players (address, created_at) VALUES (?, ?)').bind(address, now()),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()),
    env.DB.prepare('INSERT INTO sessions (token_hash, address, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), address, now() + SESSION_TTL),
  ]);
  const p = await refreshHoldings(env, address, true);
  return json(req, { token, player: publicPlayer(p) });
}

async function logout(req, env) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer ([0-9a-f]{64})$/);
  if (m) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(m[1])).run();
  return json(req, { ok: true });
}

// ---------- profile ----------
async function me(req, env, address) {
  return json(req, { player: publicPlayer(await refreshHoldings(env, address)) });
}

async function setNick(req, env, address) {
  const { nick } = await body(req);
  // letters, digits, spaces and a few symbols; 1-16 characters
  const clean = typeof nick === 'string' ? nick.normalize('NFKC').replace(/[^\p{L}\p{N} ._\-!?]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16) : '';
  await env.DB.prepare('UPDATE players SET nick = ? WHERE address = ?').bind(clean || null, address).run();
  return json(req, { player: publicPlayer(await getPlayer(env, address)) });
}

// ---------- runs ----------
async function startRun(req, env, address) {
  const id = randomHex(16);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM runs WHERE started_at < ?').bind(now() - 24 * 3600),
    env.DB.prepare('INSERT INTO runs (id, address, started_at) VALUES (?, ?, ?)').bind(id, address, now()),
  ]);
  return json(req, { runId: id });
}

async function finishRun(req, env, address, id) {
  const { score, level } = await body(req);
  const run = await env.DB.prepare('SELECT * FROM runs WHERE id = ? AND address = ?').bind(id, address).first();
  if (!run) return fail(req, 404, 'no_run', 'That run was not found.');
  if (run.finished_at) return fail(req, 409, 'already_finished', 'That run was already saved.');
  const secs = now() - run.started_at;
  const s = Math.floor(Number(score)), l = Math.floor(Number(level));
  // sanity checks against the server's own clock: levels come every LEVEL_SECS seconds,
  // and even perfect play with the wheel boost can't bank faster than this
  const maxLevel = 1 + Math.floor(secs / LEVEL_SECS) + 1;
  const maxScore = 40 * secs + 400;
  if (!Number.isFinite(s) || !Number.isFinite(l) || s < 0 || l < 1 || l > maxLevel || s > maxScore) {
    await env.DB.prepare('UPDATE runs SET finished_at = ? WHERE id = ?').bind(now(), id).run();
    return fail(req, 422, 'run_rejected', 'That run did not add up, so it was not saved.');
  }
  const p = await getPlayer(env, address);
  const isBest = s > p.best_score;
  await env.DB.batch([
    env.DB.prepare('UPDATE runs SET finished_at = ?, score = ?, level = ? WHERE id = ?').bind(now(), s, l, id),
    env.DB.prepare(
      `UPDATE players SET runs = runs + 1, total_score = total_score + ?, last_run_at = ?,
         best_score = MAX(best_score, ?),
         best_level = CASE WHEN ? > best_score THEN ? ELSE best_level END,
         best_secs  = CASE WHEN ? > best_score THEN ? ELSE best_secs END
       WHERE address = ?`
    ).bind(s, now(), s, s, l, s, secs, address),
  ]);
  const fresh = await refreshHoldings(env, address);
  const rank = await env.DB.prepare('SELECT COUNT(*) + 1 AS rank FROM players WHERE best_score > ?').bind(fresh.best_score).first();
  return json(req, { player: publicPlayer(fresh), isBest, rank: rank.rank });
}

// ---------- leaderboard ----------
async function leaderboard(req, env) {
  const { results } = await env.DB.prepare(
    'SELECT address, nick, best_score, best_level, squeeks FROM players WHERE best_score > 0 ORDER BY best_score DESC, last_run_at ASC LIMIT 20'
  ).all();
  return json(req, {
    players: results.map(p => ({ address: short(p.address), id: p.address, nick: p.nick || null, bestScore: p.best_score, bestLevel: p.best_level, holder: p.squeeks > 0 })),
  });
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (req.method === 'GET' && path === '/') return json(req, { ok: true, service: 'cheek-pouch-api' });
      if (req.method === 'GET' && path === '/leaderboard') return leaderboard(req, env);
      if (req.method === 'POST' && path === '/auth/nonce') return nonce(req, env);
      if (req.method === 'POST' && path === '/auth/verify') return verify(req, env);
      if (req.method === 'POST' && path === '/auth/logout') return logout(req, env);

      const address = await sessionAddress(req, env);
      if (!address) return fail(req, 401, 'signed_out', 'Sign in with your wallet first.');
      if (req.method === 'GET' && path === '/me') return me(req, env, address);
      if (req.method === 'PATCH' && path === '/me') return setNick(req, env, address);
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
