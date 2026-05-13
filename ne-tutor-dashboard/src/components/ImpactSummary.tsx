import { useMemo, useState, type CSSProperties } from 'react';
import type { EcosystemEvent, MonthlyByDeviceRow } from '../types';
import { toMonthKey } from '../utils/dateUtil';

const NE_TUTOR = 'NE Tutor';

/** YYYY-MM 에 달력 delta 개월을 더함 */
function addCalendarMonths(ym: string, delta: number): string {
  let y = Number(ym.slice(0, 4));
  let m = Number(ym.slice(5, 7)) - 1 + delta;
  while (m < 0) {
    m += 12;
    y -= 1;
  }
  while (m >= 12) {
    m -= 12;
    y += 1;
  }
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function fmtPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '-';
  return `${Math.abs(v).toFixed(1)}%`;
}

function pctSign(v: number | null): 'up' | 'down' | 'none' {
  if (v == null || !Number.isFinite(v)) return 'none';
  if (v > 0) return 'up';
  if (v < 0) return 'down';
  return 'none';
}

function PctCell({ value }: { value: number | null }) {
  const sign = pctSign(value);
  if (sign === 'none') return <span style={{ color: 'var(--muted)' }}>-</span>;
  return (
    <span className={sign === 'up' ? 'pct-pos' : 'pct-neg'} style={{ fontWeight: 600 }}>
      <span aria-hidden="true">{sign === 'up' ? '▲' : '▼'}</span>
      <span style={{ marginLeft: 4 }}>{fmtPct(value)}</span>
    </span>
  );
}

/** 이벤트 유형 → 배지 */
function eventTypeBadge(type: EcosystemEvent['type']): { label: string; bg: string; fg: string; border: string } {
  switch (type) {
    case 'open':
      return { label: '오픈', bg: 'rgba(74, 222, 128, 0.15)', fg: '#4ade80', border: '#4ade80' };
    case 'end':
      return { label: '종료', bg: 'rgba(248, 113, 113, 0.15)', fg: '#f87171', border: '#f87171' };
    case 'reform':
      return { label: '개편', bg: 'rgba(192, 132, 252, 0.15)', fg: '#c084fc', border: '#c084fc' };
    case 'launch':
      return { label: '출시', bg: 'rgba(96, 165, 250, 0.15)', fg: '#60a5fa', border: '#60a5fa' };
    default:
      return { label: type || '기타', bg: 'rgba(148,163,184,0.15)', fg: '#cbd5e1', border: '#cbd5e1' };
  }
}

const badgeStyle = (b: ReturnType<typeof eventTypeBadge>): CSSProperties => ({
  display: 'inline-block',
  padding: '1px 8px',
  fontSize: '0.7rem',
  fontWeight: 700,
  borderRadius: 999,
  background: b.bg,
  color: b.fg,
  border: `1px solid ${b.border}`,
  lineHeight: 1.4,
  whiteSpace: 'nowrap',
});

const pct = (a: number, b: number) => (b === 0 ? null : ((a - b) / b) * 100);

interface DeviceWindowResult {
  newPct: number | null;
  mauPct: number | null;
}

function newForDevices(r: MonthlyByDeviceRow, includePC: boolean, includeMobile: boolean): number {
  let v = 0;
  if (includePC) v += r.pcNew;
  if (includeMobile) v += r.moNew;
  return v;
}

function mauForDevices(r: MonthlyByDeviceRow, includePC: boolean, includeMobile: boolean): number {
  let v = 0;
  if (includePC) v += r.pcMau;
  if (includeMobile) v += r.moMau;
  return v;
}

/**
 * 월간 통합(NE Tutor)에서 anchor가 속한 월(M) 기준,
 * - 이전 beforeSpan개의 달(직전 달부터) vs
 * - 이후 afterSpan개의 달(M부터)
 * 신규는 월별 합, MAU는 해당 월들의 산술평균으로 비교.
 */
function aggregateNeTutorWindow(
  monthKeys: string[],
  byMonth: Map<string, Map<string, MonthlyByDeviceRow>>,
  includePC: boolean,
  includeMobile: boolean,
): { newSum: number; mauAvg: number | null } {
  if (!includePC && !includeMobile) return { newSum: 0, mauAvg: null };
  let newSum = 0;
  const mauSamples: number[] = [];
  for (const mo of monthKeys) {
    const r = byMonth.get(mo)?.get(NE_TUTOR);
    if (!r) continue;
    newSum += newForDevices(r, includePC, includeMobile);
    const mau = mauForDevices(r, includePC, includeMobile);
    mauSamples.push(mau);
  }
  const mauAvg =
    mauSamples.length > 0 ? mauSamples.reduce((a, b) => a + b, 0) / mauSamples.length : null;
  return { newSum, mauAvg };
}

function compareMonthWindows(
  byMonth: Map<string, Map<string, MonthlyByDeviceRow>>,
  anchorDate: string,
  beforeSpan: number,
  afterSpan: number,
  includePC: boolean,
  includeMobile: boolean,
): DeviceWindowResult {
  if (!includePC && !includeMobile) return { newPct: null, mauPct: null };

  const M = toMonthKey(anchorDate);
  const beforeMonths: string[] = [];
  for (let k = beforeSpan; k >= 1; k--) {
    beforeMonths.push(addCalendarMonths(M, -k));
  }
  const afterMonths: string[] = [];
  for (let k = 0; k < afterSpan; k++) {
    afterMonths.push(addCalendarMonths(M, k));
  }

  const before = aggregateNeTutorWindow(beforeMonths, byMonth, includePC, includeMobile);
  const after = aggregateNeTutorWindow(afterMonths, byMonth, includePC, includeMobile);

  const newPct = pct(after.newSum, before.newSum);
  const mauB = before.mauAvg;
  const mauA = after.mauAvg;
  const mauPct = mauA != null && mauB != null ? pct(mauA, mauB) : null;

  return { newPct, mauPct };
}

/**
 * 주요 서비스 변화 추이
 * - 이벤트 anchor가 속한 달(M) 기준, 월간 통합 xlsx에서 읽은 NE Tutor 월별 행으로 비교
 * - 1개월: 직전 1달 vs 이벤트 달(M) / 3개월: 직전 3달 vs M·M+1·M+2
 * - PC/Mobile: 선택 디바이스만 합산(신규), MAU는 월별 합(선택 디바이스)의 평균
 */
export function ImpactSummary(props: {
  monthlyByDevice: readonly MonthlyByDeviceRow[];
  events: readonly EcosystemEvent[];
}) {
  const [includePC, setIncludePC] = useState(true);
  const [includeMobile, setIncludeMobile] = useState(false);

  const byMonth = useMemo(() => {
    const map = new Map<string, Map<string, MonthlyByDeviceRow>>();
    for (const r of props.monthlyByDevice) {
      if (!map.has(r.month)) map.set(r.month, new Map());
      map.get(r.month)!.set(r.service, r);
    }
    return map;
  }, [props.monthlyByDevice]);

  const rows = useMemo(() => {
    return props.events.map((ev) => {
      const w1 = compareMonthWindows(byMonth, ev.anchorDate, 1, 1, includePC, includeMobile);
      const w3 = compareMonthWindows(byMonth, ev.anchorDate, 3, 3, includePC, includeMobile);
      return { ev, w1, w3 };
    });
  }, [byMonth, props.events, includePC, includeMobile]);

  const togglePC = (v: boolean) => {
    if (!v && !includeMobile) return;
    setIncludePC(v);
  };
  const toggleMobile = (v: boolean) => {
    if (!v && !includePC) return;
    setIncludeMobile(v);
  };

  return (
    <div className="impact-summary card-like">
      <div className="impact-summary-head">
        <h3 className="impact-summary-title">주요 서비스 변화 추이</h3>
        <div className="impact-summary-filters" aria-label="디바이스 필터">
          <label className="impact-summary-filter">
            <input
              type="checkbox"
              checked={includePC}
              onChange={(e) => togglePC(e.target.checked)}
            />
            PC
          </label>
          <label className="impact-summary-filter">
            <input
              type="checkbox"
              checked={includeMobile}
              onChange={(e) => toggleMobile(e.target.checked)}
            />
            Mobile
          </label>
        </div>
      </div>

      <div className="table-wrap impact-summary-body">
        <table className="data impact-summary-table">
          <colgroup>
            <col style={{ width: 64 }} />
            <col />
            <col style={{ width: 70 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 70 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>구분</th>
              <th rowSpan={2}>서비스</th>
              <th colSpan={2} className="impact-grouphead">신규사용자 증감율</th>
              <th colSpan={2} className="impact-grouphead">MAU 증감율</th>
            </tr>
            <tr>
              <th className="impact-subhead">1개월</th>
              <th className="impact-subhead">3개월</th>
              <th className="impact-subhead">1개월</th>
              <th className="impact-subhead">3개월</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ ev, w1, w3 }) => {
              const badge = eventTypeBadge(ev.type);
              return (
                <tr key={ev.id}>
                  <td>
                    <span style={badgeStyle(badge)}>{badge.label}</span>
                  </td>
                  <td>
                    <div className="impact-event-name">{ev.name}</div>
                    <div className="impact-event-date">{ev.anchorDate}</div>
                  </td>
                  <td className="impact-pct-cell">
                    <PctCell value={w1.newPct} />
                  </td>
                  <td className="impact-pct-cell">
                    <PctCell value={w3.newPct} />
                  </td>
                  <td className="impact-pct-cell">
                    <PctCell value={w1.mauPct} />
                  </td>
                  <td className="impact-pct-cell">
                    <PctCell value={w3.mauPct} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="impact-summary-footnote">
        NE Tutor는 <strong>월간 통합 데이터</strong>(xlsx) 기준입니다. 1개월: 이벤트 달(M) 대비 직전 1달 · 3개월: M~M+2
        대비 직전 3달(신규=월 합, MAU=월 평균).
      </p>
    </div>
  );
}
