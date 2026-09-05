import { Hono } from "hono";

import { isAuthorized } from "../auth";
import { errorResponse } from "../errors";
import { toKstDate } from "../time";
import type { AppEnv } from "../types";

const DEFAULT_LIVE_THRESHOLD_SECONDS = 90;
const DEFAULT_VISITOR_LIST_LIMIT = 50;
const MAX_VISITOR_LIST_LIMIT = 200;
const DEFAULT_DAILY_RANGE_DAYS = 30;
const MAX_DAILY_RANGE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const adminStats = new Hono<AppEnv>();

adminStats.use("*", async (context, next) => {
  const token = context.env.ADMIN_TOKEN;
  if (!token) {
    return errorResponse(context, 500, "admin_not_configured", "Admin access is not configured.");
  }
  if (!isAuthorized(context.req.header("Authorization"), token)) {
    return errorResponse(context, 401, "unauthorized", "A valid bearer token is required.");
  }
  await next();
});

function liveThresholdSeconds(context: { env: { LIVE_THRESHOLD_SECONDS?: string } }): number {
  const parsed = Number(context.env.LIVE_THRESHOLD_SECONDS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIVE_THRESHOLD_SECONDS;
}

adminStats.get("/summary", async (context) => {
  const db = context.get("db");
  const thresholdSeconds = liveThresholdSeconds(context);
  const liveSince = new Date(Date.now() - thresholdSeconds * 1000).toISOString();
  const todayKst = toKstDate();
  const since7d = toKstDate(new Date(Date.now() - 6 * DAY_MS));
  const since30d = toKstDate(new Date(Date.now() - 29 * DAY_MS));
  const since365d = toKstDate(new Date(Date.now() - 364 * DAY_MS));

  const [
    visitorsTotal,
    visitorsToday,
    currentlyOnline,
    currentlyListening,
    listenToday,
    listenAllTime,
    listeners,
  ] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS value FROM visitors").first<{ value: number }>(),
    db
      .prepare(
        `SELECT COUNT(DISTINCT visitor_id) AS value FROM visits
         WHERE strftime('%Y-%m-%d', started_at, '+9 hours') = ?`,
      )
      .bind(todayKst)
      .first<{ value: number }>(),
    db
      .prepare("SELECT COUNT(*) AS value FROM visits WHERE ended_at IS NULL AND last_seen_at >= ?")
      .bind(liveSince)
      .first<{ value: number }>(),
    db
      .prepare(
        "SELECT COUNT(*) AS value FROM listen_sessions WHERE ended_at IS NULL AND last_heartbeat_at >= ?",
      )
      .bind(liveSince)
      .first<{ value: number }>(),
    db
      .prepare("SELECT COALESCE(SUM(seconds), 0) AS value FROM visitor_daily_listen WHERE listen_date = ?")
      .bind(todayKst)
      .first<{ value: number }>(),
    db
      .prepare("SELECT COALESCE(SUM(duration_seconds), 0) AS value FROM listen_sessions")
      .first<{ value: number }>(),
    // 실제로 재생을 한 번이라도 한 "청취자" 수를 기간별 고유 인원으로 센다(그냥 방문과는 다르다).
    db
      .prepare(
        `SELECT
           COUNT(DISTINCT CASE WHEN listen_date = ?1 THEN visitor_id END) AS today,
           COUNT(DISTINCT CASE WHEN listen_date >= ?2 THEN visitor_id END) AS last_7_days,
           COUNT(DISTINCT CASE WHEN listen_date >= ?3 THEN visitor_id END) AS last_30_days,
           COUNT(DISTINCT CASE WHEN listen_date >= ?4 THEN visitor_id END) AS last_365_days,
           COUNT(DISTINCT visitor_id) AS all_time
         FROM visitor_daily_listen`,
      )
      .bind(todayKst, since7d, since30d, since365d)
      .first<{
        today: number;
        last_7_days: number;
        last_30_days: number;
        last_365_days: number;
        all_time: number;
      }>(),
  ]);

  return context.json({
    visitors_total: visitorsTotal?.value ?? 0,
    visitors_today: visitorsToday?.value ?? 0,
    currently_online: currentlyOnline?.value ?? 0,
    currently_listening: currentlyListening?.value ?? 0,
    listen_seconds_today_total: listenToday?.value ?? 0,
    listen_seconds_alltime_total: listenAllTime?.value ?? 0,
    listeners_today: listeners?.today ?? 0,
    listeners_last_7_days: listeners?.last_7_days ?? 0,
    listeners_last_30_days: listeners?.last_30_days ?? 0,
    listeners_last_365_days: listeners?.last_365_days ?? 0,
    listeners_all_time: listeners?.all_time ?? 0,
    live_threshold_seconds: thresholdSeconds,
  });
});

adminStats.get("/daily", async (context) => {
  const db = context.get("db");
  const days = Math.min(
    Math.max(Number(context.req.query("days")) || DEFAULT_DAILY_RANGE_DAYS, 1),
    MAX_DAILY_RANGE_DAYS,
  );
  // 사이트 전체(모든 방문자 합산) 일별 청취 시간 추이. 방문자별 합산 테이블을
  // 날짜로만 다시 묶어서, 원본 세션 이벤트를 스캔하지 않고 바로 구한다.
  const sinceDate = toKstDate(new Date(Date.now() - (days - 1) * DAY_MS));

  const rows = await db
    .prepare(
      `SELECT listen_date, SUM(seconds) AS seconds, COUNT(DISTINCT visitor_id) AS listeners
       FROM visitor_daily_listen
       WHERE listen_date >= ?
       GROUP BY listen_date
       ORDER BY listen_date ASC`,
    )
    .bind(sinceDate)
    .all<{ listen_date: string; seconds: number; listeners: number }>();

  return context.json({ days: rows.results });
});

adminStats.get("/by-broadcaster", async (context) => {
  const db = context.get("db");
  const rows = await db
    .prepare(
      `SELECT broadcaster, SUM(seconds) AS seconds
       FROM visitor_daily_listen
       WHERE broadcaster IS NOT NULL
       GROUP BY broadcaster
       ORDER BY seconds DESC`,
    )
    .all<{ broadcaster: string; seconds: number }>();
  return context.json({ broadcasters: rows.results });
});

adminStats.get("/by-channel", async (context) => {
  const db = context.get("db");
  const limit = Math.min(Math.max(Number(context.req.query("limit")) || DEFAULT_VISITOR_LIST_LIMIT, 1), MAX_VISITOR_LIST_LIMIT);
  const rows = await db
    .prepare(
      `SELECT channel_id, MAX(channel_name) AS channel_name, SUM(seconds) AS seconds
       FROM visitor_daily_listen
       GROUP BY channel_id
       ORDER BY seconds DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<{ channel_id: string; channel_name: string | null; seconds: number }>();
  return context.json({ channels: rows.results });
});

adminStats.get("/by-region", async (context) => {
  const db = context.get("db");
  // 세부 지역(수도권/부산·울산·경남/...) 대신 요청받은 두 그룹(수도권 vs 지역)으로만 묶는다.
  const rows = await db
    .prepare(
      `SELECT CASE WHEN region_id = 'seoul' THEN '수도권' ELSE '지역' END AS region_group,
              SUM(seconds) AS seconds
       FROM visitor_daily_listen
       WHERE region_id IS NOT NULL
       GROUP BY region_group
       ORDER BY seconds DESC`,
    )
    .all<{ region_group: string; seconds: number }>();
  return context.json({ regions: rows.results });
});

adminStats.get("/demographics", async (context) => {
  const db = context.get("db");
  // 방문자 통계는 visitors(고유 인원) 기준, 유입 경로는 방문마다 다를 수 있어 visits 기준.
  const groupByVisitors = (column: string, unknownLabel: string) =>
    db
      .prepare(
        `SELECT COALESCE(NULLIF(TRIM(${column}), ''), ?) AS label, COUNT(*) AS count
         FROM visitors
         GROUP BY label
         ORDER BY count DESC
         LIMIT 15`,
      )
      .bind(unknownLabel)
      .all<{ label: string; count: number }>();

  const [countries, browsers, osList, devices, referrers] = await Promise.all([
    groupByVisitors("country", "알 수 없음"),
    groupByVisitors("browser", "알 수 없음"),
    groupByVisitors("os", "알 수 없음"),
    groupByVisitors("device_type", "알 수 없음"),
    db
      .prepare(
        `SELECT COALESCE(NULLIF(TRIM(referrer), ''), '직접 방문') AS label, COUNT(*) AS count
         FROM visits
         GROUP BY label
         ORDER BY count DESC
         LIMIT 15`,
      )
      .all<{ label: string; count: number }>(),
  ]);

  return context.json({
    countries: countries.results,
    browsers: browsers.results,
    os: osList.results,
    devices: devices.results,
    referrers: referrers.results,
  });
});

adminStats.get("/by-program", async (context) => {
  const db = context.get("db");
  const limit = Math.min(Math.max(Number(context.req.query("limit")) || DEFAULT_VISITOR_LIST_LIMIT, 1), MAX_VISITOR_LIST_LIMIT);
  const rows = await db
    .prepare(
      `SELECT channel_id, MAX(channel_name) AS channel_name, program_key, MAX(program_title) AS program_title, SUM(seconds) AS seconds
       FROM program_daily_listen
       GROUP BY channel_id, program_key
       ORDER BY seconds DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<{
      channel_id: string;
      channel_name: string | null;
      program_key: string;
      program_title: string | null;
      seconds: number;
    }>();
  return context.json({ programs: rows.results });
});

interface LiveSessionRow {
  session_id: string;
  visitor_id: string;
  channel_id: string;
  channel_name: string | null;
  started_at: string;
  duration_seconds: number;
  country: string | null;
  browser: string | null;
  os: string | null;
  device_type: string | null;
  broadcaster: string | null;
  region_id: string | null;
  program_title: string | null;
}

adminStats.get("/live", async (context) => {
  const db = context.get("db");
  const thresholdSeconds = liveThresholdSeconds(context);
  const liveSince = new Date(Date.now() - thresholdSeconds * 1000).toISOString();

  const [byChannel, sessions] = await Promise.all([
    db
      .prepare(
        `SELECT channel_id, MAX(channel_name) AS channel_name, COUNT(*) AS listeners
         FROM listen_sessions
         WHERE ended_at IS NULL AND last_heartbeat_at >= ?
         GROUP BY channel_id
         ORDER BY listeners DESC`,
      )
      .bind(liveSince)
      .all<{ channel_id: string; channel_name: string | null; listeners: number }>(),
    db
      .prepare(
        `SELECT
           ls.id AS session_id, ls.visitor_id, ls.channel_id, ls.channel_name, ls.started_at, ls.duration_seconds,
           ls.broadcaster, ls.region_id, ls.program_title,
           v.country, v.browser, v.os, v.device_type
         FROM listen_sessions ls
         JOIN visitors v ON v.id = ls.visitor_id
         WHERE ls.ended_at IS NULL AND ls.last_heartbeat_at >= ?
         ORDER BY ls.started_at DESC
         LIMIT 500`,
      )
      .bind(liveSince)
      .all<LiveSessionRow>(),
  ]);

  return context.json({
    live_threshold_seconds: thresholdSeconds,
    by_channel: byChannel.results,
    sessions: sessions.results,
  });
});

interface VisitorListRow {
  id: string;
  first_seen_at: string;
  last_seen_at: string;
  visit_count: number;
  country: string | null;
  browser: string | null;
  browser_version: string | null;
  os: string | null;
  os_version: string | null;
  device_type: string | null;
  total_listen_seconds: number;
  listen_seconds_today: number;
}

adminStats.get("/visitors", async (context) => {
  const db = context.get("db");
  const limit = Math.min(
    Math.max(Number(context.req.query("limit")) || DEFAULT_VISITOR_LIST_LIMIT, 1),
    MAX_VISITOR_LIST_LIMIT,
  );
  const offset = Math.max(Number(context.req.query("offset")) || 0, 0);
  const todayKst = toKstDate();

  const visitors = await db
    .prepare(
      `SELECT
         v.id, v.first_seen_at, v.last_seen_at, v.visit_count,
         v.country, v.browser, v.browser_version, v.os, v.os_version, v.device_type,
         COALESCE((SELECT SUM(seconds) FROM visitor_daily_listen WHERE visitor_id = v.id), 0) AS total_listen_seconds,
         COALESCE(
           (SELECT SUM(seconds) FROM visitor_daily_listen WHERE visitor_id = v.id AND listen_date = ?),
           0
         ) AS listen_seconds_today
       FROM visitors v
       ORDER BY v.last_seen_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(todayKst, limit, offset)
    .all<VisitorListRow>();

  return context.json({ visitors: visitors.results, limit, offset });
});

adminStats.get("/visitors/:id", async (context) => {
  const visitorId = context.req.param("id");
  const db = context.get("db");

  const visitor = await db
    .prepare("SELECT * FROM visitors WHERE id = ?")
    .bind(visitorId)
    .first<Record<string, unknown>>();
  if (!visitor) {
    return errorResponse(context, 404, "visitor_not_found", "The visitor was not found.");
  }

  const [visits, listenSessions, dailyTotals, channelTotals] = await Promise.all([
    db
      .prepare(
        `SELECT id, started_at, last_seen_at, ended_at, country, browser, os, device_type, referrer
         FROM visits WHERE visitor_id = ? ORDER BY started_at DESC LIMIT 20`,
      )
      .bind(visitorId)
      .all(),
    db
      .prepare(
        `SELECT id, channel_id, channel_name, started_at, last_heartbeat_at, ended_at, duration_seconds
         FROM listen_sessions WHERE visitor_id = ? ORDER BY started_at DESC LIMIT 50`,
      )
      .bind(visitorId)
      .all(),
    db
      .prepare(
        `SELECT listen_date, SUM(seconds) AS seconds
         FROM visitor_daily_listen WHERE visitor_id = ?
         GROUP BY listen_date ORDER BY listen_date DESC LIMIT 60`,
      )
      .bind(visitorId)
      .all(),
    db
      .prepare(
        `SELECT channel_id, MAX(channel_name) AS channel_name, SUM(seconds) AS seconds
         FROM visitor_daily_listen WHERE visitor_id = ?
         GROUP BY channel_id ORDER BY seconds DESC`,
      )
      .bind(visitorId)
      .all(),
  ]);

  return context.json({
    visitor,
    recent_visits: visits.results,
    recent_listen_sessions: listenSessions.results,
    daily_totals: dailyTotals.results,
    channel_totals: channelTotals.results,
  });
});

export default adminStats;
