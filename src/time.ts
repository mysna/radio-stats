const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 주어진 시각(기본 현재)을 KST(UTC+9) 기준 "YYYY-MM-DD" 날짜로 변환한다. */
export function toKstDate(date: Date = new Date()): string {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}

/**
 * 두 ISO 시각 사이의 경과 초를 계산해 상한선으로 clamp한다.
 * 하트비트가 밀리거나 탭이 잠들었다 깨어난 경우, 실제로 재생되지 않은 공백 시간이
 * "청취 시간"으로 누적되지 않도록 한다.
 */
export function clampedElapsedSeconds(
  fromIso: string,
  toIso: string,
  maxSeconds: number,
): number {
  const elapsed = (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000;
  if (!Number.isFinite(elapsed) || elapsed <= 0) {
    return 0;
  }
  return Math.min(Math.round(elapsed), maxSeconds);
}
