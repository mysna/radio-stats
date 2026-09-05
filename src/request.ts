import type { Context } from "hono";
import type { ZodType } from "zod";

import { errorResponse } from "./errors";
import type { AppEnv } from "./types";

const MAX_EVENT_BODY_BYTES = 4_000;

/** 이벤트 ingestion 요청 본문을 크기 제한과 스키마로 검증해 파싱한다. */
export async function parseEventBody<T>(
  context: Context<AppEnv>,
  schema: ZodType<T>,
): Promise<{ data: T } | { response: Response }> {
  const rawBody = await context.req.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_EVENT_BODY_BYTES) {
    return { response: errorResponse(context, 413, "request_too_large", "Request body is too large.") };
  }

  let parsedJson: unknown;
  try {
    parsedJson = rawBody.length > 0 ? JSON.parse(rawBody) : {};
  } catch {
    return { response: errorResponse(context, 400, "invalid_json", "Request body must be valid JSON.") };
  }

  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      response: errorResponse(context, 400, "invalid_request", "Request body does not match the schema."),
    };
  }
  return { data: parsed.data };
}

/** Cloudflare Workers가 요청에 붙여주는 국가 코드. 로컬 개발 등 값이 없으면 null이다. */
export function requestCountry(context: Context<AppEnv>): string | null {
  const cf = (context.req.raw as Request & { cf?: { country?: string } }).cf;
  return cf?.country ?? null;
}
