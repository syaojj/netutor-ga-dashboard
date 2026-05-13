/**
 * 월별 차트와 동일한 월 축·스타일이나, PC/Mobile MAU·신규를 각각 선(막대)으로 분리 표시합니다.
 * 이벤트 말풍선·세로 점선은 사용하지 않습니다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { Data, Layout, Shape } from 'plotly.js';
import type { MonthlyByDeviceRow } from '../types';
import { APP_FONT_FAMILY } from '../fonts';
import { SERIES_STYLE, TREND_SERVICE_ROW, type TrendSeriesName } from './TrendChart';

function hexToRgba(hex: string, a: number): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function monthsInRange(rangeStart: string, rangeEnd: string): string[] {
  const start = rangeStart.slice(0, 7);
  const end = rangeEnd.slice(0, 7);
  const out: string[] = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  const endY = Number(end.slice(0, 4));
  const endM = Number(end.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  if (out.length === 0) out.push(start);
  return out;
}

function formatMonthTick(mo: string): string {
  return `${mo.slice(0, 4)}.${mo.slice(5, 7)}`;
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

const BAR_NAMES = new Set(['통합회원 PC 신규', '통합회원 Mobile 신규']);

const NE_PRIMARY: readonly string[] = [
  'NE Tutor PC MAU',
  'NE Tutor Mobile MAU',
  'NE Tutor PC 신규사용자',
  'NE Tutor Mobile 신규사용자',
  '통합회원 PC 신규',
  '통합회원 Mobile 신규',
];

function buildSecondarySplitNames(): string[] {
  const out: string[] = [];
  for (const s of TREND_SERVICE_ROW) {
    out.push(
      `${s.display} PC MAU`,
      `${s.display} Mobile MAU`,
      `${s.display} PC 신규사용자`,
      `${s.display} Mobile 신규사용자`,
    );
  }
  return out;
}

const ALL_SPLIT_NAMES = [...NE_PRIMARY, ...buildSecondarySplitNames()];

function styleFor(name: string): { color: string; dash: 'solid' | 'dot' } {
  if (name.startsWith('NE Tutor')) {
    if (name.includes('MAU')) {
      return name.includes('Mobile')
        ? { color: '#93c5fd', dash: 'solid' }
        : { color: SERIES_STYLE['NE Tutor MAU'].color, dash: 'solid' };
    }
    return name.includes('Mobile')
      ? { color: '#bfdbfe', dash: 'dot' }
      : { color: SERIES_STYLE['NE Tutor 신규사용자'].color, dash: 'dot' };
  }
  if (name.startsWith('통합회원')) {
    return name.includes('Mobile')
      ? { color: '#fca5a5', dash: 'solid' }
      : { color: '#f87171', dash: 'solid' };
  }
  for (const s of TREND_SERVICE_ROW) {
    if (!name.startsWith(s.display)) continue;
    const mauKey = `${s.display} MAU` as TrendSeriesName;
    const newKey = `${s.display} 신규사용자` as TrendSeriesName;
    if (name.includes('MAU')) {
      return name.includes('Mobile')
        ? { color: lighten(SERIES_STYLE[mauKey].color, 0.35), dash: 'solid' }
        : { color: SERIES_STYLE[mauKey].color, dash: 'solid' };
    }
    return name.includes('Mobile')
      ? { color: lighten(SERIES_STYLE[newKey].color, 0.25), dash: 'dot' }
      : { color: SERIES_STYLE[newKey].color, dash: 'dot' };
  }
  return { color: '#94a3b8', dash: 'solid' };
}

/** hex 색을 밝게 */
function lighten(hex: string, t: number): string {
  const m = hex.replace('#', '');
  const r = Math.round(parseInt(m.slice(0, 2), 16) + (255 - parseInt(m.slice(0, 2), 16)) * t);
  const g = Math.round(parseInt(m.slice(2, 4), 16) + (255 - parseInt(m.slice(2, 4), 16)) * t);
  const b = Math.round(parseInt(m.slice(4, 6), 16) + (255 - parseInt(m.slice(4, 6), 16)) * t);
  return `rgb(${r},${g},${b})`;
}

function fmtIntKo(n: number): string {
  return new Intl.NumberFormat('ko-KR').format(n);
}

interface HoverBlockData {
  name: string;
  color: string;
  pcMau: number;
  moMau: number;
  pcNew: number;
  moNew: number;
  teacherNew?: number;
  hasMau: boolean;
  newOnly?: boolean;
}

function SplitHoverBlock({ block }: { block: HoverBlockData }) {
  return (
    <div className="trend-hover-block">
      <div className="trend-hover-block-name">
        <span className="trend-hover-swatch" style={{ background: block.color }} />
        <span>{block.name}</span>
      </div>
      {block.hasMau && (
        <div className="trend-hover-row">
          <span className="trend-hover-label">MAU</span>
          <span className="trend-hover-value">
            PC {fmtIntKo(block.pcMau)}명, MO {fmtIntKo(block.moMau)}명
          </span>
        </div>
      )}
      <div className="trend-hover-row">
        <span className="trend-hover-label">{block.newOnly ? '신규가입' : '신규사용자'}</span>
        <span className="trend-hover-value">
          PC {fmtIntKo(block.pcNew)}명, MO {fmtIntKo(block.moNew)}명
          {block.newOnly && (block.teacherNew ?? 0) > 0 ? (
            <span>{' '}· 교강사 {fmtIntKo(block.teacherNew!)}명</span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function SplitHoverCard({
  hover,
  containerEl,
}: {
  hover: { x: string; primary: HoverBlockData[]; secondary: HoverBlockData[]; left: number; top: number };
  containerEl: HTMLDivElement | null;
}) {
  const rect = containerEl?.getBoundingClientRect();
  const containerW = rect?.width ?? 800;
  const estW = 540;
  let left = hover.left + 16;
  const top = Math.max(8, Math.min(hover.top - 10, (rect?.height ?? 600) - 40));
  if (left + estW > containerW - 4) left = Math.max(8, hover.left - estW - 12);

  return (
    <div
      className="trend-hover-card"
      style={{ position: 'absolute', left, top, zIndex: 90, pointerEvents: 'none' }}
    >
      <div className="trend-hover-title">{hover.x}</div>
      {hover.primary.length > 0 && (
        <div className="trend-hover-section trend-hover-section--primary">
          {hover.primary.map((s) => (
            <SplitHoverBlock key={s.name} block={s} />
          ))}
        </div>
      )}
      {hover.primary.length > 0 && hover.secondary.length > 0 && <div className="trend-hover-divider" />}
      {hover.secondary.length > 0 && (
        <div className="trend-hover-section trend-hover-section--secondary">
          {hover.secondary.map((s) => (
            <SplitHoverBlock key={s.name} block={s} />
          ))}
        </div>
      )}
    </div>
  );
}

const initialVisible = (): Record<string, boolean> =>
  Object.fromEntries(ALL_SPLIT_NAMES.map((n) => [n, true]));

export function TrendChartSplitDevice(props: {
  monthlyByDevice: readonly MonthlyByDeviceRow[];
  rangeStart: string;
  rangeEnd: string;
  logScale: boolean;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>(initialVisible);
  const [isFs, setIsFs] = useState(false);
  const [hover, setHover] = useState<{
    x: string;
    primary: HoverBlockData[];
    secondary: HoverBlockData[];
    left: number;
    top: number;
  } | null>(null);

  const seriesData = useMemo(() => {
    const months = monthsInRange(props.rangeStart, props.rangeEnd);
    const by = new Map<string, Map<string, MonthlyByDeviceRow>>();
    for (const r of props.monthlyByDevice) {
      if (!by.has(r.month)) by.set(r.month, new Map());
      by.get(r.month)!.set(r.service, r);
    }
    const get = (mo: string, svc: string) => by.get(mo)?.get(svc);

    const nMonths = months.length;
    const markerSize = nMonths <= 1 ? 12 : nMonths <= 3 ? 8 : 5;

    const series: { name: string; y: (number | null)[] }[] = [
      { name: 'NE Tutor PC MAU', y: months.map((mo) => get(mo, 'NE Tutor')?.pcMau ?? null) },
      { name: 'NE Tutor Mobile MAU', y: months.map((mo) => get(mo, 'NE Tutor')?.moMau ?? null) },
      { name: 'NE Tutor PC 신규사용자', y: months.map((mo) => get(mo, 'NE Tutor')?.pcNew ?? null) },
      { name: 'NE Tutor Mobile 신규사용자', y: months.map((mo) => get(mo, 'NE Tutor')?.moNew ?? null) },
      { name: '통합회원 PC 신규', y: months.map((mo) => get(mo, '통합회원')?.pcNew ?? null) },
      { name: '통합회원 Mobile 신규', y: months.map((mo) => get(mo, '통합회원')?.moNew ?? null) },
      ...TREND_SERVICE_ROW.flatMap((s) => [
        { name: `${s.display} PC MAU`, y: months.map((mo) => get(mo, s.dataService)?.pcMau ?? null) },
        { name: `${s.display} Mobile MAU`, y: months.map((mo) => get(mo, s.dataService)?.moMau ?? null) },
        { name: `${s.display} PC 신규사용자`, y: months.map((mo) => get(mo, s.dataService)?.pcNew ?? null) },
        { name: `${s.display} Mobile 신규사용자`, y: months.map((mo) => get(mo, s.dataService)?.moNew ?? null) },
      ]),
    ];

    return { months, series, markerSize };
  }, [props.monthlyByDevice, props.rangeStart, props.rangeEnd]);

  const chartHeight = useMemo(() => 60 + 360 + 56, []);

  const pcMoLookup = useMemo(() => {
    const map = new Map<string, Map<string, MonthlyByDeviceRow>>();
    for (const r of props.monthlyByDevice) {
      if (!map.has(r.month)) map.set(r.month, new Map());
      map.get(r.month)!.set(r.service, r);
    }
    return map;
  }, [props.monthlyByDevice]);

  const traces = useMemo((): Data[] => {
    const { months, series, markerSize } = seriesData;
    const lineSeries = series.filter((s) => !BAR_NAMES.has(s.name));
    const barSeries = series.filter((s) => BAR_NAMES.has(s.name));
    const ordered = [...lineSeries, ...barSeries];
    const out: Data[] = [];
    for (const s of ordered) {
      const on = visible[s.name] !== false;
      const st = styleFor(s.name);
      const yRaw = s.y;
      const y = props.logScale
        ? yRaw.map((v) => (v != null && Number.isFinite(v) && v > 0 ? v : null))
        : yRaw.map((v) => (v != null && Number.isFinite(v) ? v : null));

      if (BAR_NAMES.has(s.name)) {
        out.push({
          type: 'bar',
          name: s.name,
          x: months,
          y,
          visible: on,
          showlegend: false,
          marker: { color: hexToRgba(st.color, 0.82), line: { color: st.color, width: 1 } },
          hoverinfo: 'none',
        });
        continue;
      }

      out.push({
        type: 'scatter',
        mode: 'lines+markers',
        name: s.name,
        x: months,
        y,
        visible: on,
        showlegend: false,
        connectgaps: false,
        line: {
          shape: 'linear',
          width: 2,
          dash: st.dash === 'solid' ? undefined : st.dash,
          color: st.color,
        },
        marker: { size: markerSize, line: { width: 0 }, color: st.color },
        hoverinfo: 'none',
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
      yMin = Math.max(yMin * 0.35, 1);
      yMax = yMax * 1.35;
    } else {
      yMin = Math.max(0, yMin * 0.8);
      yMax = yMax * 1.2;
    }
    return { yMax, yMin };
  }, [seriesData, props.logScale, visible]);

  const secondaryNames = useMemo(
    () => ALL_SPLIT_NAMES.filter((n) => !(NE_PRIMARY as readonly string[]).includes(n)),
    [],
  );
  const toggleSeries = useCallback((name: string) => {
    setVisible((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      const on = ALL_SPLIT_NAMES.filter((n) => next[n] !== false).length;
      if (on === 0) return prev;
      return next;
    });
  }, []);
  const allSecondaryOn = secondaryNames.every((n) => visible[n] !== false);
  const toggleAllSecondary = useCallback(() => {
    setVisible((prev) => {
      const target = !secondaryNames.every((n) => prev[n] !== false);
      const next = { ...prev };
      for (const n of secondaryNames) next[n] = target;
      const on = ALL_SPLIT_NAMES.filter((n) => next[n] !== false).length;
      if (on === 0) return prev;
      return next;
    });
  }, [secondaryNames]);

  const resizePlot = useCallback(() => {
    const el = plotRef.current;
    if (!el) return;
    try {
      (Plotly as unknown as { Plots: { resize: (root: HTMLElement) => void } }).Plots.resize(el);
    } catch {
      /* noop */
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
      if (!document.fullscreenElement) await shell.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      /* noop */
    }
    setTimeout(resizePlot, 150);
  }, [resizePlot]);

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const { months } = seriesData;
    const shapes: Partial<Shape>[] = [];
    const xTickStep = Math.max(1, Math.ceil(months.length / 14));
    const tickvals = months.filter((_, i) => i % xTickStep === 0);
    const ticktext = tickvals.map(formatMonthTick);
    const logY =
      props.logScale && yMax > 0
        ? buildLogYAxisTicks(yMin, yMax)
        : { tickvals: [] as number[], ticktext: [] as string[] };
    const linearY = !props.logScale ? buildLinearYAxisTicks(yMin, yMax) : {};
    const topMargin = 60;

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
      margin: { t: topMargin, r: 24, b: 56, l: 76 },
      showlegend: false,
      xaxis: {
        type: 'category',
        categoryorder: 'array',
        categoryarray: months,
        gridcolor: '#374151',
        tickangle: -35,
        title: { text: '월' },
        tickmode: 'array',
        tickvals,
        ticktext,
      },
      yaxis,
      shapes,
      annotations: [],
      hovermode: 'closest',
      barmode: 'group',
      bargap: 0.2,
    };

    Plotly.newPlot(el, traces, layout, {
      responsive: true,
      displaylogo: false,
      locale: 'ko',
      displayModeBar: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    });

    const handleHover = (data: Readonly<{ points: { x: string }[]; event: MouseEvent }>) => {
      const point = data.points?.[0];
      if (!point) return;
      const xv = String(point.x);
      const monthMap = pcMoLookup.get(xv);
      if (!monthMap) return;

      const mauColorForSvc = (svc: string): string => {
        if (svc === 'NE Tutor') return SERIES_STYLE['NE Tutor MAU'].color;
        if (svc === '통합회원') return SERIES_STYLE['통합회원'].color;
        const key = `${svc} MAU` as TrendSeriesName;
        return SERIES_STYLE[key]?.color ?? '#94a3b8';
      };

      const make = (svc: string, opts?: { newOnly?: boolean }): HoverBlockData | null => {
        const r = monthMap.get(svc);
        if (!r) return null;
        return {
          name: svc,
          color: mauColorForSvc(svc),
          pcMau: r.pcMau,
          moMau: r.moMau,
          pcNew: r.pcNew,
          moNew: r.moNew,
          teacherNew: svc === '통합회원' ? r.teacherNew : undefined,
          hasMau: !opts?.newOnly,
          newOnly: opts?.newOnly,
        };
      };

      const primary: HoverBlockData[] = [];
      const n1 = make('NE Tutor');
      if (n1) primary.push(n1);
      const n2 = make('통합회원', { newOnly: true });
      if (n2) primary.push(n2);
      const secondary = ['NELT', '문법문제', '문법예문', '어휘출제', '클래스카드']
        .map((s) => make(s))
        .filter((b): b is HoverBlockData => b != null);

      const shell = shellRef.current;
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      setHover({
        x: xv,
        primary,
        secondary,
        left: data.event.clientX - rect.left,
        top: data.event.clientY - rect.top,
      });
    };
    const handleUnhover = () => setHover(null);
    const pe = el as unknown as {
      on: (ev: string, cb: (d: never) => void) => void;
      removeAllListeners?: (ev: string) => void;
    };
    pe.on('plotly_hover', handleHover as unknown as (d: never) => void);
    pe.on('plotly_unhover', handleUnhover as unknown as (d: never) => void);

    return () => {
      pe.removeAllListeners?.('plotly_hover');
      pe.removeAllListeners?.('plotly_unhover');
      Plotly.purge(el);
    };
  }, [traces, props.logScale, seriesData, yMax, yMin, visible, pcMoLookup]);

  return (
    <div ref={shellRef} className="trend-chart-shell chart-box">
      <div className="trend-chart-toolbar">
        <div className="trend-series-toggles" aria-label="PC/Mobile 분리 시리즈">
          <div className="trend-toggle-group trend-toggle-group--primary">
            {NE_PRIMARY.slice(0, 4).map((name) => {
              const st = styleFor(name);
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
          <div className="trend-toggle-group trend-toggle-group--primary">
            {NE_PRIMARY.slice(4, 6).map((name) => {
              const st = styleFor(name);
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
          <div className="trend-toggle-group trend-toggle-group--others">
            <label className="trend-trace-toggle trend-trace-toggle--all">
              <input type="checkbox" checked={allSecondaryOn} onChange={toggleAllSecondary} />
              <span>전체</span>
            </label>
            {(['MAU · PC', 'MAU · Mobile', '신규 · PC', '신규 · Mobile'] as const).map((rowLabel, ri) => (
              <div key={rowLabel} className="trend-service-row">
                <span className="trend-service-row-label">{rowLabel}</span>
                {TREND_SERVICE_ROW.map((s) => {
                  const name =
                    ri === 0
                      ? `${s.display} PC MAU`
                      : ri === 1
                        ? `${s.display} Mobile MAU`
                        : ri === 2
                          ? `${s.display} PC 신규사용자`
                          : `${s.display} Mobile 신규사용자`;
                  const st = styleFor(name);
                  const on = visible[name] !== false;
                  return (
                    <label key={name} className={`trend-trace-toggle${on ? '' : ' trend-trace-toggle-off'}`}>
                      <input type="checkbox" checked={on} onChange={() => toggleSeries(name)} />
                      <span className="trend-swatch" style={{ background: st.color, opacity: on ? 1 : 0.35 }} />
                      <span>{s.display}</span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <button type="button" className="btn trend-fs-btn" onClick={toggleFullscreen}>
          {isFs ? '전체 화면 종료' : '전체 화면'}
        </button>
      </div>
      <div ref={plotRef} style={{ width: '100%', height: chartHeight }} />
      {hover && (hover.primary.length > 0 || hover.secondary.length > 0) && (
        <SplitHoverCard hover={hover} containerEl={shellRef.current} />
      )}
    </div>
  );
}
