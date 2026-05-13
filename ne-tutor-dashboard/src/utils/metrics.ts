import type { DailyMetricRow, DeviceFilter, EcosystemEvent, MonthlyMetricRow, OrderRecord, YearlyMetricRow } from '../types';
import { ECOSYSTEM_EVENTS } from '../data/events';
import { addDays, daysBetween, toMonthKey, toYearKey } from './dateUtil';
import { isGrammarCategory, isLongTermGrammarProduct, isShortTermGrammarProduct } from './parseOrders';

const NE_TUTOR = 'NE Tutor';

export const TREND_SERVICES = [
  NE_TUTOR,
  '문법문제뱅크',
  'NELT',
  '어휘출제마법사',
  '클래스카드',
  '교재자료',
] as const;

export function isNeTutorService(service: string): boolean {
  return service === NE_TUTOR;
}

/** 디바이스 필터 적용 후 일별 병합 (전체=Mobile+PC 합산 규칙) */
export function filterAndMergeDevice(rows: DailyMetricRow[], device: DeviceFilter): DailyMetricRow[] {
  const filtered = device === 'all' ? rows : rows.filter((r) => r.device === device);
  if (device !== 'all') return filtered.sort((a, b) => a.date.localeCompare(b.date));

  const map = new Map<string, DailyMetricRow>();
  for (const r of filtered) {
    const key = `${r.service}|${r.date}`;
    const ex = map.get(key);
    if (!ex) {
      const first = { ...r };
      delete first.sourceFile;
      map.set(key, {
        ...first,
        device: 'M',
      });
    } else {
      ex.newUsers += r.newUsers;
      ex.activeUsers += r.activeUsers;
      ex.totalUsers += r.totalUsers;
      ex.views += r.views;
      ex.returningUsers += r.returningUsers;
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** 일별 → 월별: 신규/조회/재방문은 합, MAU는 월간 max(일별 활성) 기반 MVP 추정 */
export function dailyToMonthly(daily: DailyMetricRow[]): MonthlyMetricRow[] {
  const byMonth = new Map<
    string,
    {
      newUsers: number[];
      active: number[];
      views: number[];
      returning: number[];
      returningRate: number[];
    }
  >();

  for (const r of daily) {
    const mk = toMonthKey(r.date);
    const key = `${r.service}|${mk}`;
    if (!byMonth.has(key)) {
      byMonth.set(key, { newUsers: [], active: [], views: [], returning: [], returningRate: [] });
    }
    const b = byMonth.get(key)!;
    b.newUsers.push(r.newUsers);
    b.active.push(r.activeUsers);
    b.views.push(r.views);
    b.returning.push(r.returningUsers);
    if (r.activeUsers > 0) b.returningRate.push(r.returningUsers / r.activeUsers);
  }

  const out: MonthlyMetricRow[] = [];
  for (const [key, b] of byMonth) {
    const [service, month] = key.split('|');
    const mauEst = b.active.length ? Math.max(...b.active) : 0;
    out.push({
      service,
      device: 'all',
      month,
      newUsersSum: b.newUsers.reduce((a, c) => a + c, 0),
      mauEstimate: mauEst,
      viewsSum: b.views.reduce((a, c) => a + c, 0),
      returningUsersSum: b.returning.reduce((a, c) => a + c, 0),
      returningRateAvg: mean(b.returningRate),
    });
  }
  return out.sort((a, b) => a.month.localeCompare(b.month));
}

/** 일별 → 연도별: 신규/조회/재방문은 합, MAU는 연간 max(일별 활성) 기반 MVP 추정 */
export function dailyToYearly(daily: DailyMetricRow[]): YearlyMetricRow[] {
  const byYear = new Map<
    string,
    {
      newUsers: number[];
      active: number[];
      views: number[];
      returning: number[];
      returningRate: number[];
    }
  >();

  for (const r of daily) {
    const yk = toYearKey(r.date);
    const key = `${r.service}|${yk}`;
    if (!byYear.has(key)) {
      byYear.set(key, { newUsers: [], active: [], views: [], returning: [], returningRate: [] });
    }
    const b = byYear.get(key)!;
    b.newUsers.push(r.newUsers);
    b.active.push(r.activeUsers);
    b.views.push(r.views);
    b.returning.push(r.returningUsers);
    if (r.activeUsers > 0) b.returningRate.push(r.returningUsers / r.activeUsers);
  }

  const out: YearlyMetricRow[] = [];
  for (const [key, b] of byYear) {
    const [service, year] = key.split('|');
    const mauEst = b.active.length ? Math.max(...b.active) : 0;
    out.push({
      service,
      device: 'all',
      year,
      newUsersSum: b.newUsers.reduce((a, c) => a + c, 0),
      mauEstimate: mauEst,
      viewsSum: b.views.reduce((a, c) => a + c, 0),
      returningUsersSum: b.returning.reduce((a, c) => a + c, 0),
      returningRateAvg: mean(b.returningRate),
    });
  }
  return out.sort((a, b) => a.year.localeCompare(b.year));
}

export interface KpiSnapshot {
  label: string;
  value: number;
  unit: '명' | '건' | '%';
  momPct: number | null;
  note?: string;
}

function sumInRange(
  daily: DailyMetricRow[],
  service: string,
  start: string,
  end: string,
  pick: (r: DailyMetricRow) => number,
): number {
  let s = 0;
  for (const r of daily) {
    if (r.service !== service) continue;
    if (r.date < start || r.date > end) continue;
    s += pick(r);
  }
  return s;
}

function avgReturningRate(daily: DailyMetricRow[], service: string, start: string, end: string): number | null {
  const rates: number[] = [];
  for (const r of daily) {
    if (r.service !== service) continue;
    if (r.date < start || r.date > end) continue;
    if (r.activeUsers > 0) rates.push(r.returningUsers / r.activeUsers);
  }
  return mean(rates);
}

/** 기간 내 MAU 추정: 일별 활성의 max */
function maxActiveInRange(daily: DailyMetricRow[], service: string, start: string, end: string): number {
  let m = 0;
  for (const r of daily) {
    if (r.service !== service) continue;
    if (r.date < start || r.date > end) continue;
    m = Math.max(m, r.activeUsers);
  }
  return m;
}

/** 전월 동일 길이 구간 MoM */
export function buildExecutiveKpis(
  daily: DailyMetricRow[],
  rangeStart: string,
  rangeEnd: string,
): { kpis: KpiSnapshot[]; dataNote: string } {
  const len = Math.max(1, daysBetween(rangeStart, rangeEnd) + 1);
  const prevEnd = addDays(rangeStart, -1);
  const prevStart = addDays(prevEnd, -(len - 1));

  const dataNote =
    '※ GA4 일별 데이터 기반 집계이며, Mobile/PC 합산 과정에서 일부 중복 가능성이 있습니다.';

  const mauTutor = maxActiveInRange(daily, NE_TUTOR, rangeStart, rangeEnd);
  const mauTutorPrev = maxActiveInRange(daily, NE_TUTOR, prevStart, prevEnd);
  const newUvTutor = sumInRange(daily, NE_TUTOR, rangeStart, rangeEnd, (r) => r.newUsers);
  const newUvTutorPrev = sumInRange(daily, NE_TUTOR, prevStart, prevEnd, (r) => r.newUsers);
  const mauGb = maxActiveInRange(daily, '문법문제뱅크', rangeStart, rangeEnd);
  const mauGbPrev = maxActiveInRange(daily, '문법문제뱅크', prevStart, prevEnd);
  const mauNelt = maxActiveInRange(daily, 'NELT', rangeStart, rangeEnd);
  const mauNeltPrev = maxActiveInRange(daily, 'NELT', prevStart, prevEnd);
  /** NE Tutor 시트 = 사이트 전체 조회수 (개별 서비스 시트와 합산 금지) */
  const views = sumInRange(daily, NE_TUTOR, rangeStart, rangeEnd, (r) => r.views);
  const viewsPrev = sumInRange(daily, NE_TUTOR, prevStart, prevEnd, (r) => r.views);
  const rr = avgReturningRate(daily, NE_TUTOR, rangeStart, rangeEnd);
  const rrPrev = avgReturningRate(daily, NE_TUTOR, prevStart, prevEnd);

  const pct = (cur: number, prev: number) => {
    if (prev === 0) return null;
    return ((cur - prev) / prev) * 100;
  };

  const kpis: KpiSnapshot[] = [
    { label: 'NE Tutor MAU', value: Math.round(mauTutor), unit: '명', momPct: pct(mauTutor, mauTutorPrev) },
    { label: 'NE Tutor 신규 사용자', value: Math.round(newUvTutor), unit: '명', momPct: pct(newUvTutor, newUvTutorPrev) },
    { label: '문법문제뱅크 활성 사용자', value: Math.round(mauGb), unit: '명', momPct: pct(mauGb, mauGbPrev) },
    { label: 'NELT MAU', value: Math.round(mauNelt), unit: '명', momPct: pct(mauNelt, mauNeltPrev) },
    { label: '전체 조회수', value: Math.round(views), unit: '건', momPct: pct(views, viewsPrev) },
    {
      label: 'NE Tutor 재방문 비율(일평균)',
      value: rr != null ? Math.round(rr * 1000) / 10 : 0,
      unit: '%',
      momPct: rr != null && rrPrev != null ? pct(rr, rrPrev) : null,
    },
  ];

  return { kpis, dataNote };
}

export interface EventImpactRow {
  eventDate: string;
  eventType: string;
  eventName: string;
  impactedService: string;
  newUvBefore: number;
  newUvAfter: number;
  newUvChangePct: number | null;
  mauBefore: number;
  mauAfter: number;
  mauChangePct: number | null;
  comment: string;
}

function eventTypeLabel(t: EcosystemEvent['type']): string {
  switch (t) {
    case 'open':
      return '오픈';
    case 'launch':
      return '출시';
    case 'end':
      return '종료';
    case 'reform':
      return '개편';
    default:
      return t;
  }
}

export function buildEventImpactTable(daily: DailyMetricRow[], windowDays = 30): EventImpactRow[] {
  const rows: EventImpactRow[] = [];
  const services = [NE_TUTOR, '문법문제뱅크', 'NELT', '어휘출제마법사', '클래스카드', '교재자료'];

  for (const ev of ECOSYSTEM_EVENTS) {
    const anchor = ev.anchorDate;
    const beforeStart = addDays(anchor, -windowDays);
    const beforeEnd = addDays(anchor, -1);
    const afterStart = anchor;
    const afterEnd = addDays(anchor, windowDays - 1);

    for (const svc of services) {
      const newB = sumInRange(daily, svc, beforeStart, beforeEnd, (r) => r.newUsers);
      const newA = sumInRange(daily, svc, afterStart, afterEnd, (r) => r.newUsers);
      const mauB = maxActiveInRange(daily, svc, beforeStart, beforeEnd);
      const mauA = maxActiveInRange(daily, svc, afterStart, afterEnd);
      const pct = (a: number, b: number) => (b === 0 ? null : ((a - b) / b) * 100);

      const nPct = pct(newA, newB);
      const mPct = pct(mauA, mauB);

      let comment = '변화 폭이 작거나 표본 구간이 짧아 데이터 해석은 보류합니다.';
      if (nPct != null && nPct > 150) {
        comment = '오픈 초기 구간으로 변동폭이 큼. 계절성·외부 요인과 함께 검토 필요.';
      } else if (nPct != null && nPct < -150) {
        comment = '신규 사용자가 급감한 구간입니다. 계절성·캠페인과 분리 검토 필요.';
      } else if (nPct != null && Math.abs(nPct) >= 10) {
        comment =
          nPct > 0
            ? `신규 사용자가 약 ${nPct.toFixed(1)}% 증가한 구간입니다. 이벤트와의 인과는 계절성 등 확인 필요.`
            : `신규 사용자가 약 ${Math.abs(nPct).toFixed(1)}% 감소한 구간입니다. 계절성·캠페인과 분리 검토 필요.`;
      } else if (mPct != null && Math.abs(mPct) >= 10) {
        comment = `활성 사용자(일별 기반) 변화 약 ${mPct.toFixed(1)}% — 세그먼트·중복 집계 여부 확인 권장.`;
      }

      rows.push({
        eventDate: anchor,
        eventType: eventTypeLabel(ev.type),
        eventName: ev.name,
        impactedService: svc,
        newUvBefore: Math.round(newB),
        newUvAfter: Math.round(newA),
        newUvChangePct: nPct,
        mauBefore: Math.round(mauB),
        mauAfter: Math.round(mauA),
        mauChangePct: mPct,
        comment,
      });
    }
  }
  return rows;
}

export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const ax = a.slice(0, n);
  const bx = b.slice(0, n);
  const meanA = mean(ax);
  const meanB = mean(bx);
  if (meanA == null || meanB == null) return null;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const va = ax[i] - meanA;
    const vb = bx[i] - meanB;
    num += va * vb;
    da += va * va;
    db += vb * vb;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

export function buildMonthlySeriesMap(monthly: MonthlyMetricRow[]): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>();
  for (const r of monthly) {
    if (!m.has(r.service)) m.set(r.service, new Map());
    m.get(r.service)!.set(r.month, r.mauEstimate);
  }
  return m;
}

export function correlationHeatmap(
  monthly: MonthlyMetricRow[],
  services: readonly string[],
): { z: (number | null)[][]; months: string[] } {
  const seriesMap = buildMonthlySeriesMap(monthly);
  const monthSet = new Set<string>();
  for (const s of services) {
    const sm = seriesMap.get(s);
    if (sm) sm.forEach((_, mo) => monthSet.add(mo));
  }
  const months = [...monthSet].sort();
  const vectors = services.map((s) => {
    const sm = seriesMap.get(s) ?? new Map();
    return months.map((mo) => sm.get(mo) ?? 0);
  });
  const z: (number | null)[][] = [];
  for (let i = 0; i < services.length; i++) {
    const row: (number | null)[] = [];
    for (let j = 0; j < services.length; j++) {
      row.push(pearson(vectors[i], vectors[j]));
    }
    z.push(row);
  }
  return { z, months };
}

export interface BeforeAfterBar {
  metric: string;
  before: number;
  after: number;
  changePct: number | null;
}

/** 문뱅 1·3개월 종료(2024-11) 전후 30일 */
export function grammarTerminationBeforeAfter(daily: DailyMetricRow[], anchor = '2024-11-01'): BeforeAfterBar[] {
  const beforeStart = addDays(anchor, -30);
  const beforeEnd = addDays(anchor, -1);
  const afterStart = anchor;
  const afterEnd = addDays(anchor, 29);

  const blocks: { label: string; service: string; mode: 'new' | 'mau' | 'rr' }[] = [
    { label: 'NE Tutor 신규 사용자', service: NE_TUTOR, mode: 'new' },
    { label: '문법문제뱅크 활성 사용자', service: '문법문제뱅크', mode: 'mau' },
    { label: 'NE Tutor 재방문 비율', service: NE_TUTOR, mode: 'rr' },
  ];

  const out: BeforeAfterBar[] = [];
  for (const b of blocks) {
    let v0 = 0;
    let v1 = 0;
    if (b.mode === 'new') {
      v0 = sumInRange(daily, b.service, beforeStart, beforeEnd, (r) => r.newUsers);
      v1 = sumInRange(daily, b.service, afterStart, afterEnd, (r) => r.newUsers);
    } else if (b.mode === 'mau') {
      v0 = maxActiveInRange(daily, b.service, beforeStart, beforeEnd);
      v1 = maxActiveInRange(daily, b.service, afterStart, afterEnd);
    } else {
      v0 = avgReturningRate(daily, b.service, beforeStart, beforeEnd) ?? 0;
      v1 = avgReturningRate(daily, b.service, afterStart, afterEnd) ?? 0;
    }
    const pct = v0 === 0 ? null : ((v1 - v0) / v0) * 100;
    out.push({
      metric: b.label,
      before: b.mode === 'rr' ? Math.round(v0 * 1000) / 10 : Math.round(v0),
      after: b.mode === 'rr' ? Math.round(v1 * 1000) / 10 : Math.round(v1),
      changePct: pct,
    });
  }
  return out;
}

export interface OrderMonthlyAgg {
  month: string;
  orders: number;
  customers: number;
  shortTerm: number;
  longTerm: number;
  other: number;
}

export function aggregateGrammarOrdersByMonth(orders: OrderRecord[]): OrderMonthlyAgg[] {
  const gOrders = orders.filter((o) => isGrammarCategory(o.category));
  const byMonth = new Map<
    string,
    { orders: number; users: Set<string>; short: number; long: number; other: number }
  >();

  for (const o of gOrders) {
    const month = `${o.orderDate.getFullYear()}-${String(o.orderDate.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth.has(month)) {
      byMonth.set(month, { orders: 0, users: new Set(), short: 0, long: 0, other: 0 });
    }
    const b = byMonth.get(month)!;
    b.orders += 1;
    b.users.add(o.userId);
    if (isShortTermGrammarProduct(o.product)) b.short += 1;
    else if (isLongTermGrammarProduct(o.product)) b.long += 1;
    else b.other += 1;
  }

  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, b]) => ({
      month,
      orders: b.orders,
      customers: b.users.size,
      shortTerm: b.short,
      longTerm: b.long,
      other: b.other,
    }));
}

function bucketOtherCategory(cat: string): string | null {
  if (isGrammarCategory(cat)) return null;
  if (cat.includes('NELT')) return 'NELT';
  if (cat.includes('교재')) return '교재자료';
  if (cat.includes('클래스')) return '클래스카드';
  if (cat.includes('어휘') || cat.includes('마법사')) return '어휘출제마법사';
  if (cat.includes('AI')) return 'AI 관련';
  return '기타';
}

/**
 * 문뱅 구매자를 첫 문뱅 주문 이후 첫 타카테고리 주문으로 배분해 Sankey 합이 맞도록 함.
 */
export function grammarBuyerFlowPartition(orders: OrderRecord[]): {
  labels: string[];
  counts: Record<string, number>;
  totalGrammarBuyers: number;
} {
  const byUser = new Map<string, OrderRecord[]>();
  for (const o of orders) {
    if (!byUser.has(o.userId)) byUser.set(o.userId, []);
    byUser.get(o.userId)!.push(o);
  }
  for (const arr of byUser.values()) {
    arr.sort((a, b) => a.orderDate.getTime() - b.orderDate.getTime());
  }

  const counts: Record<string, number> = {
    문뱅만: 0,
    NELT: 0,
    교재자료: 0,
    클래스카드: 0,
    어휘출제마법사: 0,
    AI관련: 0,
    기타: 0,
  };

  let grammarBuyers = 0;
  for (const [, arr] of byUser) {
    const firstG = arr.findIndex((o) => isGrammarCategory(o.category));
    if (firstG < 0) continue;
    grammarBuyers += 1;
    const t0 = arr[firstG].orderDate.getTime();
    const later = arr.filter((_, i) => i > firstG);
    const nextOther = later.find((o) => !isGrammarCategory(o.category) && o.orderDate.getTime() >= t0);
    if (!nextOther) {
      counts['문뱅만'] += 1;
      continue;
    }
    const bk = bucketOtherCategory(nextOther.category);
    if (bk === 'NELT') counts.NELT += 1;
    else if (bk === '교재자료') counts['교재자료'] += 1;
    else if (bk === '클래스카드') counts['클래스카드'] += 1;
    else if (bk === '어휘출제마법사') counts['어휘출제마법사'] += 1;
    else if (bk === 'AI 관련') counts.AI관련 += 1;
    else counts.기타 += 1;
  }

  return { labels: Object.keys(counts).sort(), counts, totalGrammarBuyers: grammarBuyers };
}

/** 주문 기준: 동일 고객이 함께 이용한 카테고리(원본명) 조합별 인원 수 — ID 미노출 집계용 */
export interface CategoryComboSummaryRow {
  comboLabel: string;
  customerCount: number;
  totalOrders: number;
}

export function buildCategoryComboSummary(orders: OrderRecord[]): CategoryComboSummaryRow[] {
  const catsByUser = new Map<string, Set<string>>();
  const ordersByUser = new Map<string, number>();
  for (const o of orders) {
    if (!catsByUser.has(o.userId)) catsByUser.set(o.userId, new Set());
    catsByUser.get(o.userId)!.add((o.category || '').trim() || '(카테고리 없음)');
    ordersByUser.set(o.userId, (ordersByUser.get(o.userId) ?? 0) + 1);
  }
  const comboAgg = new Map<string, { customers: number; orders: number }>();
  for (const [uid, cats] of catsByUser) {
    const comboLabel = [...cats].sort((a, b) => a.localeCompare(b, 'ko')).join(' + ');
    if (!comboAgg.has(comboLabel)) comboAgg.set(comboLabel, { customers: 0, orders: 0 });
    const row = comboAgg.get(comboLabel)!;
    row.customers += 1;
    row.orders += ordersByUser.get(uid) ?? 0;
  }
  return [...comboAgg.entries()]
    .map(([comboLabel, v]) => ({
      comboLabel,
      customerCount: v.customers,
      totalOrders: v.orders,
    }))
    .sort((a, b) => b.customerCount - a.customerCount || a.comboLabel.localeCompare(b.comboLabel, 'ko'));
}

export function getDataDateBounds(daily: DailyMetricRow[]): { min: string; max: string } {
  let min = '9999-12-31';
  let max = '0000-01-01';
  for (const r of daily) {
    if (r.date < min) min = r.date;
    if (r.date > max) max = r.date;
  }
  if (min === '9999-12-31') return { min: '2022-01-01', max: '2026-12-31' };
  return { min, max };
}
