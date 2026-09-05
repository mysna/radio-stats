import { Hono } from "hono";

import { ADMIN_DASHBOARD_HTML } from "./admin-ui";
import { CHART_JS_SOURCE } from "./chart-vendor";
import { createDatabase } from "./db";
import { errorResponse } from "./errors";
import adminStats from "./routes/admin-stats";
import events from "./routes/events";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

// 테스트는 바인딩으로 Database를 직접 주입하고, 배포 환경은 여기서 Turso 접속 정보로
// 한 번만 만들어 재사용한다. /health처럼 DB가 필요 없는 라우트는 바인딩이 없어도 통과한다.
app.use("*", async (context, next) => {
  const bindings = context.env ?? {};
  const db =
    bindings.DB ?? (bindings.TURSO_DATABASE_URL
      ? createDatabase({ url: bindings.TURSO_DATABASE_URL, authToken: bindings.TURSO_AUTH_TOKEN })
      : undefined);
  if (db) {
    context.set("db", db);
  }
  await next();
});

// 수집 API는 비밀값이 없으므로(정적 사이트 클라이언트라 감출 수 없다) CORS 허용 목록이
// 실질적인 보호 장치다. 등록된 origin에서 온 요청만 받는다.
app.use("/v1/events/*", async (context, next) => {
  const origin = context.req.header("Origin");
  if (!origin) {
    await next();
    context.header("Vary", "Origin", { append: true });
    return;
  }

  const allowedOrigins = (context.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowedOrigins.includes(origin)) {
    return errorResponse(context, 403, "origin_not_allowed", "The request origin is not allowed.");
  }

  if (context.req.method === "OPTIONS") {
    return context.newResponse(null, 204, {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
    });
  }

  await next();
  context.header("Access-Control-Allow-Origin", origin);
  context.header("Vary", "Origin", { append: true });
});

// 관리자 API는 ADMIN_TOKEN(Bearer)이 실제 보호 장치이므로 origin은 허용 목록으로
// 제한하지 않는다 — 같은 Worker가 서비스하는 /admin 대시보드 페이지가 같은 origin으로
// 호출하므로 오히려 어떤 origin이든 요청 자체를 막지 않는 쪽이 단순하고 안전하다.
app.use("/v1/admin/*", async (context, next) => {
  const origin = context.req.header("Origin");
  if (context.req.method === "OPTIONS") {
    return context.newResponse(null, 204, {
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Origin": origin ?? "*",
      Vary: "Origin",
    });
  }

  await next();
  if (origin) {
    context.header("Access-Control-Allow-Origin", origin);
    context.header("Vary", "Origin", { append: true });
  }
});

app.get("/health", (context) => context.json({ service: "radio-stats" }));
app.get("/admin", (context) => context.html(ADMIN_DASHBOARD_HTML));
// cdnjs 같은 외부 CDN에 기대지 않고 같은 origin에서 직접 서빙한다 — 광고 차단기/콘텐츠
// 차단 기능이 제3자 CDN 요청을 막아도 대시보드 차트가 계속 뜨게 하기 위함이다.
app.get("/admin/vendor/chart.js", (context) =>
  context.newResponse(CHART_JS_SOURCE, 200, {
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=31536000, immutable",
  }),
);
app.route("/v1/events", events);
app.route("/v1/admin/stats", adminStats);

export default app;
