import { useEffect, useMemo, useRef } from 'react';
import { APP_FONT_FAMILY } from '../fonts';
import { useTheme } from '../context/ThemeContext';
import Plotly from 'plotly.js-dist-min';
import type { Data, Layout } from 'plotly.js';

const HEATMAP_HOVER =
  '%{y} ↔ %{x}<br><b>상관 r = %{z:.2f}</b><br><br>' +
  '· <b>1에 가까움</b>: 월별 이용(MAU) 그래프가 비슷하게 오르거나 내려간 달이 많다는 뜻입니다.<br>' +
  '· <b>0에 가까움</b>: 서로 따로 움직인 경우가 많습니다.<br>' +
  '· <b>음수</b>: 한쪽이 오를 때 다른 쪽이 내리는 경향이 있습니다.<br>' +
  '<span style="font-size:10px;opacity:0.85">※ 같은 사람인지는 이 표로는 알 수 없습니다.</span><extra></extra>';

export function CorrelationPanel(props: {
  labels: readonly string[];
  z: (number | null)[][];
  months: string[];
}) {
  const { chartTheme, plotlyHoverlabel } = useTheme();
  const ref = useRef<HTMLDivElement>(null);

  const { data, layout } = useMemo(() => {
    const trace = {
      type: 'heatmap',
      x: [...props.labels],
      y: [...props.labels],
      z: props.z.map((row) => row.map((v) => (v == null ? 0 : v))),
      hovertemplate: HEATMAP_HOVER,
      colorscale: 'RdBu',
      zmid: 0,
      zmin: -1,
      zmax: 1,
    } as Data;
    const layout: Partial<Layout> = {
      paper_bgcolor: chartTheme.paper,
      plot_bgcolor: chartTheme.plot,
      font: { color: chartTheme.font, size: 11, family: APP_FONT_FAMILY },
      hoverlabel: { ...plotlyHoverlabel },
      margin: { t: 48, r: 100, b: 160, l: 140 },
      title: {
        text: props.months.length ? `월 수: ${props.months.length}개 구간` : '데이터 부족',
        font: { size: 12, color: chartTheme.font, family: APP_FONT_FAMILY },
      },
      xaxis: {
        side: 'bottom',
        tickangle: -42,
        automargin: true,
        tickfont: { size: 10, family: APP_FONT_FAMILY },
      },
      yaxis: {
        automargin: true,
        tickfont: { size: 10, family: APP_FONT_FAMILY },
      },
    };
    return { data: [trace], layout };
  }, [props.labels, props.z, props.months, chartTheme, plotlyHoverlabel]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    Plotly.newPlot(el, data, layout, { responsive: true, displaylogo: false });
    return () => Plotly.purge(el);
  }, [data, layout]);

  return (
    <div>
      <div ref={ref} className="chart-box chart-box-heatmap" style={{ minHeight: 460 }} />
      <p className="muted-p">
        색이 <strong>빨갛고 진할수록</strong> 두 서비스의 <strong>월별 이용(MAU) 추세가 비슷</strong>했다는 뜻입니다.
        <strong>NE Tutor</strong> 행·열을 보시면 다른 서비스와의 관계를 한눈에 비교할 수 있습니다. 같은
        고객인지는 구분하지 않으며, 학기·방학 등 <strong>계절</strong>이나 이벤트 영향도 함께 고려해 주세요.
      </p>
    </div>
  );
}
