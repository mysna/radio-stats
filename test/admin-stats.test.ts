import { env } from "cloudflare:workers";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createDatabase } from "../src/db";
import app from "../src/index";
import { applyMigrations, type MigrationFile } from "./helpers/migrations";

const ALLOWED_ORIGIN = "https://radio.bsod.kr";
const ADMIN_TOKEN = "test-admin-token";
const db = createDatabase({ url: "http://127.0.0.1:8097" });
const testEnv = env as typeof env & { TEST_MIGRATIONS: MigrationFile[] };
const bindings = {
  DB: db,
  CORS_ORIGINS: ALLOWED_ORIGIN,
  ADMIN_TOKEN,
  LIVE_THRESHOLD_SECONDS: "90",
};

async function adminRequest(path: string): Promise<Response> {
  return app.request(
    `https://api.example.test${path}`,
    { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } },
    bindings,
  );
}

async function seed(): Promise<{ onlineVisitorId: string; staleVisitorId: string }> {
  const onlineVisitorId = crypto.randomUUID();
  const staleVisitorId = crypto.randomUUID();
  const onlineVisitId = crypto.randomUUID();
  const staleVisitId = crypto.randomUUID();
  const now = new Date().toISOString();
  const staleHeartbeat = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  await db.batch([
    db
      .prepare(
        `INSERT INTO visitors (id, first_seen_at, last_seen_at, visit_count, country, browser, os, device_type)
         VALUES (?, ?, ?, 3, 'KR', 'Chrome', 'Mac OS', 'desktop')`,
      )
      .bind(onlineVisitorId, now, now),
    db
      .prepare(
        `INSERT INTO visitors (id, first_seen_at, last_seen_at, visit_count, country, browser, os, device_type)
         VALUES (?, ?, ?, 1, 'US', 'Safari', 'iOS', 'mobile')`,
      )
      .bind(staleVisitorId, staleHeartbeat, staleHeartbeat),
    db
      .prepare("INSERT INTO visits (id, visitor_id, started_at, last_seen_at) VALUES (?, ?, ?, ?)")
      .bind(onlineVisitId, onlineVisitorId, now, now),
    db
      .prepare("INSERT INTO visits (id, visitor_id, started_at, last_seen_at) VALUES (?, ?, ?, ?)")
      .bind(staleVisitId, staleVisitorId, staleHeartbeat, staleHeartbeat),
    db
      .prepare(
        `INSERT INTO listen_sessions (id, visitor_id, visit_id, channel_id, started_at, last_heartbeat_at, duration_seconds)
         VALUES (?, ?, ?, 'kbs.1radio.seoul', ?, ?, 40)`,
      )
      .bind(crypto.randomUUID(), onlineVisitorId, onlineVisitId, now, now),
    db
      .prepare(
        `INSERT INTO listen_sessions (id, visitor_id, visit_id, channel_id, started_at, last_heartbeat_at, ended_at, duration_seconds)
         VALUES (?, ?, ?, 'mbc.sfm.seoul', ?, ?, ?, 90)`,
      )
      .bind(crypto.randomUUID(), staleVisitorId, staleVisitId, staleHeartbeat, staleHeartbeat, staleHeartbeat),
    db
      .prepare(
        `INSERT INTO visitor_daily_listen (visitor_id, listen_date, channel_id, seconds) VALUES (?, ?, ?, ?)`,
      )
      .bind(onlineVisitorId, "2026-07-13", "kbs.1radio.seoul", 40),
    db
      .prepare(
        `INSERT INTO visitor_daily_listen (visitor_id, listen_date, channel_id, seconds) VALUES (?, ?, ?, ?)`,
      )
      .bind(staleVisitorId, "2026-07-12", "mbc.sfm.seoul", 90),
  ]);

  return { onlineVisitorId, staleVisitorId };
}

let seeded: { onlineVisitorId: string; staleVisitorId: string };

beforeAll(async () => {
  await applyMigrations(db, testEnv.TEST_MIGRATIONS);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-07-13T12:00:00Z"));
  seeded = await seed();
});

afterAll(() => {
  vi.useRealTimers();
});

describe("admin auth", () => {
  it("는 토큰 없이 접근하면 401을 반환한다", async () => {
    const response = await app.request(
      "https://api.example.test/v1/admin/stats/summary",
      undefined,
      bindings,
    );
    expect(response.status).toBe(401);
  });

  it("는 잘못된 토큰이면 401을 반환한다", async () => {
    const response = await app.request(
      "https://api.example.test/v1/admin/stats/summary",
      { headers: { Authorization: "Bearer wrong-token" } },
      bindings,
    );
    expect(response.status).toBe(401);
  });
});

describe("GET /v1/admin/stats/summary", () => {
  it("는 실시간 접속자/청취자와 오늘 청취 시간을 집계한다", async () => {
    const response = await adminRequest("/v1/admin/stats/summary");
    const body = (await response.json()) as Record<string, number>;

    expect(response.status).toBe(200);
    expect(body.visitors_total).toBe(2);
    expect(body.currently_online).toBe(1);
    expect(body.currently_listening).toBe(1);
    expect(body.listen_seconds_today_total).toBe(40);
    expect(body.listen_seconds_alltime_total).toBe(130);
  });
});

describe("GET /v1/admin/stats/live", () => {
  it("는 임계 시간 안에 하트비트가 있는 세션만 채널별로 묶어 보여준다", async () => {
    const response = await adminRequest("/v1/admin/stats/live");
    const body = (await response.json()) as {
      by_channel: Array<{ channel_id: string; listeners: number }>;
      sessions: Array<{ visitor_id: string; channel_id: string }>;
    };

    expect(body.by_channel).toEqual([{ channel_id: "kbs.1radio.seoul", listeners: 1 }]);
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toMatchObject({
      visitor_id: seeded.onlineVisitorId,
      channel_id: "kbs.1radio.seoul",
    });
  });
});

describe("GET /v1/admin/stats/daily", () => {
  it("는 사이트 전체 일별 청취 시간을 날짜 오름차순으로 반환한다", async () => {
    const response = await adminRequest("/v1/admin/stats/daily?days=30");
    const body = (await response.json()) as { days: Array<{ listen_date: string; seconds: number }> };

    expect(response.status).toBe(200);
    expect(body.days).toEqual([
      { listen_date: "2026-07-12", seconds: 90 },
      { listen_date: "2026-07-13", seconds: 40 },
    ]);
  });
});

describe("GET /v1/admin/stats/visitors", () => {
  it("는 방문자별 누적 청취시간을 포함해 목록을 반환한다", async () => {
    const response = await adminRequest("/v1/admin/stats/visitors?limit=10");
    const body = (await response.json()) as {
      visitors: Array<{ id: string; total_listen_seconds: number; listen_seconds_today: number }>;
    };

    const online = body.visitors.find((visitor) => visitor.id === seeded.onlineVisitorId);
    expect(online?.total_listen_seconds).toBe(40);
    expect(online?.listen_seconds_today).toBe(40);

    const stale = body.visitors.find((visitor) => visitor.id === seeded.staleVisitorId);
    expect(stale?.total_listen_seconds).toBe(90);
    expect(stale?.listen_seconds_today).toBe(0);
  });
});

describe("GET /v1/admin/stats/visitors/:id", () => {
  it("는 존재하지 않는 방문자는 404를 반환한다", async () => {
    const response = await adminRequest(`/v1/admin/stats/visitors/${crypto.randomUUID()}`);
    expect(response.status).toBe(404);
  });

  it("는 방문자 상세와 일별/채널별 합계를 함께 반환한다", async () => {
    const response = await adminRequest(`/v1/admin/stats/visitors/${seeded.onlineVisitorId}`);
    const body = (await response.json()) as {
      visitor: { id: string; country: string };
      channel_totals: Array<{ channel_id: string; seconds: number }>;
      daily_totals: Array<{ listen_date: string; seconds: number }>;
    };

    expect(response.status).toBe(200);
    expect(body.visitor).toMatchObject({ id: seeded.onlineVisitorId, country: "KR" });
    expect(body.channel_totals).toEqual([{ channel_id: "kbs.1radio.seoul", seconds: 40 }]);
    expect(body.daily_totals).toEqual([{ listen_date: "2026-07-13", seconds: 40 }]);
  });
});
