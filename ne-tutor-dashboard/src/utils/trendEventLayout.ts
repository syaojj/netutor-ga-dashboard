import type { EcosystemEvent } from '../types';

/**
 * 카테고리 축 인덱스 기준 이벤트 “점유 폭” — 겹침 감지용.
 * 2줄로 분할된 한글 라벨의 시각적 가로 폭이 약 1.5~2 카테고리 정도 차지하므로
 * 절반 폭을 1.28로 잡아 인접 이벤트끼리 다른 레인으로 쌓이도록 합니다.
 */
const EVENT_X_HALF = 1.28;

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
      if (prev === undefined || prev <= lo + 0.05) {
        laneEnd[L] = hi;
        placed.push({ ev, xi, lane: L });
        break;
      }
    }
  }

  const xiCount = new Map<number, number>();
  for (const p of placed) xiCount.set(p.xi, (xiCount.get(p.xi) ?? 0) + 1);

  const xiIdx = new Map<number, number>();
  return placed.map((p) => {
    const n = xiCount.get(p.xi) ?? 1;
    const idx = xiIdx.get(p.xi) ?? 0;
    xiIdx.set(p.xi, idx + 1);
    // 동일 x 인덱스의 이벤트들은 좌우로 분산. 레인이 다르더라도 같은 x이면 좌우로 살짝 비킨다.
    const sameXiShift = n <= 1 ? 0 : (idx - (n - 1) / 2) * 60;
    return { ev: p.ev, lane: p.lane, xshift: sameXiShift };
  });
}

/** Plotly paper 기준 이벤트 주석: 레인 간격(px) — margin.t·yshift·차트 높이와 동기 */
export const EVENT_ANN_LANE_SPACING_PX = 34;
const EVENT_ANN_TEXT_BLOCK_PX = 30;
const EVENT_ANN_TOP_PAD_PX = 4;
const EVENT_ANN_TOP_MARGIN_MIN_PX = 36;

/** 이벤트 레인 수에 따른 상단 margin(px). 레인 0이면 최소값만 사용 */
export function eventAnnotationTopMarginPx(maxLanes: number): number {
  if (maxLanes <= 0) return EVENT_ANN_TOP_MARGIN_MIN_PX;
  return Math.max(
    EVENT_ANN_TOP_MARGIN_MIN_PX,
    maxLanes * EVENT_ANN_LANE_SPACING_PX + EVENT_ANN_TEXT_BLOCK_PX + EVENT_ANN_TOP_PAD_PX,
  );
}

/**
 * 한글 이벤트명을 2줄로 자동 분할.
 * - 6자 이하면 한 줄로 둠.
 * - 가운데에 가장 가까운 공백/구분자(' ', '·', '/', '&')에서 줄바꿈.
 * - 자연 구분점이 없으면 글자 단위 중간 분할.
 */
export function splitEventNameToTwoLines(name: string): string[] {
  if (name.length <= 6) return [name];
  const mid = Math.floor(name.length / 2);
  let bestIdx = -1;
  let bestDist = Infinity;
  const breakChars = new Set([' ', '·', '/', '&']);
  for (let i = 0; i < name.length; i++) {
    if (!breakChars.has(name[i])) continue;
    const d = Math.abs(i - mid);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return [name.slice(0, mid), name.slice(mid)];
  const ch = name[bestIdx];
  if (ch === ' ') return [name.slice(0, bestIdx), name.slice(bestIdx + 1)];
  // '/' 와 '&' 는 윗줄 끝에 붙여 의미 단위가 유지되도록 함
  return [name.slice(0, bestIdx + 1), name.slice(bestIdx + 1)];
}

function eventTypeShortLabel(type: EcosystemEvent['type']): string {
  switch (type) {
    case 'end':
      return '종료';
    case 'reform':
      return '개편';
    case 'launch':
      return '출시';
    default:
      return '오픈';
  }
}

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Plotly annotation HTML: `[오픈]이벤트명` 한 줄 또는 `[유형]`+첫줄+둘째줄(최대 2줄). 박스 없이 텍스트만 쓸 때 사용 */
export function formatEventAnnotationHtml(ev: EcosystemEvent): string {
  const tag = eventTypeShortLabel(ev.type);
  const parts = splitEventNameToTwoLines(ev.name);
  const t = escapeHtmlText(tag);
  if (parts.length === 1) {
    return `[${t}]${escapeHtmlText(parts[0])}`;
  }
  return `[${t}]${escapeHtmlText(parts[0])}<br>${escapeHtmlText(parts[1])}`;
}
