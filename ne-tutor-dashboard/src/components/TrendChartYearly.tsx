import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { Data, Layout, Shape } from 'plotly.js';
import type { EcosystemEvent, YearlyMetricRow } from '../types';
import { assignEventAnnotationLanes } from '../utils/trendEventLayout';
import { APP_FONT_FAMILY, PLOTLY_HOVERLABEL } from '../fonts';
import { TREND_SERIES_NAMES } from './TrendChart';

const SERIES_STYLE: Record<
  (typeof TREND_SERIES_NAMES)[number],
  { color: string; dash: 'solid' | 'dot' }
> = {
  'NE Tutor MAU': { color: '#60a5fa', dash: 'solid' },
  'NE Tutor 신규 사용자(월합)': { color: '#93c5fd', dash: 'dot' },
  '문법문제뱅크 활성 사용자': { color: '#f472b6', dash: 'solid' },
  '문법문제뱅크 신규 사용자(월합)': { color: '#f9a8d4', dash: 'dot' },
  'NELT MAU': { color: '#fbbf24', dash: 'solid' },
  '어휘출제마법사 MAU': { color: '#34d399', dash: 'solid' },
  '클래스카드 MAU': { color: '#a78bfa', dash: 'solid' },
  '교재자료 MAU': { color: '#fb923c', dash: 'solid' },
};

function yearKeyFromAnchor(iso: string): string {
  return iso.slice(0, 4);
}

function yearsInRange(rangeStart: string, rangeEnd: string): string[] {
  const y0 = Number(rangeStart.slice(0, 4));
  const y1 = Number(rangeEnd.slice(0, 4));
  const out: string[] = [];
  for (let y = y0; y <= y1; y++) out.push(String(y));
  if (out.length === 0) out.push(String(y0));
  return out;
}

function eventColor(t: EcosystemEvent['type']): string {
  if (t === 'end') return '#f87171';
  if (t === 'reform') return '#c084fc';
  if (t === 'launch') return '#60a5fa';
  return '#4ade80';
}

function eventBubbleText(ev: EcosystemEvent): string {
  if (ev.type === 'end') return '종료';
  if (ev.type === 'reform') return '개편';
  if (ev.type === 'launch') return '출시';
  return '오픈';
}

function eventLineColor(ev: EcosystemEvent): string {
  return eventColor(ev.type);
}

function buildLogYAxisTicks(ymin: number, ymax: number): { tickvals: number[]; ticktext: string[] } {
  const lo = Math.floor(Math.log10(Math.max(ymin, 1)));
  const hi = Math.ceil(Math.log10(Math.max(ymax, 10)));
  const vals: number[] = [];
  for (let p = lo; p <= hi; p++) {
    const b = 10 ** p;
    for (const mul of [1, 2, 5]) {
      const v = mul * b;
      if (v >= ymin * 0.4 && v <= ymax * 2.5) vals.push(v);
    }
  }
  const uniq = [...new Set(vals)].sort((a, b) => a - b);
  return {
    tickvals: uniq,
    ticktext: uniq.map((n) => Math.round(n).toLocaleString('ko-KR')),
  };
}

function buildLinearYAxisTicks(ymin: number, ymax: number): Partial<Layout['yaxis']> {
  const span = ymax - ymin || 1;
  const rough = span / 6;
  const pow10 = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(pow10, 1);
  const start = Math.floor(ymin / step) * step;
  const tickvals: number[] = [];
  for (let v = start; v <= ymax + step; v += step) {
    if (v >= ymin - step * 0.01) tickvals.push(v);
  }
  return {
    tickmode: 'array',
    tickvals,
    ticktext: tickvals.map((n) => Math.round(n).toLocaleString('ko-KR')),
  };
}

const initialVisible = (): Record<string, boolean> =>
  Object.fromEntries(TREND_SERIES_NAMES.map((n) => [n, true]));

export function TrendChartYearly(props: {
  yearly: YearlyMetricRow[];
  rangeStart: string;
  rangeEnd: string;
  logScale: boolean;
  events: EcosystemEvent[];
  services: readonly string[];
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>(initialVisible);
  const [isFs, setIsFs] = useState(false);

  const seriesData = useMemo(() => {
    const years = yearsInRange(props.rangeStart, props.rangeEnd);
    const by = new Map<string, Map<string, YearlyMetricRow>>();
    for (const r of props.yearly) {
      if (!by.has(r.service)) by.set(r.service, new Map());
      by.get(r.service)!.set(r.year, r);
    }

    const nY = years.length;
    const markerSize = nY <= 1 ? 12 : nY <= 3 ? 8 : 5;
    const mauY = (svc: string) => years.map((y) => by.get(svc)?.get(y)?.mauEstimate ?? null);
    const newY = (svc: string) => years.map((y) => by.get(svc)?.get(y)?.newUsersSum ?? null);

    const series: {
      name: (typeof TREND_SERIES_NAMES)[number];
      y: (number | null)[];
    }[] = [
      { name: 'NE Tutor MAU', y: mauY('NE Tutor') },
      { name: 'NE Tutor 신규 사용자(월합)', y: newY('NE Tutor') },
      { name: '문법문제뱅크 활성 사용자', y: mauY('문법문제뱅크') },
      { name: '문법문제뱅크 신규 사용자(월합)', y: newY('문법문제뱅크') },
      { name: 'NELT MAU', y: mauY('NELT') },
      { name: '어휘출제마법사 MAU', y: mauY('어휘출제마법사') },
      { name: '클래스카드 MAU', y: mauY('클래스카드') },
      { name: '교재자료 MAU', y: mauY('교재자료') },
    ];

    return { years, series, markerSize };
  }, [props.yearly, props.rangeStart, props.rangeEnd]);

  const traces = useMemo((): Data[] => {
    const { years, series, markerSize } = seriesData;
    const out: Data[] = [];
    for (const s of series) {
      const on = visible[s.name] !== false;
      const st = SERIES_STYLE[s.name];
      const yRaw = s.y;
      const y = props.logScale
        ? yRaw.map((v) => (v != null && Number.isFinite(v) && v > 0 ? v : null))
        : yRaw.map((v) => (v != null && Number.isFinite(v) ? v : null));
      out.push({
        type: 'scatter',
        mode: 'lines+markers',
        name: s.name,
        x: years,
        y,
        visible: on,
        showlegend: false,
        connectgaps: false,
        line: { shape: 'linear', width: 2, dash: st.dash === 'solid' ? undefined : st.dash, color: st.color },
        marker: { size: markerSize, line: { width: 0 }, color: st.color },
        hovertemplate: `${s.name}<br>%{customdata}년<br>%{y:,}명<extra></extra>`,
        customdata: years,
      });
    }
    return out;
  }, [seriesData, props.logScale, visible]);

  const { yMax, yMin } = useMemo(() => {
    const { series } = seriesData;
    let yMax = 10;
    let yMin = 0;
    for (const s of series) {
      if (visible[s.name] === false) continue;
      const yRaw = s.y;
      const y = props.logScale
        ? yRaw.map((v) => (v != null && Number.isFinite(v) && v > 0 ? v : null))
        : yRaw.map((v) => (v != null && Number.isFinite(v) ? v : null));
      for (const v of y) {
        if (v != null && Number.isFinite(v) && v > 0) {
          yMax = Math.max(yMax, v);
          yMin = yMin === 0 ? v : Math.min(yMin, v);
        }
      }
    }
    if (props.logScale) {
      yMin = Math.max(yMin * 0.5, 1);
      yMax = yMax * 1.15;
    } else {
      yMin = Math.max(0, yMin * 0.9);
      yMax = yMax * 1.1;
    }
    return { yMax, yMin };
  }, [seriesData, props.logScale, visible]);

  const toggleSeries = useCallback((name: string) => {
    setVisible((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      const on = TREND_SERIES_NAMES.filter((n) => next[n] !== false).length;
      if (on === 0) return prev;
      return next;
    });
  }, []);

  const resizePlot = useCallback(() => {
    const el = plotRef.current;
    if (!el) return;
    try {
      (Plotly as unknown as { Plots: { resize: (root: HTMLElement) => void } }).Plots.resize(el);
    } catch {
      /* 그래프 미생성 등 */
    }
  }, []);

  useEffect(() => {
    const onFs = () => {
      setIsFs(document.fullscreenElement === shellRef.current);
      setTimeout(resizePlot, 120);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [resizePlot]);

  useEffect(() => {
    window.addEventListener('resize', resizePlot);
    return () => window.removeEventListener('resize', resizePlot);
  }, [resizePlot]);

  const toggleFullscreen = useCallback(async () => {
    const shell = shellRef.current;
    if (!shell) return;
    try {
      if (!document.fullscreenElement) {
        await shell.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* 일부 브라우저/iframe에서 거절될 수 있음 */
    }
    setTimeout(resizePlot, 150);
  }, [resizePlot]);

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;

    const { years } = seriesData;
    const firstY = years[0];
    const lastY = years[years.length - 1];
    const eventsVisible = props.events.filter((ev) => {
      const yk = yearKeyFromAnchor(ev.anchorDate);
      return yk >= firstY && yk <= lastY;
    });

    const shapes: Partial<Shape>[] = eventsVisible.map((ev) => ({
      type: 'line',
      xref: 'x',
      yref: 'paper',
      x0: yearKeyFromAnchor(ev.anchorDate),
      x1: yearKeyFromAnchor(ev.anchorDate),
      y0: 0,
      y1: 1,
      line: { color: eventLineColor(ev), width: 1, dash: 'dot' },
    }));

    const xTickStep = Math.max(1, Math.ceil(years.length / 12));
    const tickvals = years.filter((_, i) => i % xTickStep === 0);
    const ticktext = tickvals.map((y) => `${y}년`);

    const logY =
      props.logScale && yMax > 0
        ? buildLogYAxisTicks(yMin, yMax)
        : { tickvals: [] as number[], ticktext: [] as string[] };
    const linearY = !props.logScale ? buildLinearYAxisTicks(yMin, yMax) : {};

    const annMeta = assignEventAnnotationLanes(eventsVisible, years, (anchor) =>
      years.indexOf(yearKeyFromAnchor(anchor)),
    );
    const yStep = 0.034;
    const annotations = annMeta.map(({ ev, lane, xshift }) => {
      const border = eventLineColor(ev);
      const shortName = ev.name.length > 16 ? `${ev.name.slice(0, 16)}…` : ev.name;
      const yPaper = 1.012 + lane * yStep;
      return {
        x: yearKeyFromAnchor(ev.anchorDate),
        xref: 'x' as const,
        xshift,
        y: yPaper,
        yref: 'paper' as const,
        text: `<b>${eventBubbleText(ev)}</b><br>${shortName}`,
        showarrow: false,
        arrowhead: 0,
        arrowwidth: 0,
        ax: 0,
        ay: 0,
        xanchor: 'center' as const,
        yanchor: 'bottom' as const,
        bgcolor: 'rgba(17,24,39,0.96)',
        bordercolor: border,
        borderwidth: 1.5,
        borderpad: 6,
        font: { family: APP_FONT_FAMILY, size: 9, color: '#f9fafb' },
        align: 'center' as const,
      };
    });

    const maxLanes = annMeta.length === 0 ? 0 : Math.max(...annMeta.map((a) => a.lane + 1));
    const topMargin = Math.min(320, 60 + maxLanes * 40);

    const yaxis: Partial<Layout['yaxis']> = {
      type: props.logScale ? 'log' : 'linear',
      gridcolor: '#374151',
      title: undefined,
      rangemode: props.logScale ? undefined : 'tozero',
      separatethousands: true,
      exponentformat: 'none',
      showexponent: 'none',
      ...(props.logScale && logY.tickvals.length
        ? { tickmode: 'array', tickvals: logY.tickvals, ticktext: logY.ticktext }
        : !props.logScale
          ? linearY
          : { tickformat: ',.0f' }),
    };

    const layout: Partial<Layout> = {
      paper_bgcolor: '#1f2937',
      plot_bgcolor: '#1f2937',
      font: { color: '#e5e7eb', family: APP_FONT_FAMILY, size: 11 },
      hoverlabel: { ...PLOTLY_HOVERLABEL },
      margin: { t: topMargin, r: 24, b: 56, l: 72 },
      showlegend: false,
      xaxis: {
        type: 'category',
        categoryorder: 'array',
        categoryarray: years,
        gridcolor: '#374151',
        tickangle: 0,
        title: { text: '연도' },
        tickmode: 'array',
        tickvals,
        ticktext,
      },
      yaxis,
      shapes,
      annotations,
      hovermode: 'x unified',
    };

    Plotly.newPlot(el, traces, layout, {
      responsive: true,
      displaylogo: false,
      locale: 'ko',
      displayModeBar: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    });

    return () => {
      Plotly.purge(el);
    };
  }, [traces, props.logScale, props.events, seriesData, yMax, yMin]);

  void props.services;

  return (
    <div ref={shellRef} className="trend-chart-shell chart-box">
      <div className="trend-chart-toolbar">
        <div className="trend-series-toggles" aria-label="표시할 시리즈 선택">
          {TREND_SERIES_NAMES.map((name) => {
            const st = SERIES_STYLE[name];
            const on = visible[name] !== false;
            return (
              <label key={name} className={`trend-trace-toggle${on ? '' : ' trend-trace-toggle-off'}`}>
                <input type="checkbox" checked={on} onChange={() => toggleSeries(name)} />
                <span className="trend-swatch" style={{ background: st.color, opacity: on ? 1 : 0.35 }} />
                <span>{name}</span>
              </label>
            );
          })}
        </div>
        <button type="button" className="btn trend-fs-btn" onClick={toggleFullscreen} title="Plotly 툴바의 확대 아이콘은 축 자동 맞춤입니다. 여기서 차트 영역 전체화면을 켜고 끕니다.">
          {isFs ? '전체 화면 종료' : '전체 화면'}
        </button>
      </div>
      <div ref={plotRef} style={{ width: '100%', height: 440 }} />
      <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '8px 10px 0' }}>
        연도 축은 <strong>이 섹션의 기간 검색</strong>에 맞춥니다. 신규 사용자(월합) 라벨은 월별 차트와 동일한 범례명을
        쓰며, 년간 합계를 표시합니다.
      </p>
    </div>
  );
}
