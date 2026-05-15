import { useEffect, useMemo, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { Data, Layout } from 'plotly.js';
import { APP_FONT_FAMILY } from '../fonts';
import { useTheme } from '../context/ThemeContext';
import type { BeforeAfterBar, CategoryComboSummaryRow, OrderMonthlyAgg } from '../utils/metrics';

function splitCategories(comboLabel: string): string[] {
  return comboLabel
    .split(/\s*\+\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 조합에 문법문제뱅크가 있으면 그 항목을 루트로, 없으면 가나다순 첫 카테고리를 루트로 */
function pickRootAndRest(cats: string[]): { root: string; rest: string[] } {
  const gIdx = cats.findIndex((c) => c.includes('문법문제뱅크'));
  if (gIdx >= 0) {
    const root = cats[gIdx];
    const rest = cats.filter((_, i) => i !== gIdx).sort((a, b) => a.localeCompare(b, 'ko'));
    return { root, rest };
  }
  const sorted = [...cats].sort((a, b) => a.localeCompare(b, 'ko'));
  return { root: sorted[0], rest: sorted.slice(1) };
}

interface ComboRootGroup {
  root: string;
  rows: { subLabel: string; customerCount: number; totalOrders: number; comboLabel: string }[];
}

function buildComboRootGroups(rows: CategoryComboSummaryRow[]): ComboRootGroup[] {
  const map = new Map<string, ComboRootGroup['rows']>();
  for (const r of rows) {
    const cats = splitCategories(r.comboLabel);
    if (!cats.length) continue;
    const { root, rest } = pickRootAndRest(cats);
    const subLabel =
      rest.length === 0 ? '· 단일 이용 (이 카테고리만)' : `ㄴ ${rest.join(' · ')}`;
    if (!map.has(root)) map.set(root, []);
    map.get(root)!.push({
      subLabel,
      customerCount: r.customerCount,
      totalOrders: r.totalOrders,
      comboLabel: r.comboLabel,
    });
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => {
      const aOnly = a.subLabel.startsWith('·');
      const bOnly = b.subLabel.startsWith('·');
      if (aOnly !== bOnly) return aOnly ? -1 : 1;
      if (b.customerCount !== a.customerCount) return b.customerCount - a.customerCount;
      return a.subLabel.localeCompare(b.subLabel, 'ko');
    });
  }
  const rootOrder = (a: string, b: string) => {
    const aG = a.includes('문법문제뱅크');
    const bG = b.includes('문법문제뱅크');
    if (aG !== bG) return aG ? -1 : 1;
    return a.localeCompare(b, 'ko');
  };
  return [...map.entries()]
    .sort(([ra], [rb]) => rootOrder(ra, rb))
    .map(([root, gRows]) => ({ root, rows: gRows }));
}

export function GrammarSection(props: {
  beforeAfter: BeforeAfterBar[];
  orderMonthly: OrderMonthlyAgg[];
  categoryComboSummary: CategoryComboSummaryRow[];
  hasOrders: boolean;
}) {
  const { chartTheme, plotlyHoverlabel } = useTheme();
  const refBar = useRef<HTMLDivElement>(null);
  const refLine = useRef<HTMLDivElement>(null);

  const barData = useMemo(() => {
    const metrics = props.beforeAfter.map((b) => b.metric);
    const before = props.beforeAfter.map((b) => b.before);
    const after = props.beforeAfter.map((b) => b.after);
    const traces: Data[] = [
      {
        type: 'bar',
        name: '전 30일',
        x: metrics,
        y: before,
        marker: { color: '#64748b' },
        hovertemplate: '%{x}<br>전: %{y:,}<extra></extra>',
      },
      {
        type: 'bar',
        name: '후 30일',
        x: metrics,
        y: after,
        marker: { color: '#3b82f6' },
        hovertemplate: '%{x}<br>후: %{y:,}<extra></extra>',
      },
    ];
    const layout: Partial<Layout> = {
      barmode: 'group',
      paper_bgcolor: chartTheme.paper,
      plot_bgcolor: chartTheme.plot,
      font: { color: chartTheme.font, family: APP_FONT_FAMILY },
      hoverlabel: { ...plotlyHoverlabel },
      margin: { t: 28, r: 16, b: 80, l: 56 },
      xaxis: { tickangle: -20 },
      yaxis: { title: { text: '값' } },
      legend: { orientation: 'h', y: 1.1 },
    };
    return { traces, layout };
  }, [props.beforeAfter, chartTheme, plotlyHoverlabel]);

  const lineData = useMemo(() => {
    const months = props.orderMonthly.map((o) => o.month);
    const traces: Data[] = [
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: '문뱅 주문 건수',
        x: months,
        y: props.orderMonthly.map((o) => o.orders),
        yaxis: 'y',
        line: { color: '#f472b6' },
        hovertemplate: '%{x}<br>주문 %{y:,}건<extra></extra>',
      },
      {
        type: 'scatter',
        mode: 'lines+markers',
        name: '고유 구매 고객 수',
        x: months,
        y: props.orderMonthly.map((o) => o.customers),
        yaxis: 'y2',
        line: { color: '#fbbf24' },
        hovertemplate: '%{x}<br>고유 구매 고객 %{y:,}명<extra></extra>',
      },
    ];
    const layout: Partial<Layout> = {
      paper_bgcolor: chartTheme.paper,
      plot_bgcolor: chartTheme.plot,
      font: { color: chartTheme.font, family: APP_FONT_FAMILY },
      hoverlabel: { ...plotlyHoverlabel },
      margin: { t: 36, r: 56, b: 48, l: 56 },
      xaxis: { title: { text: '월' } },
      yaxis: { title: { text: '주문 건수' }, side: 'left' },
      yaxis2: {
        title: { text: '고유 구매 고객(명)' },
        overlaying: 'y',
        side: 'right',
        showgrid: false,
      },
      legend: { orientation: 'h', y: 1.12 },
    };
    return { traces, layout };
  }, [props.orderMonthly, chartTheme, plotlyHoverlabel]);

  useEffect(() => {
    const el = refBar.current;
    if (!el) return;
    Plotly.newPlot(el, barData.traces, barData.layout, {
      responsive: true,
      displaylogo: false,
      displayModeBar: false,
    });
    return () => Plotly.purge(el);
  }, [barData]);

  useEffect(() => {
    const el = refLine.current;
    if (!el || !props.hasOrders) return;
    Plotly.newPlot(el, lineData.traces, lineData.layout, {
      responsive: true,
      displaylogo: false,
      displayModeBar: false,
    });
    return () => Plotly.purge(el);
  }, [lineData, props.hasOrders]);

  const comboDisplay = useMemo(() => {
    const max = 500;
    const list = props.categoryComboSummary;
    const slice = list.slice(0, max);
    const groups = buildComboRootGroups(slice);
    return {
      groups,
      truncated: list.length > max,
      totalRows: list.length,
      shownComboRows: slice.length,
    };
  }, [props.categoryComboSummary]);

  const totalCustomers = useMemo(
    () => props.categoryComboSummary.reduce((s, r) => s + r.customerCount, 0),
    [props.categoryComboSummary],
  );

  return (
    <>
    <div className="grammar-grid">
      <div>
        <h3 className="subhead">문뱅 1·3개월 종료(2024-11) 전후 30일</h3>
        <div ref={refBar} className="chart-box" style={{ minHeight: 360 }} />
        <ul className="mini-list">
          {props.beforeAfter.map((b) => (
            <li key={b.metric}>
              <strong>{b.metric}</strong>: 전 {b.before} → 후 {b.after}
              {b.changePct != null && (
                <span className={b.changePct >= 0 ? 'pct-pos' : 'pct-neg'}>
                  {' '}
                  ({b.changePct >= 0 ? '+' : ''}
                  {b.changePct.toFixed(1)}%)
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="subhead">문법문제뱅크 주문 월별 (단기/장기 상품)</h3>
        <p className="muted-p" style={{ margin: '0 0 8px', fontSize: '0.78rem' }}>
          <strong>고객</strong>은 그 달에 문법문제뱅크 카테고리 주문이 1건 이상 있는 <strong>서로 다른 사용자 ID 수</strong>
          입니다. 같은 사람이 여러 번 주문하면 <strong>주문</strong> 건수만 늘고, 고객 수는 1명으로만 집계됩니다.
        </p>
        {!props.hasOrders ? (
          <p className="muted-p">주문 엑셀 없음 — public/data에 주문별현황 파일을 두면 표시됩니다.</p>
        ) : (
          <>
            <div ref={refLine} className="chart-box" style={{ minHeight: 360 }} />
            <div className="table-wrap" style={{ maxHeight: 240, marginTop: 10 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>월</th>
                    <th>주문</th>
                    <th>고유 고객</th>
                    <th>1·3개월</th>
                    <th>6·12개월</th>
                    <th>기타 상품</th>
                  </tr>
                </thead>
                <tbody>
                  {props.orderMonthly.slice(-18).map((o) => (
                    <tr key={o.month}>
                      <td>{o.month}</td>
                      <td>{o.orders}</td>
                      <td>{o.customers}</td>
                      <td>{o.shortTerm}</td>
                      <td>{o.longTerm}</td>
                      <td>{o.other}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>

    <div style={{ marginTop: 28 }}>
      <h3 className="subhead">이용 카테고리 조합별 고객 수</h3>
      <p className="muted-p">
        고객 ID는 표시하지 않습니다. <strong>문법문제뱅크</strong>가 들어간 조합은 같은 이름 아래에 묶고, 함께 쓴
        카테고리는 <strong>ㄴ</strong>으로 들여 썼습니다. 그 외 조합은 가나다순 첫 카테고리를 묶음 제목으로
        씁니다.
      </p>
      {!props.hasOrders ? (
        <p className="muted-p">주문 엑셀 없음 — 표시할 데이터가 없습니다.</p>
      ) : (
        <>
          <div className="table-wrap" style={{ maxHeight: 'min(60vh, 720px)', marginTop: 10 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>이용 카테고리 (묶음 · 세부)</th>
                  <th>고객 수</th>
                  <th>주문 합계(건)</th>
                </tr>
              </thead>
              <tbody>
                {comboDisplay.groups.flatMap((g) => [
                  <tr key={`root-${g.root}`} className="combo-root-row">
                    <td colSpan={3}>
                      <strong>{g.root}</strong>
                    </td>
                  </tr>,
                  ...g.rows.map((r) => (
                    <tr key={r.comboLabel}>
                      <td className="combo-subcell" title={r.comboLabel}>
                        {r.subLabel}
                      </td>
                      <td>{r.customerCount.toLocaleString('ko-KR')}</td>
                      <td>{r.totalOrders.toLocaleString('ko-KR')}</td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
          <p className="muted-p" style={{ marginTop: 8 }}>
            조합 종류 {comboDisplay.totalRows.toLocaleString('ko-KR')}개 · 고객 수 합계{' '}
            {totalCustomers.toLocaleString('ko-KR')}명(한 고객은 한 조합에만 포함)
            {comboDisplay.truncated &&
              ` · 표는 고객 수가 많은 조합부터 최대 ${comboDisplay.shownComboRows.toLocaleString('ko-KR')}개 조합까지 표시합니다.`}
          </p>
        </>
      )}
    </div>
    </>
  );
}
