import type { Database, DatabaseBindings } from "./db";

/** Worker가 요청 처리 중 사용하는 환경 binding. */
export interface Bindings extends DatabaseBindings {
  CORS_ORIGINS?: string;
  ADMIN_TOKEN?: string;
  LIVE_THRESHOLD_SECONDS?: string;
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
}

/** Hono 애플리케이션의 환경 타입. db 미들웨어가 Variables.db를 채운다. */
export interface AppEnv {
  Bindings: Bindings;
  Variables: { db: Database };
}
