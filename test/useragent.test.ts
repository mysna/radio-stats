import { describe, expect, it } from "vitest";

import { parseUserAgent } from "../src/useragent";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

describe("parseUserAgent", () => {
  it("는 데스크톱 Chrome의 브라우저/OS를 뽑아낸다", () => {
    const result = parseUserAgent(CHROME_MAC);
    expect(result.browser).toBe("Chrome");
    expect(result.os).toBe("Mac OS");
    expect(result.deviceType).toBe("desktop");
  });

  it("는 모바일 Safari를 mobile 기기로 표시한다", () => {
    const result = parseUserAgent(SAFARI_IOS);
    expect(result.browser).toBe("Mobile Safari");
    expect(result.os).toBe("iOS");
    expect(result.deviceType).toBe("mobile");
  });

  it("는 User-Agent가 없으면 모두 null을 반환한다", () => {
    expect(parseUserAgent(undefined)).toEqual({
      browser: null,
      browserVersion: null,
      os: null,
      osVersion: null,
      deviceType: null,
    });
  });
});
