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

  const [visitorsTotal, visitorsToday, currentlyOnline, currentlyListening, listenToday, listenAllTime] =
    await Promise.all([
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
    ]);

  return context.json({
    visitors_total: visitorsTotal?.value ?? 0,
    visitors_today: visitorsToday?.value ?? 0,
    currently_online: currentlyOnline?.value ?? 0,
    currently_listening: currentlyListening?.value ?? 0,
    listen_seconds_today_total: listenToday?.value ?? 0,
    listen_seconds_alltime_total: listenAllTime?.value ?? 0,
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
      `SELECT listen_date, SUM(seconds) AS seconds
       FROM visitor_daily_listen
       WHERE listen_date >= ?
       GROUP BY listen_date
       ORDER BY listen_date ASC`,
    )
    .bind(sinceDate)
    .all<{ listen_date: string; seconds: number }>();

  return context.json({ days: rows.results });
});

interface LiveSessionRow {
  session_id: string;
  visitor_id: string;
  channel_id: string;
  started_at: string;
  duration_seconds: number;
  country: string | null;
  browser: string | null;
  os: string | null;
  device_type: string | null;
}

adminStats.get("/live", async (context) => {
  const db = context.get("db");
  const thresholdSeconds = liveThresholdSeconds(context);
  const liveSince = new Date(Date.now() - thresholdSeconds * 1000).toISOString();

  const [byChannel, sessions] = await Promise.all([
    db
      .prepare(
        `SELECT channel_id, COUNT(*) AS listeners
         FROM listen_sessions
         WHERE ended_at IS NULL AND last_heartbeat_at >= ?
         GROUP BY channel_id
         ORDER BY listeners DESC`,
      )
      .bind(liveSince)
      .all<{ channel_id: string; listeners: number }>(),
    db
      .prepare(
        `SELECT
           ls.id AS session_id, ls.visitor_id, ls.channel_id, ls.started_at, ls.duration_seconds,
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
        `SELECT id, channel_id, started_at, last_heartbeat_at, ended_at, duration_seconds
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
        `SELECT channel_id, SUM(seconds) AS seconds
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
