import type { EcosystemEvent } from '../types';

/** 카테고리 축 인덱스 기준 이벤트 “점유 폭” — 겹침 감지용 */
const EVENT_X_HALF = 0.46;

/**
 * 월/연 카테고리 축에서 이벤트 말풍선이 서로 덜 겹치도록 레인(세로)과 xshift(가로)를 할당합니다.
 * - 가까운 달(축 인덱스)의 이벤트는 서로 다른 레인에 쌓습니다.
 * - 같은 달(동일 인덱스) 이벤트는 xshift로 벌립니다.
 * - 레인별로 살짝 xshift를 틀어 화면 오른쪽 등에서 박스가 겹치는 경우를 줄입니다.
 */
export function assignEventAnnotationLanes(
  events: EcosystemEvent[],
  categories: string[],
  categoryIndexFromAnchor: (anchor: string) => number,
): { ev: EcosystemEvent; lane: number; xshift: number }[] {
  const items = events
    .map((ev) => ({ ev, xi: categoryIndexFromAnchor(ev.anchorDate) }))
    .filter((x) => x.xi >= 0)
    .sort((a, b) => a.xi - b.xi || a.ev.name.localeCompare(b.ev.name, 'ko'));

  const laneEnd: number[] = [];
  const placed: { ev: EcosystemEvent; xi: number; lane: number }[] = [];

  for (const { ev, xi } of items) {
    const lo = xi - EVENT_X_HALF;
    const hi = xi + EVENT_X_HALF;
    const maxL = Math.max(items.length + 16, 28);
    let L = 0;
    for (; L < maxL; L++) {
      const prev = laneEnd[L];
      if (prev === undefined || prev <= lo + 0.015) {
        laneEnd[L] = hi;
        placed.push({ ev, xi, lane: L });
        break;
      }
    }
  }

  const maxLane = placed.reduce((m, p) => Math.max(m, p.lane), 0);
  const skewAmp = 12;

  const xiCount = new Map<number, number>();
  for (const p of placed) xiCount.set(p.xi, (xiCount.get(p.xi) ?? 0) + 1);

  const xiIdx = new Map<number, number>();
  return placed.map((p) => {
    const n = xiCount.get(p.xi) ?? 1;
    const idx = xiIdx.get(p.xi) ?? 0;
    xiIdx.set(p.xi, idx + 1);
    const sameXiShift = n <= 1 ? 0 : (idx - (n - 1) / 2) * 48;
    const laneSkew = maxLane > 0 ? (p.lane - maxLane / 2) * skewAmp : 0;
    return { ev: p.ev, lane: p.lane, xshift: sameXiShift + laneSkew };
  });
}
