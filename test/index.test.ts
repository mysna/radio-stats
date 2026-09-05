import { describe, expect, it } from "vitest";

import app from "../src/index";

describe("GET /health", () => {
  it("는 DB 바인딩 없이도 응답한다", async () => {
    const response = await app.request("https://api.example.test/health", undefined, {});
    const body = (await response.json()) as { service: string };
    expect(response.status).toBe(200);
    expect(body.service).toBe("radio-stats");
  });
});

describe("GET /admin", () => {
  it("는 관리자 대시보드 HTML을 반환한다", async () => {
    const response = await app.request("https://api.example.test/admin", undefined, {});
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<title>라디오 통계 대시보드</title>");
  });
});

describe("GET /admin/vendor/chart.js", () => {
  it("는 Chart.js를 같은 origin에서 직접 서빙한다(외부 CDN 의존 없음)", async () => {
    const response = await app.request("https://api.example.test/admin/vendor/chart.js", undefined, {});
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("javascript");
    expect(body.length).toBeGreaterThan(100_000);
  });
});

describe("admin API CORS", () => {
  it("는 어떤 origin이든 허용하되 Authorization 없이는 401을 반환한다", async () => {
    const response = await app.request(
      "https://api.example.test/v1/admin/stats/summary",
      { headers: { Origin: "https://anything.example" } },
      { ADMIN_TOKEN: "token" },
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://anything.example");
  });
});
