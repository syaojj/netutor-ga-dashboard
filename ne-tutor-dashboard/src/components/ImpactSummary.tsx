import type { EventImpactRow } from '../utils/metrics';

function fmtPct(v: number | null): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

/** 우측 요약: NE Tutor 기준 이벤트별 한 줄 */
export function ImpactSummary(props: { rows: EventImpactRow[] }) {
  const rows = props.rows.filter((r) => r.impactedService === 'NE Tutor');
  return (
    <div className="impact-summary card-like">
      <h3 className="impact-summary-title">주요 이벤트 영향 요약 (NE Tutor)</h3>
      <p className="impact-summary-note">전후 30일 비교</p>
      <div className="table-wrap" style={{ maxHeight: 400 }}>
        <table className="data">
          <thead>
            <tr>
              <th>이벤트</th>
              <th>신규 사용자 변화</th>
              <th>활성 사용자 변화</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.eventDate}-${i}`}>
                <td style={{ whiteSpace: 'normal', maxWidth: 200 }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{r.eventDate}</div>
                  {r.eventName.length > 40 ? `${r.eventName.slice(0, 40)}…` : r.eventName}
                </td>
                <td className={r.newUvChangePct != null && r.newUvChangePct >= 0 ? 'pct-pos' : 'pct-neg'}>
                  {fmtPct(r.newUvChangePct)}
                </td>
                <td className={r.mauChangePct != null && r.mauChangePct >= 0 ? 'pct-pos' : 'pct-neg'}>
                  {fmtPct(r.mauChangePct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
