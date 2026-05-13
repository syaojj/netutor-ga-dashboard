import { useEffect, useMemo, useRef } from 'react';
import { APP_FONT_FAMILY } from '../fonts';
import Plotly from 'plotly.js-dist-min';
import type { Data, Layout } from 'plotly.js';

export function FlowSankey(props: {
  flow: { labels: string[]; counts: Record<string, number>; totalGrammarBuyers: number };
  disabled: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const spec = useMemo(() => {
    if (props.disabled || props.flow.totalGrammarBuyers === 0) {
      return null;
    }
    const total = props.flow.totalGrammarBuyers;
    const labels = props.flow.labels;
    const labelNodes = ['문뱅 구매자', ...labels];
    const source: number[] = [];
    const target: number[] = [];
    const value: number[] = [];

    for (let i = 0; i < labels.length; i++) {
      const lab = labels[i];
      const c = props.flow.counts[lab] ?? 0;
      if (c <= 0) continue;
      source.push(0);
      target.push(i + 1);
      value.push(c);
    }

    const colors = ['#3b82f6', ...labels.map(() => '#64748b')];

    const data: Data = {
      type: 'sankey',
      orientation: 'h',
      node: {
        pad: 12,
        thickness: 14,
        line: { color: '#374151', width: 0.4 },
        label: labelNodes,
        color: colors,
      },
      link: { source, target, value },
    };
    const layout: Partial<Layout> = {
      paper_bgcolor: '#1f2937',
      plot_bgcolor: '#1f2937',
      font: { color: '#e5e7eb', family: APP_FONT_FAMILY },
      margin: { t: 8, r: 8, b: 8, l: 8 },
    };
    return { data: [data], layout, total };
  }, [props.flow, props.disabled]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!spec) {
      el.replaceChildren();
      return;
    }
    Plotly.newPlot(el, spec.data, spec.layout, { responsive: true, displaylogo: false });
    return () => Plotly.purge(el);
  }, [spec]);

  if (props.disabled) {
    return <p className="muted-p">주문 데이터가 없어 Sankey를 생략합니다.</p>;
  }
  if (!spec) {
    return <p className="muted-p">문뱅 구매자가 없거나 분류 결과가 비었습니다.</p>;
  }

  return (
    <div>
      <div ref={ref} className="chart-box" style={{ minHeight: 400 }} />
      <p className="muted-p">
        총 문뱅 구매자 {spec.total.toLocaleString('ko-KR')}명 기준, 첫 문뱅 이후 <strong>시간상 가장 빠른</strong>{' '}
        비문뱅 카테고리 주문으로 1인 1버킷 배분했습니다. 실제 복수 이용은 더 높을 수 있습니다.
      </p>
    </div>
  );
}
