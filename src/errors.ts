import type { Context } from "hono";

import type { AppEnv } from "./types";

type ErrorStatus = 400 | 401 | 403 | 404 | 413 | 500;

/** 안정적인 공개 오류 envelope를 반환한다. */
export function errorResponse(
  context: Context<AppEnv>,
  status: ErrorStatus,
  code: string,
  message: string,
): Response {
  return context.json({ error: { code, message } }, status);
}
