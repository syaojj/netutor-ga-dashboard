import { useMemo } from 'react';
import type { EventImpactRow } from '../utils/metrics';

function badgeClass(t: string): string {
  if (t === '종료') return 'badge badge-end';
  if (t === '개편') return 'badge badge-reform';
  if (t === '출시') return 'badge badge-launch';
  return 'badge badge-open';
}

function fmtPct(v: number | null): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function eventGroupKey(r: EventImpactRow): string {
  return `${r.eventDate}|${r.eventType}|${r.eventName}`;
}

export function EventImpactTable(props: { rows: EventImpactRow[] }) {
  const groups = useMemo(() => {
    const sorted = [...props.rows].sort((a, b) => {
      const ka = eventGroupKey(a);
      const kb = eventGroupKey(b);
      if (ka !== kb) return ka.localeCompare(kb);
      return a.impactedService.localeCompare(b.impactedService, 'ko');
    });
    const out: EventImpactRow[][] = [];
    for (const r of sorted) {
      const prev = out[out.length - 1];
      if (prev && eventGroupKey(prev[0]) === eventGroupKey(r)) prev.push(r);
      else out.push([r]);
    }
    return out;
  }, [props.rows]);

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>이벤트 날짜</th>
            <th>이벤트 유형</th>
            <th>이벤트명</th>
            <th>영향 서비스</th>
            <th>영향 기간</th>
            <th>전30일 신규 사용자</th>
            <th>후30일 신규 사용자</th>
            <th>신규 사용자 변화</th>
            <th>전30일 활성 사용자</th>
            <th>후30일 활성 사용자</th>
            <th>활성 사용자 변화</th>
            <th>데이터 해석</th>
          </tr>
        </thead>
        <tbody>
          {groups.flatMap((gRows) => {
            const rs = gRows[0];
            const n = gRows.length;
            return gRows.map((r, i) => (
              <tr key={`${eventGroupKey(r)}-${r.impactedService}-${i}`}>
                {i === 0 && (
                  <>
                    <td rowSpan={n}>{rs.eventDate}</td>
                    <td rowSpan={n}>
                      <span className={badgeClass(rs.eventType)}>{rs.eventType}</span>
                    </td>
                    <td rowSpan={n} style={{ whiteSpace: 'normal', maxWidth: 220 }}>
                      {rs.eventName.length > 40 ? `${rs.eventName.slice(0, 40)}…` : rs.eventName}
                    </td>
                  </>
                )}
                <td>{r.impactedService}</td>
                {i === 0 && <td rowSpan={n}>전후 30일</td>}
                <td>{r.newUvBefore.toLocaleString('ko-KR')}</td>
                <td>{r.newUvAfter.toLocaleString('ko-KR')}</td>
                <td className={r.newUvChangePct != null && r.newUvChangePct >= 0 ? 'pct-pos' : 'pct-neg'}>
                  {fmtPct(r.newUvChangePct)}
                </td>
                <td>{r.mauBefore.toLocaleString('ko-KR')}</td>
                <td>{r.mauAfter.toLocaleString('ko-KR')}</td>
                <td className={r.mauChangePct != null && r.mauChangePct >= 0 ? 'pct-pos' : 'pct-neg'}>
                  {fmtPct(r.mauChangePct)}
                </td>
                <td style={{ whiteSpace: 'normal', minWidth: 220 }}>{r.comment}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
      <p className="section-desc" style={{ marginTop: 10, fontSize: '0.8rem' }}>
        ※ <strong>이벤트 유형</strong>: 오픈/종료/개편 · <strong>영향 기간</strong>: 전후 30일 · <strong>데이터 해석</strong>:
        계절성 여부 등 참고 · 동일 이벤트는 날짜·유형·명 기준으로 묶어 서비스별 행을 나열합니다.
      </p>
    </div>
  );
}
