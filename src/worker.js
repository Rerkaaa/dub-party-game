const RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type,x-host-token' } });
const id = () => crypto.randomUUID();
const roomCode = () => crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(-6).toUpperCase();

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS', 'access-control-allow-headers': 'content-type,x-host-token' } });
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true });
    if (url.pathname === '/api/rooms' && request.method === 'POST') return createRoom(request, env);
    const roomMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)$/);
    if (roomMatch && request.method === 'GET') return getRoom(roomMatch[1], env);
    if (roomMatch && request.method === 'POST') return joinRoom(roomMatch[1], request, env);
    return json({ error: 'Not found' }, 404);
  },
  async scheduled(_, env) { await purgeExpired(env); }
};

async function createRoom(request, env) {
  const { name = 'Host' } = await request.json().catch(() => ({}));
  const now = Date.now(), roomId = id(), hostToken = id();
  let code = roomCode();
  while (await env.DB.prepare('SELECT 1 FROM rooms WHERE code = ?').bind(code).first()) code = roomCode();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO rooms (id, code, host_token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').bind(roomId, code, hostToken, now, now + RETENTION_MS),
    env.DB.prepare('INSERT INTO players (id, room_id, name, joined_at) VALUES (?, ?, ?, ?)').bind(id(), roomId, cleanName(name), now)
  ]);
  return json({ roomId, code, hostToken, expiresAt: now + RETENTION_MS }, 201);
}
async function getRoom(code, env) {
  const room = await env.DB.prepare('SELECT id, code, status, created_at, expires_at FROM rooms WHERE code = ?').bind(code).first();
  if (!room || room.expires_at <= Date.now()) return json({ error: 'Room not found or expired' }, 404);
  const players = await env.DB.prepare('SELECT id, name, joined_at FROM players WHERE room_id = ? ORDER BY joined_at').bind(room.id).all();
  return json({ ...room, players: players.results });
}
async function joinRoom(code, request, env) {
  const room = await env.DB.prepare('SELECT id, expires_at FROM rooms WHERE code = ?').bind(code).first();
  if (!room || room.expires_at <= Date.now()) return json({ error: 'Room not found or expired' }, 404);
  const { name = 'Player' } = await request.json().catch(() => ({}));
  await env.DB.prepare('INSERT INTO players (id, room_id, name, joined_at) VALUES (?, ?, ?, ?)').bind(id(), room.id, cleanName(name), Date.now()).run();
  return getRoom(code, env);
}
function cleanName(name) { return String(name).trim().slice(0, 30) || 'Player'; }
async function purgeExpired(env) {
  const expired = await env.DB.prepare('SELECT object_key FROM game_media WHERE expires_at <= ?').bind(Date.now()).all();
  if (expired.results.length) await env.MEDIA.delete(expired.results.map(row => row.object_key));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM game_media WHERE expires_at <= ?').bind(Date.now()),
    env.DB.prepare('DELETE FROM rooms WHERE expires_at <= ?').bind(Date.now())
  ]);
}
