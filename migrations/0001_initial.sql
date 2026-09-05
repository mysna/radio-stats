PRAGMA foreign_keys = ON;

-- 익명 방문자. id는 클라이언트가 localStorage에 저장해 재방문 시 재사용하는 UUID다.
CREATE TABLE visitors (
  id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  visit_count INTEGER NOT NULL DEFAULT 0 CHECK (visit_count >= 0),
  country TEXT,
  browser TEXT,
  browser_version TEXT,
  os TEXT,
  os_version TEXT,
  device_type TEXT
);

-- 방문(브라우저 tab 단위 1회 접속). "지금 접속 중" 여부는 last_seen_at을 기준으로 판단한다.
CREATE TABLE visits (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ended_at TEXT,
  country TEXT,
  browser TEXT,
  browser_version TEXT,
  os TEXT,
  os_version TEXT,
  device_type TEXT,
  referrer TEXT
);
CREATE INDEX visits_visitor_id_idx ON visits(visitor_id);
CREATE INDEX visits_last_seen_at_idx ON visits(last_seen_at);

-- 채널 하나를 이어서 들은 구간 하나. "지금 무엇을 듣고 있는지"는
-- ended_at IS NULL AND last_heartbeat_at이 최근인 행으로 판단한다.
CREATE TABLE listen_sessions (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  visit_id TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL CHECK (length(trim(channel_id)) > 0),
  started_at TEXT NOT NULL,
  last_heartbeat_at TEXT NOT NULL,
  ended_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0)
);
CREATE INDEX listen_sessions_visitor_id_idx ON listen_sessions(visitor_id);
CREATE INDEX listen_sessions_channel_id_idx ON listen_sessions(channel_id);
CREATE INDEX listen_sessions_live_idx ON listen_sessions(ended_at, last_heartbeat_at);

-- 방문자 x 날짜(KST) x 채널 단위로 미리 합산해둔 청취 시간.
-- listen_sessions 원본을 매번 스캔하지 않고 "하루에 몇 시간 들었는지"를 바로 조회하기 위한 집계 테이블이다.
CREATE TABLE visitor_daily_listen (
  visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  listen_date TEXT NOT NULL CHECK (listen_date LIKE '____-__-__'),
  channel_id TEXT NOT NULL CHECK (length(trim(channel_id)) > 0),
  seconds INTEGER NOT NULL DEFAULT 0 CHECK (seconds >= 0),
  PRIMARY KEY (visitor_id, listen_date, channel_id)
);
CREATE INDEX visitor_daily_listen_date_idx ON visitor_daily_listen(listen_date);
