import type { KpiSnapshot } from '../utils/metrics';

function formatInt(n: number): string {
  return new Intl.NumberFormat('ko-KR').format(n);
}

export function KpiRow(props: { kpis: KpiSnapshot[] }) {
  const n = Math.max(1, props.kpis.length);
  return (
    <div className="kpi-grid" style={{ ['--kpi-cols' as string]: String(n) }}>
      {props.kpis.map((k) => (
        <div key={k.label} className="kpi-card">
          <div className="kpi-label">{k.label}</div>
          <div className="kpi-value">
            {k.unit === '%' ? `${k.value}%` : `${formatInt(k.value)}${k.unit === '건' ? '건' : '명'}`}
          </div>
          <div className="kpi-mom">
            전월 대비{' '}
            {k.momPct == null ? (
              <span>데이터 확인 필요</span>
            ) : (
              <span className={k.momPct >= 0 ? 'pct-pos' : 'pct-neg'}>
                {k.momPct >= 0 ? '+' : ''}
                {k.momPct.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
