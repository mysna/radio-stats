-- 채널명(예: "SBS 러브FM")을 화면에 그대로 보여주기 위한 컬럼. channel_id는
-- "seoul-011-sbs-lovefm-main"처럼 사람이 읽기 위한 값이 아니라서 별도로 저장한다.
ALTER TABLE listen_sessions ADD COLUMN channel_name TEXT;
ALTER TABLE visitor_daily_listen ADD COLUMN channel_name TEXT;
ALTER TABLE program_daily_listen ADD COLUMN channel_name TEXT;
