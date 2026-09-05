import { describe, expect, it } from "vitest";

import { clampedElapsedSeconds, toKstDate } from "../src/time";

describe("toKstDate", () => {
  it("는 UTC 자정 이후 시각을 KST 다음 날짜로 바꾼다", () => {
    expect(toKstDate(new Date("2026-07-12T15:00:00Z"))).toBe("2026-07-13");
  });

  it("는 KST로 자정을 넘기기 전이면 같은 UTC 날짜를 유지한다", () => {
    expect(toKstDate(new Date("2026-07-12T14:00:00Z"))).toBe("2026-07-12");
  });
});

describe("clampedElapsedSeconds", () => {
  it("는 두 시각 사이 경과 초를 반올림해 반환한다", () => {
    expect(clampedElapsedSeconds("2026-07-13T00:00:00.000Z", "2026-07-13T00:00:20.400Z", 120)).toBe(20);
  });

  it("는 상한을 넘는 공백을 상한값으로 자른다", () => {
    expect(clampedElapsedSeconds("2026-07-13T00:00:00Z", "2026-07-13T01:00:00Z", 120)).toBe(120);
  });

  it("는 시간이 거꾸로 가거나 그대로면 0을 반환한다", () => {
    expect(clampedElapsedSeconds("2026-07-13T00:00:10Z", "2026-07-13T00:00:00Z", 120)).toBe(0);
    expect(clampedElapsedSeconds("2026-07-13T00:00:00Z", "2026-07-13T00:00:00Z", 120)).toBe(0);
  });
});
