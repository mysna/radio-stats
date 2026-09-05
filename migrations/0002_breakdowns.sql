-- 방송국/채널/지역/프로그램별 통계를 위한 컬럼과 집계 테이블.
-- broadcaster(방송국 코드)와 region_id는 채널마다 고정이라 클라이언트가 청취 시작 시
-- 함께 보내주는 값을 그대로 저장한다. 이 값이 없던 기존 행은 NULL로 남는다.
ALTER TABLE listen_sessions ADD COLUMN broadcaster TEXT;
ALTER TABLE listen_sessions ADD COLUMN region_id TEXT;
ALTER TABLE listen_sessions ADD COLUMN program_id TEXT;
ALTER TABLE listen_sessions ADD COLUMN program_title TEXT;

ALTER TABLE visitor_daily_listen ADD COLUMN broadcaster TEXT;
ALTER TABLE visitor_daily_listen ADD COLUMN region_id TEXT;

-- 채널 x 날짜(KST) x 프로그램 단위로 미리 합산해둔 청취 시간. 프로그램은 청취 도중에도
-- 바뀔 수 있어서 방문자별이 아니라 사이트 전체(채널) 단위로만 집계한다.
-- program_id가 없는(EPG를 모르는) 구간은 program_title 기반의 대체 키로 묶는다.
CREATE TABLE program_daily_listen (
  listen_date TEXT NOT NULL CHECK (listen_date LIKE '____-__-__'),
  channel_id TEXT NOT NULL CHECK (length(trim(channel_id)) > 0),
  program_key TEXT NOT NULL CHECK (length(trim(program_key)) > 0),
  program_title TEXT,
  seconds INTEGER NOT NULL DEFAULT 0 CHECK (seconds >= 0),
  PRIMARY KEY (listen_date, channel_id, program_key)
);
CREATE INDEX program_daily_listen_date_idx ON program_daily_listen(listen_date);
