import { useMemo, useState, type CSSProperties } from 'react';
import type { EcosystemEvent, MonthlyByDeviceRow } from '../types';
import { toMonthKey, addCalendarMonths } from '../utils/dateUtil';

const NE_TUTOR = 'NE Tutor';

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
      return { label: '오픈', bg: 'rgba(22, 163, 74, 0.12)', fg: '#15803d', border: '#22c55e' };
    case 'end':
      return { label: '종료', bg: 'rgba(220, 38, 38, 0.1)', fg: '#b91c1c', border: '#ef4444' };
    case 'reform':
      return { label: '개편', bg: 'rgba(147, 51, 234, 0.1)', fg: '#6b21a8', border: '#a855f7' };
    case 'launch':
      return { label: '출시', bg: 'rgba(37, 99, 235, 0.1)', fg: '#1d4ed8', border: '#3b82f6' };
    default:
      return { label: type || '기타', bg: 'rgba(100,116,139,0.12)', fg: '#475569', border: '#94a3b8' };
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

/** 창(연속 월)의 첫 달 대비 마지막 달 증감율 */
interface SpanEndpointGrowth {
  mauPct: number | null;
  newPct: number | null;
}

function newForDevices(r: MonthlyByDeviceRow, includePC: boolean, includeMobile: boolean): number | null {
  if (includePC && r.pcNew == null) return null;
  if (includeMobile && r.moNew == null) return null;
  let v = 0;
  if (includePC) v += r.pcNew!;
  if (includeMobile) v += r.moNew!;
  return v;
}

function mauForDevices(r: MonthlyByDeviceRow, includePC: boolean, includeMobile: boolean): number | null {
  if (includePC && r.pcMau == null) return null;
  if (includeMobile && r.moMau == null) return null;
  let v = 0;
  if (includePC) v += r.pcMau!;
  if (includeMobile) v += r.moMau!;
  return v;
}

function spanEndpointGrowth(
  byMonth: Map<string, Map<string, MonthlyByDeviceRow>>,
  monthKeys: string[],
  includePC: boolean,
  includeMobile: boolean,
): SpanEndpointGrowth {
  if (!includePC && !includeMobile || monthKeys.length < 2) return { mauPct: null, newPct: null };
  const firstM = monthKeys[0];
  const lastM = monthKeys[monthKeys.length - 1];
  const rFirst = byMonth.get(firstM)?.get(NE_TUTOR);
  const rLast = byMonth.get(lastM)?.get(NE_TUTOR);
  if (!rFirst || !rLast) return { mauPct: null, newPct: null };
  const mauFirst = mauForDevices(rFirst, includePC, includeMobile);
  const mauLast = mauForDevices(rLast, includePC, includeMobile);
  const newFirst = newForDevices(rFirst, includePC, includeMobile);
  const newLast = newForDevices(rLast, includePC, includeMobile);
  return {
    mauPct: mauFirst != null && mauLast != null ? pct(mauLast, mauFirst) : null,
    newPct: newFirst != null && newLast != null ? pct(newLast, newFirst) : null,
  };
}

function anchorThreeMonthWindows(
  byMonth: Map<string, Map<string, MonthlyByDeviceRow>>,
  anchorDate: string,
  includePC: boolean,
  includeMobile: boolean,
): { before: SpanEndpointGrowth; after: SpanEndpointGrowth } {
  const M = toMonthKey(anchorDate);
  const beforeMonths: string[] = [];
  for (let k = 3; k >= 1; k--) beforeMonths.push(addCalendarMonths(M, -k));
  const afterMonths: string[] = [];
  for (let k = 0; k < 3; k++) afterMonths.push(addCalendarMonths(M, k));
  return {
    before: spanEndpointGrowth(byMonth, beforeMonths, includePC, includeMobile),
    after: spanEndpointGrowth(byMonth, afterMonths, includePC, includeMobile),
  };
}

/**
 * 주요 변경 추이
 * - 이벤트 기준월(M) 기준, 월간 통합(xlsx) NE Tutor 행으로 직전·직후 3개월 증감율
 */
export function ImpactSummary(props: {
  monthlyByDevice: readonly MonthlyByDeviceRow[];
  events: readonly EcosystemEvent[];
  /** 전년 동월 비교와 동일한 검색 구간 — 기준월이 이 안에 있는 이벤트만 표시 */
  rangeStart: string;
  rangeEnd: string;
  /** true면 외부 카드 안에 넣을 때 — 별도 card-like 테두리 없음 */
  embedded?: boolean;
  /** true면 내부 제목(h3) 숨김 — 상위 섹션에서 제목을 붙일 때 */
  suppressTitle?: boolean;
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

  const eventsInRange = useMemo(() => {
    const lo = props.rangeStart.slice(0, 7);
    const hi = props.rangeEnd.slice(0, 7);
    return props.events.filter((ev) => {
      const mk = toMonthKey(ev.anchorDate);
      return mk >= lo && mk <= hi;
    });
  }, [props.events, props.rangeStart, props.rangeEnd]);

  const rows = useMemo(() => {
    return eventsInRange.map((ev) => {
      const { before, after } = anchorThreeMonthWindows(
        byMonth,
        ev.anchorDate,
        includePC,
        includeMobile,
      );
      return { ev, before, after };
    });
  }, [byMonth, eventsInRange, includePC, includeMobile]);

  const togglePC = (v: boolean) => {
    if (!v && !includeMobile) return;
    setIncludePC(v);
  };
  const toggleMobile = (v: boolean) => {
    if (!v && !includePC) return;
    setIncludeMobile(v);
  };

  const rootClass = props.embedded
    ? 'impact-summary impact-summary--embedded'
    : 'impact-summary card-like';

  return (
    <div className={rootClass}>
      <div
        className={`impact-summary-head${props.suppressTitle ? ' impact-summary-head--toolbar-only' : ''}`}
      >
        {!props.suppressTitle && <h3 className="impact-summary-title">주요 변경 추이</h3>}
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
            <col className="impact-col-pct" />
            <col className="impact-col-pct" />
            <col className="impact-col-service" />
            <col className="impact-col-pct" />
            <col className="impact-col-pct" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="impact-th-metric">
                <span className="impact-th-main">MAU</span>
                <span className="impact-th-sub">직전 3개월 증감율</span>
              </th>
              <th scope="col" className="impact-th-metric">
                <span className="impact-th-main">신규</span>
                <span className="impact-th-sub">직전 3개월 증감율</span>
              </th>
              <th scope="col" className="impact-th-service">
                이벤트 · 기준일
              </th>
              <th scope="col" className="impact-th-metric">
                <span className="impact-th-main">MAU</span>
                <span className="impact-th-sub">직후 3개월 증감율</span>
              </th>
              <th scope="col" className="impact-th-metric">
                <span className="impact-th-main">신규</span>
                <span className="impact-th-sub">직후 3개월 증감율</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="impact-empty-row">
                  선택 구간(월)에 기준일이 들어오는 이벤트가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map(({ ev, before, after }) => {
                const badge = eventTypeBadge(ev.type);
                return (
                  <tr key={ev.id}>
                    <td className="impact-pct-cell">
                      <PctCell value={before.mauPct} />
                    </td>
                    <td className="impact-pct-cell">
                      <PctCell value={before.newPct} />
                    </td>
                    <td className="impact-service-cell">
                      <div className="impact-service-head">
                        <span style={badgeStyle(badge)}>{badge.label}</span>
                      </div>
                      <div className="impact-event-name">{ev.name}</div>
                      <div className="impact-event-date">{ev.anchorDate}</div>
                    </td>
                    <td className="impact-pct-cell">
                      <PctCell value={after.mauPct} />
                    </td>
                    <td className="impact-pct-cell">
                      <PctCell value={after.newPct} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="impact-summary-footnote">
        NE Tutor 지표는 <strong>월간 통합</strong>(xlsx) 기준입니다. 표에는 위에서 고른 월 구간에 기준일이 포함된
        이벤트만 나옵니다. 직전 3개월(M-3~M-1)·직후 3개월(M~M+2) 각각 구간의 <strong>첫 달 대비 마지막 달</strong>{' '}
        증감율입니다.
      </p>
    </div>
  );
}
