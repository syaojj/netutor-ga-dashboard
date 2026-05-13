import { useMemo, useState, type CSSProperties } from 'react';
import type { DailyMetricRow, EcosystemEvent } from '../types';
import { addDays } from '../utils/dateUtil';

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

/**
 * NE Tutor 일별 데이터에서 (이벤트 anchor 기준) 전/후 window 일 비교 증감율 계산.
 * - 디바이스 필터: PC/Mobile 둘 다 false면 비교 결과는 모두 null
 * - 신규사용자: 전·후 기간의 합계 비교
 * - MAU: 전·후 기간의 일별 activeUsers 최댓값 비교
 */
function compareWindow(
  daily: DailyMetricRow[],
  anchor: string,
  windowDays: number,
  includePC: boolean,
  includeMobile: boolean,
): DeviceWindowResult {
  if (!includePC && !includeMobile) return { newPct: null, mauPct: null };

  const beforeStart = addDays(anchor, -windowDays);
  const beforeEnd = addDays(anchor, -1);
  const afterStart = anchor;
  const afterEnd = addDays(anchor, windowDays - 1);

  let newB = 0;
  let newA = 0;
  let mauB = 0;
  let mauA = 0;

  for (const r of daily) {
    if (r.service !== NE_TUTOR) continue;
    if (r.device === 'PC' && !includePC) continue;
    if (r.device === 'M' && !includeMobile) continue;
    if (r.date >= beforeStart && r.date <= beforeEnd) {
      newB += r.newUsers;
      mauB = Math.max(mauB, r.activeUsers);
    } else if (r.date >= afterStart && r.date <= afterEnd) {
      newA += r.newUsers;
      mauA = Math.max(mauA, r.activeUsers);
    }
  }

  return { newPct: pct(newA, newB), mauPct: pct(mauA, mauB) };
}

/**
 * 주요 서비스 변화 추이
 * - 이벤트 발생일 기준 NE Tutor 일별 데이터를 이용해 30일/3개월 윈도우 증감율 표기
 * - PC/Mobile 체크박스: 선택된 디바이스의 데이터만 합산하여 비교
 */
export function ImpactSummary(props: { daily: DailyMetricRow[]; events: readonly EcosystemEvent[] }) {
  const [includePC, setIncludePC] = useState(true);
  const [includeMobile, setIncludeMobile] = useState(false);

  const rows = useMemo(() => {
    return props.events.map((ev) => {
      const w30 = compareWindow(props.daily, ev.anchorDate, 30, includePC, includeMobile);
      const w90 = compareWindow(props.daily, ev.anchorDate, 90, includePC, includeMobile);
      return { ev, w30, w90 };
    });
  }, [props.daily, props.events, includePC, includeMobile]);

  // 두 체크박스 모두 꺼지지 않도록 강제
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
              <th className="impact-subhead">30일전</th>
              <th className="impact-subhead">3개월전</th>
              <th className="impact-subhead">30일전</th>
              <th className="impact-subhead">3개월전</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ ev, w30, w90 }) => {
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
                    <PctCell value={w30.newPct} />
                  </td>
                  <td className="impact-pct-cell">
                    <PctCell value={w90.newPct} />
                  </td>
                  <td className="impact-pct-cell">
                    <PctCell value={w30.mauPct} />
                  </td>
                  <td className="impact-pct-cell">
                    <PctCell value={w90.mauPct} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
