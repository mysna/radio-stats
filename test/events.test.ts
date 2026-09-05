import { env } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createDatabase } from "../src/db";
import app from "../src/index";
import { applyMigrations, type MigrationFile } from "./helpers/migrations";

const ALLOWED_ORIGIN = "https://radio.bsod.kr";
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const db = createDatabase({ url: "http://127.0.0.1:8096" });
const testEnv = env as typeof env & { TEST_MIGRATIONS: MigrationFile[] };
const bindings = {
  DB: db,
  CORS_ORIGINS: ALLOWED_ORIGIN,
  LIVE_THRESHOLD_SECONDS: "90",
};

async function request(path: string, init?: RequestInit): Promise<Response> {
  return app.request(
    `https://api.example.test${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Origin: ALLOWED_ORIGIN,
        "User-Agent": CHROME_UA,
        ...(init?.headers ?? {}),
      },
    },
    bindings,
  );
}

async function listenSessionRow(sessionId: string) {
  return db
    .prepare("SELECT ended_at, duration_seconds, last_heartbeat_at FROM listen_sessions WHERE id = ?")
    .bind(sessionId)
    .first<{ ended_at: string | null; duration_seconds: number; last_heartbeat_at: string }>();
}

beforeAll(async () => {
  await applyMigrations(db, testEnv.TEST_MIGRATIONS);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-07-13T00:00:00Z"));
});

afterAll(() => {
  vi.useRealTimers();
});

describe("visit events", () => {
  const visitorId = crypto.randomUUID();

  it("는 방문을 시작하면 visitor/visit 행을 만든다", async () => {
    const response = await request("/v1/events/visit", {
      method: "POST",
      body: JSON.stringify({ visitor_id: visitorId, referrer: "https://example.com/" }),
    });
    const body = (await response.json()) as { visitor_id: string; visit_id: string };

    expect(response.status).toBe(201);
    expect(body.visitor_id).toBe(visitorId);

    const visitor = await db
      .prepare("SELECT visit_count, browser, os FROM visitors WHERE id = ?")
      .bind(visitorId)
      .first<{ visit_count: number; browser: string; os: string }>();
    expect(visitor).toMatchObject({ visit_count: 1, browser: "Chrome", os: "Mac OS" });
  });

  it("는 재방문 시 visit_count를 늘리고 visit 행을 새로 만든다", async () => {
    await request("/v1/events/visit", {
      method: "POST",
      body: JSON.stringify({ visitor_id: visitorId }),
    });
    const visitor = await db
      .prepare("SELECT visit_count FROM visitors WHERE id = ?")
      .bind(visitorId)
      .first<{ visit_count: number }>();
    expect(visitor?.visit_count).toBe(2);
  });

  it("는 형식이 잘못된 요청을 400으로 거부한다", async () => {
    const response = await request("/v1/events/visit", {
      method: "POST",
      body: JSON.stringify({ visitor_id: "not-a-uuid" }),
    });
    expect(response.status).toBe(400);
  });

  it("는 허용되지 않은 Origin을 403으로 거부한다", async () => {
    const response = await app.request(
      "https://api.example.test/v1/events/visit",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
        body: JSON.stringify({ visitor_id: crypto.randomUUID() }),
      },
      bindings,
    );
    expect(response.status).toBe(403);
  });

  it("는 존재하지 않는 visit_id로 하트비트를 보내면 404를 반환한다", async () => {
    const response = await request("/v1/events/visit/heartbeat", {
      method: "POST",
      body: JSON.stringify({ visit_id: crypto.randomUUID() }),
    });
    expect(response.status).toBe(404);
  });

  it("는 하트비트/종료로 last_seen_at과 ended_at을 갱신한다", async () => {
    const started = await request("/v1/events/visit", {
      method: "POST",
      body: JSON.stringify({ visitor_id: visitorId }),
    });
    const { visit_id: visitId } = (await started.json()) as { visit_id: string };

    vi.setSystemTime(new Date("2026-07-13T00:00:30Z"));
    const heartbeat = await request("/v1/events/visit/heartbeat", {
      method: "POST",
      body: JSON.stringify({ visit_id: visitId }),
    });
    expect(heartbeat.status).toBe(200);

    vi.setSystemTime(new Date("2026-07-13T00:01:00Z"));
    const end = await request("/v1/events/visit/end", {
      method: "POST",
      body: JSON.stringify({ visit_id: visitId }),
    });
    expect(end.status).toBe(200);

    const visit = await db
      .prepare("SELECT last_seen_at, ended_at FROM visits WHERE id = ?")
      .bind(visitId)
      .first<{ last_seen_at: string; ended_at: string | null }>();
    expect(visit?.last_seen_at).toBe("2026-07-13T00:01:00.000Z");
    expect(visit?.ended_at).toBe("2026-07-13T00:01:00.000Z");
  });
});

describe("listen events", () => {
  const visitorId = crypto.randomUUID();
  let visitId = "";

  beforeAll(async () => {
    vi.setSystemTime(new Date("2026-07-13T10:00:00Z"));
    const response = await request("/v1/events/visit", {
      method: "POST",
      body: JSON.stringify({ visitor_id: visitorId }),
    });
    ({ visit_id: visitId } = (await response.json()) as { visit_id: string });
  });

  it("는 청취 시작부터 종료까지 duration_seconds를 누적하고 일별/프로그램별 통계에 반영한다", async () => {
    const startResponse = await request("/v1/events/listen/start", {
      method: "POST",
      body: JSON.stringify({
        visitor_id: visitorId,
        visit_id: visitId,
        channel_id: "kbs.1radio.seoul",
        channel_name: "KBS 1라디오",
        broadcaster: "kbs",
        region_id: "seoul",
      }),
    });
    expect(startResponse.status).toBe(201);
    const { session_id: sessionId } = (await startResponse.json()) as { session_id: string };

    vi.setSystemTime(new Date("2026-07-13T10:00:20Z"));
    const heartbeat1 = await request("/v1/events/listen/heartbeat", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, program_id: "kbs.news.0900", program_title: "KBS 뉴스" }),
    });
    expect((await heartbeat1.json()) as { elapsed_seconds: number }).toMatchObject({ elapsed_seconds: 20 });

    vi.setSystemTime(new Date("2026-07-13T10:00:45Z"));
    await request("/v1/events/listen/heartbeat", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, program_id: "kbs.news.0900", program_title: "KBS 뉴스" }),
    });

    vi.setSystemTime(new Date("2026-07-13T10:01:00Z"));
    const endResponse = await request("/v1/events/listen/end", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, program_id: "kbs.news.0900", program_title: "KBS 뉴스" }),
    });
    expect(endResponse.status).toBe(200);

    const session = await listenSessionRow(sessionId);
    expect(session?.ended_at).toBe("2026-07-13T10:01:00.000Z");
    expect(session?.duration_seconds).toBe(60);

    const daily = await db
      .prepare(
        "SELECT seconds, broadcaster, region_id, channel_name FROM visitor_daily_listen WHERE visitor_id = ? AND listen_date = ? AND channel_id = ?",
      )
      .bind(visitorId, "2026-07-13", "kbs.1radio.seoul")
      .first<{ seconds: number; broadcaster: string; region_id: string; channel_name: string }>();
    expect(daily).toMatchObject({ seconds: 60, broadcaster: "kbs", region_id: "seoul", channel_name: "KBS 1라디오" });

    const programDaily = await db
      .prepare(
        "SELECT seconds, program_title, channel_name FROM program_daily_listen WHERE listen_date = ? AND channel_id = ? AND program_key = ?",
      )
      .bind("2026-07-13", "kbs.1radio.seoul", "kbs.news.0900")
      .first<{ seconds: number; program_title: string; channel_name: string }>();
    expect(programDaily).toMatchObject({ seconds: 60, program_title: "KBS 뉴스", channel_name: "KBS 1라디오" });

    // 이미 종료된 세션에 다시 종료 이벤트가 와도(beacon 중복 등) 중복 집계하지 않는다.
    const secondEnd = await request("/v1/events/listen/end", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId }),
    });
    const secondBody = (await secondEnd.json()) as { status?: string };
    expect(secondBody.status).toBe("already_ended");
    const sessionAfterDuplicate = await listenSessionRow(sessionId);
    expect(sessionAfterDuplicate?.duration_seconds).toBe(60);
  });

  it("는 하트비트 공백이 상한을 넘으면 그 구간만큼만 인정한다", async () => {
    vi.setSystemTime(new Date("2026-07-13T11:00:00Z"));
    const startResponse = await request("/v1/events/listen/start", {
      method: "POST",
      body: JSON.stringify({ visitor_id: visitorId, visit_id: visitId, channel_id: "mbc.sfm.seoul" }),
    });
    const { session_id: sessionId } = (await startResponse.json()) as { session_id: string };

    // 탭이 잠들었다 30분 뒤 깨어난 것을 흉내낸다.
    vi.setSystemTime(new Date("2026-07-13T11:30:00Z"));
    await request("/v1/events/listen/heartbeat", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId }),
    });

    const session = await listenSessionRow(sessionId);
    expect(session?.duration_seconds).toBe(120);
  });

  it("는 프로그램 정보가 없으면 unknown 키로 묶는다", async () => {
    vi.setSystemTime(new Date("2026-07-13T12:00:00Z"));
    const startResponse = await request("/v1/events/listen/start", {
      method: "POST",
      body: JSON.stringify({ visitor_id: visitorId, visit_id: visitId, channel_id: "ytn.radio" }),
    });
    const { session_id: sessionId } = (await startResponse.json()) as { session_id: string };

    vi.setSystemTime(new Date("2026-07-13T12:00:30Z"));
    await request("/v1/events/listen/end", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId }),
    });

    const programDaily = await db
      .prepare(
        "SELECT seconds FROM program_daily_listen WHERE listen_date = ? AND channel_id = ? AND program_key = 'unknown'",
      )
      .bind("2026-07-13", "ytn.radio")
      .first<{ seconds: number }>();
    expect(programDaily?.seconds).toBe(30);
  });

  it("는 다른 방문자의 visit_id로 청취 시작을 요청하면 404를 반환한다", async () => {
    const response = await request("/v1/events/listen/start", {
      method: "POST",
      body: JSON.stringify({ visitor_id: crypto.randomUUID(), visit_id: visitId, channel_id: "kbs.1radio.seoul" }),
    });
    expect(response.status).toBe(404);
  });
});
