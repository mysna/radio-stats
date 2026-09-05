// ua-parser-js(v1)는 CJS로만 배포되고 named export가 번들러마다 다르게 상호운용되므로
// default import + 생성자 호출 형태를 쓴다.
import UAParser from "ua-parser-js";

/** 방문자 통계에 저장하는 UA 파싱 결과. 값이 없으면 null이다. */
export interface ParsedUserAgent {
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  osVersion: string | null;
  deviceType: string | null;
}

/** User-Agent 헤더에서 브라우저/OS/기기 종류를 뽑아낸다. ua-parser-js(MIT)를 그대로 사용한다. */
export function parseUserAgent(userAgent: string | undefined): ParsedUserAgent {
  if (!userAgent) {
    return { browser: null, browserVersion: null, os: null, osVersion: null, deviceType: null };
  }
  const result = new UAParser(userAgent).getResult();
  return {
    browser: result.browser.name ?? null,
    browserVersion: result.browser.version ?? null,
    os: result.os.name ?? null,
    osVersion: result.os.version ?? null,
    // UA에 기기 종류가 없으면(대부분의 데스크톱) "desktop"으로 취급한다.
    deviceType: result.device.type ?? "desktop",
  };
}
