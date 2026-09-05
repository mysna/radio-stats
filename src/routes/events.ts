import { Hono, type Context } from "hono";

import type { Database } from "../db";
import { errorResponse } from "../errors";
import { parseEventBody, requestCountry } from "../request";
import {
  listenEndSchema,
  listenHeartbeatSchema,
  listenStartSchema,
  visitEndSchema,
  visitHeartbeatSchema,
  visitStartSchema,
} from "../schemas";
import { clampedElapsedSeconds, toKstDate } from "../time";
import type { AppEnv } from "../types";
import { parseUserAgent } from "../useragent";

// 하트비트 사이 공백이 이보다 길면(탭이 잠들었다 깨는 등) 그 구간은 청취 시간으로 세지 않는다.
const MAX_HEARTBEAT_GAP_SECONDS = 120;

const events = new Hono<AppEnv>();

events.post("/visit", async (context) => {
  const parsed = await parseEventBody(context, visitStartSchema);
  if ("response" in parsed) {
    return parsed.response;
  }
  const { visitor_id: visitorId, referrer } = parsed.data;

  const db = context.get("db");
  const country = requestCountry(context);
  const ua = parseUserAgent(context.req.header("User-Agent"));
  const now = new Date().toISOString();
  const visitId = crypto.randomUUID();

  await db.batch([
    db
      .prepare(
        `INSERT INTO visitors (
           id, first_seen_at, last_seen_at, visit_count, country, browser, browser_version, os, os_version, device_type
         ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           last_seen_at = excluded.last_seen_at,
           visit_count = visitors.visit_count + 1,
           country = excluded.country,
           browser = excluded.browser,
           browser_version = excluded.browser_version,
           os = excluded.os,
           os_version = excluded.os_version,
           device_type = excluded.device_type`,
      )
      .bind(visitorId, now, now, country, ua.browser, ua.browserVersion, ua.os, ua.osVersion, ua.deviceType),
    db
      .prepare(
        `INSERT INTO visits (
           id, visitor_id, started_at, last_seen_at, country, browser, browser_version, os, os_version, device_type, referrer
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        visitId,
        visitorId,
        now,
        now,
        country,
        ua.browser,
        ua.browserVersion,
        ua.os,
        ua.osVersion,
        ua.deviceType,
        referrer ?? null,
      ),
  ]);

  return context.json({ visitor_id: visitorId, visit_id: visitId }, 201);
});

events.post("/visit/heartbeat", async (context) => {
  const parsed = await parseEventBody(context, visitHeartbeatSchema);
  if ("response" in parsed) {
    return parsed.response;
  }
  const db = context.get("db");
  const visit = await findVisit(db, parsed.data.visit_id);
  if (!visit) {
    return errorResponse(context, 404, "visit_not_found", "The visit was not found.");
  }

  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE visits SET last_seen_at = ? WHERE id = ?").bind(now, visit.id),
    db.prepare("UPDATE visitors SET last_seen_at = ? WHERE id = ?").bind(now, visit.visitor_id),
  ]);
  return context.json({ ok: true });
});

events.post("/visit/end", async (context) => {
  const parsed = await parseEventBody(context, visitEndSchema);
  if ("response" in parsed) {
    return parsed.response;
  }
  const db = context.get("db");
  const visit = await findVisit(db, parsed.data.visit_id);
  if (!visit) {
    return errorResponse(context, 404, "visit_not_found", "The visit was not found.");
  }

  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE visits SET ended_at = ?, last_seen_at = ? WHERE id = ?").bind(now, now, visit.id),
    db.prepare("UPDATE visitors SET last_seen_at = ? WHERE id = ?").bind(now, visit.visitor_id),
  ]);
  return context.json({ ok: true });
});

events.post("/listen/start", async (context) => {
  const parsed = await parseEventBody(context, listenStartSchema);
  if ("response" in parsed) {
    return parsed.response;
  }
  const {
    visitor_id: visitorId,
    visit_id: visitId,
    channel_id: channelId,
    broadcaster,
    region_id: regionId,
    program_id: programId,
    program_title: programTitle,
  } = parsed.data;

  const db = context.get("db");
  const visit = await findVisit(db, visitId);
  if (!visit || visit.visitor_id !== visitorId) {
    return errorResponse(context, 404, "visit_not_found", "The visit was not found.");
  }

  const now = new Date().toISOString();
  const sessionId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO listen_sessions (
         id, visitor_id, visit_id, channel_id, started_at, last_heartbeat_at, duration_seconds,
         broadcaster, region_id, program_id, program_title
       ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    )
    .bind(
      sessionId,
      visitorId,
      visitId,
      channelId,
      now,
      now,
      broadcaster ?? null,
      regionId ?? null,
      programId ?? null,
      programTitle ?? null,
    )
    .run();

  return context.json({ session_id: sessionId }, 201);
});

events.post("/listen/heartbeat", async (context) => {
  const parsed = await parseEventBody(context, listenHeartbeatSchema);
  if ("response" in parsed) {
    return parsed.response;
  }
  return applyListenProgress(context, parsed.data.session_id, {
    markEnded: false,
    programId: parsed.data.program_id ?? null,
    programTitle: parsed.data.program_title ?? null,
  });
});

events.post("/listen/end", async (context) => {
  const parsed = await parseEventBody(context, listenEndSchema);
  if ("response" in parsed) {
    return parsed.response;
  }
  return applyListenProgress(context, parsed.data.session_id, {
    markEnded: true,
    programId: parsed.data.program_id ?? null,
    programTitle: parsed.data.program_title ?? null,
  });
});

interface VisitRow {
  id: string;
  visitor_id: string;
}

async function findVisit(db: Database, visitId: string): Promise<VisitRow | null> {
  return db.prepare("SELECT id, visitor_id FROM visits WHERE id = ?").bind(visitId).first<VisitRow>();
}

interface ListenSessionRow {
  visitor_id: string;
  channel_id: string;
  last_heartbeat_at: string;
  ended_at: string | null;
  broadcaster: string | null;
  region_id: string | null;
}

/** program_id가 없는 구간도 program_title로 안정적으로 묶기 위한 대체 키. */
function resolveProgramKey(programId: string | null, programTitle: string | null): string {
  if (programId) return programId;
  if (programTitle) return `title:${programTitle}`;
  return "unknown";
}

/** 청취 세션의 진행 시간을 누적한다. 하트비트와 종료 이벤트가 공유하는 로직이다. */
async function applyListenProgress(
  context: Context<AppEnv>,
  sessionId: string,
  options: { markEnded: boolean; programId: string | null; programTitle: string | null },
): Promise<Response> {
  const db = context.get("db");
  const session = await db
    .prepare(
      "SELECT visitor_id, channel_id, last_heartbeat_at, ended_at, broadcaster, region_id FROM listen_sessions WHERE id = ?",
    )
    .bind(sessionId)
    .first<ListenSessionRow>();
  if (!session) {
    return errorResponse(context, 404, "listen_session_not_found", "The listen session was not found.");
  }
  if (session.ended_at) {
    // 이미 종료된 세션에 또 종료/하트비트가 도착한 경우(중복 beacon 등) 조용히 무시한다.
    return context.json({ ok: true, status: "already_ended" });
  }

  const now = new Date().toISOString();
  const elapsedSeconds = clampedElapsedSeconds(session.last_heartbeat_at, now, MAX_HEARTBEAT_GAP_SECONDS);
  const listenDate = toKstDate(new Date(now));
  const programKey = resolveProgramKey(options.programId, options.programTitle);

  const updateSql = options.markEnded
    ? `UPDATE listen_sessions SET ended_at = ?, last_heartbeat_at = ?, duration_seconds = duration_seconds + ?,
         program_id = ?, program_title = ? WHERE id = ?`
    : `UPDATE listen_sessions SET last_heartbeat_at = ?, duration_seconds = duration_seconds + ?,
         program_id = ?, program_title = ? WHERE id = ?`;
  const updateArgs = options.markEnded
    ? [now, now, elapsedSeconds, options.programId, options.programTitle, sessionId]
    : [now, elapsedSeconds, options.programId, options.programTitle, sessionId];

  await db.batch([
    db.prepare(updateSql).bind(...updateArgs),
    db
      .prepare(
        `INSERT INTO visitor_daily_listen (visitor_id, listen_date, channel_id, broadcaster, region_id, seconds)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(visitor_id, listen_date, channel_id) DO UPDATE SET
           seconds = seconds + excluded.seconds,
           broadcaster = excluded.broadcaster,
           region_id = excluded.region_id`,
      )
      .bind(session.visitor_id, listenDate, session.channel_id, session.broadcaster, session.region_id, elapsedSeconds),
    db
      .prepare(
        `INSERT INTO program_daily_listen (listen_date, channel_id, program_key, program_title, seconds)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(listen_date, channel_id, program_key) DO UPDATE SET
           seconds = seconds + excluded.seconds,
           program_title = excluded.program_title`,
      )
      .bind(listenDate, session.channel_id, programKey, options.programTitle, elapsedSeconds),
    db.prepare("UPDATE visitors SET last_seen_at = ? WHERE id = ?").bind(now, session.visitor_id),
  ]);

  return context.json({ ok: true, elapsed_seconds: elapsedSeconds });
}

export default events;
