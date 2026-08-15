CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  host_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'lobby' CHECK(status IN ('lobby', 'playing', 'complete')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  joined_at INTEGER NOT NULL
);
CREATE TABLE game_media (
  object_key TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('recording', 'upload')),
  content_type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE scenes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  duration_seconds REAL,
  created_at INTEGER NOT NULL
);
CREATE INDEX room_expiry ON rooms(expires_at);
CREATE INDEX media_expiry ON game_media(expires_at);
