import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { Config, Data, Layout, Shape } from 'plotly.js';
import type { EcosystemEvent, MonthlyByDeviceRow, YearlyMetricRow } from '../types';
import { assignEventAnnotationLanes, eventAnnotationTopMarginPx, EVENT_ANN_LANE_SPACING_PX, formatEventAnnotationHtml } from '../utils/trendEventLayout';
import { APP_FONT_FAMILY } from '../fonts';
import { useTheme } from '../context/ThemeContext';
import {
  AREA_FILL_NAMES,
  BAR_NAMES,
  initialTrendSeriesVisibility,
  orderTrendSeriesForPlot,
  SERIES_STYLE,
  TREND_PRIMARY_NAMES,
  TREND_SERIES_NAMES,
  TREND_SERVICE_ROW,
  type TrendSeriesName,
} from './trendSeriesConfig';

const YEARLY_PLOT_CONFIG: Partial<Config> = {
  responsive: true,
  displaylogo: false,
  locale: 'ko',
  displayModeBar: true,
  modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
  doubleClick: 'reset+autosize',
};

function hexToRgba(hex: string, a: number): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

interface HoverServiceData {
  name: string;
  color: string;
  pcMau: number | null;
  moMau: number | null;
  pcNew: number | null;
  moNew: number | null;
  teacherNew?: number | null;
  hasMau: boolean;
  newOnly?: boolean;
  showMauTooltip: boolean;
  showNewTooltip: boolean;
}

interface HoverState {
  x: string;
  primary: HoverServiceData[];
  secondary: HoverServiceData[];
  left: number;
  top: number;
}

function fmtIntKo(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('ko-KR').format(n);
}

function mauColorForService(svc: string): string {
  if (svc === 'NE Tutor') return SERIES_STYLE['NE Tutor MAU'].color;
  if (svc === '통합회원') return SERIES_STYLE['통합회원'].color;
  const key = `${svc} MAU` as TrendSeriesName;
  return SERIES_STYLE[key]?.color ?? '#94a3b8';
}

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

export function TrendChartYearly(props: {
  yearly: YearlyMetricRow[];
  /** 월간 by-device 원시 행 — 호버 시 PC/MO 분해값 계산용 */
  monthlyByDevice: readonly MonthlyByDeviceRow[];
  rangeStart: string;
  rangeEnd: string;
  showPC: boolean;
  showMobile: boolean;
  logScale: boolean;
  events: EcosystemEvent[];
  services: readonly string[];
}) {
  const { chartTheme } = useTheme();
  const shellRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>(() => initialTrendSeriesVisibility());
  const [isFs, setIsFs] = useState(false);
  const [hover, setHover] = useState<HoverState | null>(null);

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

    const series: { name: TrendSeriesName; y: (number | null)[] }[] = [
      { name: 'NE Tutor MAU', y: mauY('NE Tutor') },
      { name: 'NE Tutor 신규사용자', y: newY('NE Tutor') },
      { name: '통합회원', y: newY('통합회원') },
      ...TREND_SERVICE_ROW.flatMap((s) => [
        { name: `${s.display} MAU` as TrendSeriesName, y: mauY(s.dataService) },
        { name: `${s.display} 신규사용자` as TrendSeriesName, y: newY(s.dataService) },
      ]),
    ];

    return { years, series, markerSize };
  }, [props.yearly, props.rangeStart, props.rangeEnd]);

  /**
   * 연도별 PC/MO 집계 룩업: year -> service -> { pcMau, moMau, pcNew, moNew, teacherNew }.
   * MAU 는 해당 연도 내 월별 PC/MO 최댓값, 신규사용자는 합계.
   */
  const pcMoYearLookup = useMemo(() => {
    const map = new Map<string, Map<string, MonthlyByDeviceRow>>();
    for (const r of props.monthlyByDevice) {
      const yr = r.month.slice(0, 4);
      if (!map.has(yr)) map.set(yr, new Map());
      const svcMap = map.get(yr)!;
      const prev = svcMap.get(r.service);
      if (!prev) {
        svcMap.set(r.service, {
          service: r.service,
          month: yr,
          pcMau: r.pcMau,
          moMau: r.moMau,
          pcNew: r.pcNew,
          moNew: r.moNew,
          teacherNew: r.teacherNew,
        });
      } else {
        if (r.pcMau != null) {
          prev.pcMau = prev.pcMau == null ? r.pcMau : Math.max(prev.pcMau, r.pcMau);
        }
        if (r.moMau != null) {
          prev.moMau = prev.moMau == null ? r.moMau : Math.max(prev.moMau, r.moMau);
        }
        if (r.pcNew == null) prev.pcNew = null;
        else if (prev.pcNew != null) prev.pcNew += r.pcNew;
        if (r.moNew == null) prev.moNew = null;
        else if (prev.moNew != null) prev.moNew += r.moNew;
        if (r.teacherNew == null) prev.teacherNew = null;
        else if (prev.teacherNew != null) prev.teacherNew += r.teacherNew;
      }
    }
    return map;
  }, [props.monthlyByDevice]);

  /** 이벤트 말풍선 레인 수 사전 계산 — top margin 및 차트 div 높이 결정에 사용 */
  const eventLaneMeta = useMemo(() => {
    const { years } = seriesData;
    if (years.length === 0) return { maxLanes: 0 };
    const firstY = years[0];
    const lastY = years[years.length - 1];
    const eventsVisible = props.events.filter((ev) => {
      const yk = ev.anchorDate.slice(0, 4);
      return yk >= firstY && yk <= lastY;
    });
    const meta = assignEventAnnotationLanes(eventsVisible, years, (anchor) =>
      years.indexOf(anchor.slice(0, 4)),
    );
    const maxLanes = meta.length === 0 ? 0 : Math.max(...meta.map((m) => m.lane + 1));
    return { maxLanes };
  }, [seriesData, props.events]);

  /** plot 본문 ~360px 이상 보장하는 동적 높이 */
  const chartHeight = useMemo(() => {
    const topMargin = eventAnnotationTopMarginPx(eventLaneMeta.maxLanes);
    return topMargin + 360 + 56;
  }, [eventLaneMeta.maxLanes]);

  const traces = useMemo((): Data[] => {
    const { years, series, markerSize } = seriesData;
    /**
     * 맨 뒤→앞: NE Tutor MAU → NE Tutor 신규 → 통합회원(막대) → 서비스 선들.
     * 시리즈 인덱스 기반 `zorder`로 bar가 서비스보다 뒤에 오게 합니다.
     */
    const orderedSeries = orderTrendSeriesForPlot(series);
    const out: Data[] = [];

    for (let i = 0; i < orderedSeries.length; i++) {
      const s = orderedSeries[i];
      const on = visible[s.name] !== false;
      const st = SERIES_STYLE[s.name];
      const yRaw = s.y;
      const y = props.logScale
        ? yRaw.map((v) => (v != null && Number.isFinite(v) && v > 0 ? v : null))
        : yRaw.map((v) => (v != null && Number.isFinite(v) ? v : null));

      const zFill = i * 10;
      const zMain = i * 10 + 1;

      if (BAR_NAMES.has(s.name)) {
        out.push({
          type: 'bar',
          name: s.name,
          x: years,
          y,
          visible: on,
          showlegend: false,
          zorder: zMain,
          marker: { color: hexToRgba(st.color, 0.75), line: { color: st.color, width: 1 } },
          hoverinfo: 'none',
        } as Data);
        continue;
      }

      if (AREA_FILL_NAMES.has(s.name)) {
        const fillLine = hexToRgba(st.color, 0.14);
        out.push({
          type: 'scatter',
          mode: 'lines',
          name: `${s.name}__fill`,
          x: years,
          y,
          visible: on,
          showlegend: false,
          connectgaps: false,
          hoverinfo: 'skip',
          zorder: zFill,
          fill: 'tozeroy',
          fillcolor: fillLine,
          line: { shape: 'linear', width: 1, color: fillLine },
        } as Data);
        out.push({
          type: 'scatter',
          mode: 'lines+markers',
          name: s.name,
          x: years,
          y,
          visible: on,
          showlegend: false,
          connectgaps: false,
          zorder: zMain,
          line: {
            shape: 'linear',
            width: 2.4,
            dash: st.dash === 'solid' ? undefined : st.dash,
            color: st.color,
          },
          marker: { size: markerSize, line: { width: 0 }, color: st.color },
          hoverinfo: 'none',
        } as Data);
        continue;
      }

      out.push({
        type: 'scatter',
        mode: 'lines+markers',
        name: s.name,
        x: years,
        y,
        visible: on,
        showlegend: false,
        connectgaps: false,
        zorder: zMain,
        line: {
          shape: 'linear',
          width: 2,
          dash: st.dash === 'solid' ? undefined : st.dash,
          color: st.color,
        },
        marker: { size: markerSize, line: { width: 0 }, color: st.color },
        hoverinfo: 'none',
      } as Data);
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

  const toggleSeries = useCallback((name: string) => {
    setVisible((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      const on = TREND_SERIES_NAMES.filter((n) => next[n] !== false).length;
      if (on === 0) return prev;
      return next;
    });
  }, []);

  /** 연도별 차트에는 월간 LAW 시리즈가 없음 — 범례·전체 토글에서 제외 */
  const secondaryNames = useMemo<TrendSeriesName[]>(
    () =>
      TREND_SERIES_NAMES.filter(
        (n) =>
          !TREND_PRIMARY_NAMES.includes(n) && n !== 'E-Book MAU' && n !== '부가자료(개별) MAU',
      ),
    [],
  );
  const allSecondaryOn = secondaryNames.every((n) => visible[n] !== false);
  const toggleAllSecondary = useCallback(() => {
    setVisible((prev) => {
      const target = !secondaryNames.every((n) => prev[n] !== false);
      const next = { ...prev };
      for (const n of secondaryNames) next[n] = target;
      const on = TREND_SERIES_NAMES.filter((n) => next[n] !== false).length;
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

  useEffect(() => {
    return () => {
      const el = plotRef.current;
      if (el) {
        try {
          Plotly.purge(el);
        } catch {
          /* 언마운트 시 Plotly 정리 */
        }
      }
    };
  }, []);

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

    const eventLineColor = chartTheme.eventLine;
    const shapes: Partial<Shape>[] = eventsVisible.map((ev) => ({
      type: 'line',
      xref: 'x',
      yref: 'paper',
      x0: yearKeyFromAnchor(ev.anchorDate),
      x1: yearKeyFromAnchor(ev.anchorDate),
      y0: 0,
      y1: 1,
      line: { color: eventLineColor, width: 2.25, dash: 'dot' },
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
    const annotations = annMeta.map(({ ev, lane, xshift }) => {
      return {
        x: yearKeyFromAnchor(ev.anchorDate),
        xref: 'x' as const,
        xshift,
        y: 1,
        yref: 'paper' as const,
        yshift: lane * EVENT_ANN_LANE_SPACING_PX + 2,
        text: formatEventAnnotationHtml(ev),
        showarrow: false,
        arrowhead: 0,
        arrowwidth: 0,
        ax: 0,
        ay: 0,
        xanchor: 'center' as const,
        yanchor: 'bottom' as const,
        bgcolor: 'rgba(0,0,0,0)',
        borderwidth: 0,
        borderpad: 2,
        font: { family: APP_FONT_FAMILY, size: 10, color: chartTheme.bubbleFont },
        align: 'center' as const,
      };
    });

    const maxLanes = annMeta.length === 0 ? 0 : Math.max(...annMeta.map((a) => a.lane + 1));
    const topMargin = eventAnnotationTopMarginPx(maxLanes);

    const yaxis: Partial<Layout['yaxis']> = {
      autorange: true,
      type: props.logScale ? 'log' : 'linear',
      gridcolor: chartTheme.grid,
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
      uirevision: 'yearly-mau-trend',
      paper_bgcolor: chartTheme.paper,
      plot_bgcolor: chartTheme.plot,
      font: { color: chartTheme.font, family: APP_FONT_FAMILY, size: 11 },
      margin: { t: topMargin, r: 24, b: 56, l: 76 },
      showlegend: false,
      xaxis: {
        type: 'category',
        categoryorder: 'array',
        categoryarray: years,
        gridcolor: chartTheme.grid,
        tickangle: 0,
        title: { text: '연도', font: { color: chartTheme.font } },
        tickmode: 'array',
        tickvals,
        ticktext,
      },
      yaxis,
      shapes,
      annotations,
      hovermode: 'closest',
      bargap: 0.25,
    };

    let cancelled = false;
    const plotDiv = el as unknown as { data?: Data[] };
    const redrawPromise =
      plotDiv.data != null && Array.isArray(plotDiv.data) && plotDiv.data.length > 0
        ? Plotly.react(el, traces, layout, YEARLY_PLOT_CONFIG)
        : Plotly.newPlot(el, traces, layout, YEARLY_PLOT_CONFIG);

    const handleHover = (data: Readonly<{ points: { x: string }[]; event: MouseEvent }>) => {
      const point = data.points?.[0];
      if (!point) return;
      const xv = String(point.x);
      const yearMap = pcMoYearLookup.get(xv);
      if (!yearMap) return;

      const isOn = (name: TrendSeriesName) => visible[name] !== false;

      const makeNeTutorBlock = (): HoverServiceData | null => {
        const r = yearMap.get('NE Tutor');
        if (!r) return null;
        const showMau = isOn('NE Tutor MAU');
        const showNew = isOn('NE Tutor 신규사용자');
        if (!showMau && !showNew) return null;
        return {
          name: 'NE Tutor',
          color: mauColorForService('NE Tutor'),
          pcMau: r.pcMau,
          moMau: r.moMau,
          pcNew: r.pcNew,
          moNew: r.moNew,
          hasMau: true,
          newOnly: false,
          showMauTooltip: showMau,
          showNewTooltip: showNew,
        };
      };

      const makeMemberBlock = (): HoverServiceData | null => {
        const r = yearMap.get('통합회원');
        if (!r || !isOn('통합회원')) return null;
        return {
          name: '통합회원',
          color: mauColorForService('통합회원'),
          pcMau: r.pcMau,
          moMau: r.moMau,
          pcNew: r.pcNew,
          moNew: r.moNew,
          teacherNew: r.teacherNew,
          hasMau: false,
          newOnly: true,
          showMauTooltip: false,
          showNewTooltip: true,
        };
      };

      const makeSecondaryBlock = (svc: string, display: string): HoverServiceData | null => {
        const r = yearMap.get(svc);
        if (!r) return null;
        const mauName = `${display} MAU` as TrendSeriesName;
        const newName = `${display} 신규사용자` as TrendSeriesName;
        const showMau = isOn(mauName);
        const showNew = isOn(newName);
        if (!showMau && !showNew) return null;
        return {
          name: svc,
          color: mauColorForService(svc),
          pcMau: r.pcMau,
          moMau: r.moMau,
          pcNew: r.pcNew,
          moNew: r.moNew,
          hasMau: true,
          newOnly: false,
          showMauTooltip: showMau,
          showNewTooltip: showNew,
        };
      };

      const primary: HoverServiceData[] = [];
      const neBlock = makeNeTutorBlock();
      if (neBlock) primary.push(neBlock);
      const memberBlock = makeMemberBlock();
      if (memberBlock) primary.push(memberBlock);

      const secondary = TREND_SERVICE_ROW.map((s) => makeSecondaryBlock(s.dataService, s.display)).filter(
        (b): b is HoverServiceData => b != null,
      );

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

    void Promise.resolve(redrawPromise).then(() => {
      if (cancelled) return;
      const pe = el as unknown as {
        on: (ev: string, cb: (d: never) => void) => void;
        removeAllListeners?: (ev: string) => void;
      };
      pe.on('plotly_hover', handleHover as unknown as (d: never) => void);
      pe.on('plotly_unhover', handleUnhover as unknown as (d: never) => void);
    });

    return () => {
      cancelled = true;
      const pe = el as unknown as { removeAllListeners?: (ev: string) => void };
      pe.removeAllListeners?.('plotly_hover');
      pe.removeAllListeners?.('plotly_unhover');
    };
  }, [traces, props.logScale, props.events, seriesData, yMax, yMin, visible, pcMoYearLookup, props.showPC, props.showMobile, chartTheme]);

  void props.services;

  const renderSwatchToggle = useCallback(
    (name: TrendSeriesName) => {
      const st = SERIES_STYLE[name];
      const on = visible[name] !== false;
      return (
        <label
          className={`trend-trace-toggle trend-trace-toggle--compact${on ? '' : ' trend-trace-toggle-off'}`}
          title={name}
        >
          <input type="checkbox" checked={on} onChange={() => toggleSeries(name)} />
          <span className="trend-swatch" style={{ background: st.color, opacity: on ? 1 : 0.35 }} />
        </label>
      );
    },
    [visible, toggleSeries],
  );

  return (
    <div ref={shellRef} className="trend-chart-shell chart-box">
      <div className="trend-chart-main-row">
        <aside className="trend-chart-filters-col" aria-label="표시할 시리즈 선택">
          <div className="trend-chart-toolbar trend-chart-toolbar--beside-chart">
            <div className="trend-series-toggles trend-series-toggles--split trend-series-toggles--sidebar">
              <div className="trend-toolbar-left">
                <div className="trend-toggle-group trend-toggle-group--primary trend-toggle-group--stacked">
                  {TREND_PRIMARY_NAMES.map((name) => {
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
                <label className="trend-trace-toggle trend-trace-toggle--all">
                  <input type="checkbox" checked={allSecondaryOn} onChange={toggleAllSecondary} />
                  <span>전체</span>
                </label>
              </div>
              <div className="trend-toolbar-matrix" role="group" aria-label="서비스별 지표 MAU·신규사용자">
                <div className="trend-service-matrix-row trend-service-matrix-row--head">
                  <span className="trend-service-matrix-cell trend-service-matrix-cell--corner" />
                  <span className="trend-service-matrix-cell trend-service-matrix-cell--h">MAU</span>
                  <span className="trend-service-matrix-cell trend-service-matrix-cell--h">신규</span>
                </div>
                {TREND_SERVICE_ROW.map((s) => (
                  <div key={s.dataService} className="trend-service-matrix-row">
                    <span className="trend-service-matrix-cell trend-service-matrix-cell--label">{s.display}</span>
                    <div className="trend-service-matrix-cell trend-service-matrix-cell--toggle">
                      {renderSwatchToggle(`${s.display} MAU` as TrendSeriesName)}
                    </div>
                    <div className="trend-service-matrix-cell trend-service-matrix-cell--toggle">
                      {renderSwatchToggle(`${s.display} 신규사용자` as TrendSeriesName)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
        <div className="trend-chart-plot-col">
          <div className="trend-chart-plot-head">
            <button
              type="button"
              className="btn trend-fs-btn"
              onClick={toggleFullscreen}
              title="Plotly 툴바의 확대 아이콘은 축 자동 맞춤입니다. 여기서 차트 영역 전체화면을 켜고 끕니다."
            >
              {isFs ? '전체 화면 종료' : '전체 화면'}
            </button>
          </div>
          <div ref={plotRef} className="trend-chart-plot-inner" style={{ width: '100%', height: chartHeight }} />
        </div>
      </div>
      {hover && (hover.primary.length > 0 || hover.secondary.length > 0) && (
        <YearlyHoverCard
          hover={hover}
          containerEl={shellRef.current}
          showPC={props.showPC}
          showMobile={props.showMobile}
        />
      )}
    </div>
  );
}

function YearlyHoverCard({
  hover,
  containerEl,
  showPC,
  showMobile,
}: {
  hover: HoverState;
  containerEl: HTMLDivElement | null;
  showPC: boolean;
  showMobile: boolean;
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
      <div className="trend-hover-title">{hover.x}년</div>
      {hover.primary.length > 0 && (
        <div className="trend-hover-section trend-hover-section--primary">
          {hover.primary.map((s) => (
            <YearlyHoverBlock key={s.name} block={s} showPC={showPC} showMobile={showMobile} />
          ))}
        </div>
      )}
      {hover.primary.length > 0 && hover.secondary.length > 0 && (
        <div className="trend-hover-divider" />
      )}
      {hover.secondary.length > 0 && (
        <div className="trend-hover-section trend-hover-section--secondary">
          {hover.secondary.map((s) => (
            <YearlyHoverBlock key={s.name} block={s} showPC={showPC} showMobile={showMobile} />
          ))}
        </div>
      )}
    </div>
  );
}

function YearlyHoverBlock({
  block,
  showPC,
  showMobile,
}: {
  block: HoverServiceData;
  showPC: boolean;
  showMobile: boolean;
}) {
  const both = showPC && showMobile;
  const teacher = block.teacherNew;
  const showTeacherExtra = block.newOnly && teacher != null && teacher > 0;

  const mauLine = () => {
    if (!block.hasMau) return null;
    if (both) {
      return (
        <span>
          PC {fmtIntKo(block.pcMau)}명, MO {fmtIntKo(block.moMau)}명
        </span>
      );
    }
    if (showPC) return <span>PC {fmtIntKo(block.pcMau)}명</span>;
    return <span>MO {fmtIntKo(block.moMau)}명</span>;
  };

  const newLine = () => {
    if (both) {
      const extra =
        showTeacherExtra ? (
          <span>
            {' '}
            · 교강사 {fmtIntKo(teacher)}명
          </span>
        ) : null;
      return (
        <span>
          PC {fmtIntKo(block.pcNew)}명, MO {fmtIntKo(block.moNew)}명
          {extra}
        </span>
      );
    }
    if (showPC) return <span>PC {fmtIntKo(block.pcNew)}명</span>;
    return <span>MO {fmtIntKo(block.moNew)}명</span>;
  };

  return (
    <div className="trend-hover-block">
      <div className="trend-hover-block-name">
        <span className="trend-hover-swatch" style={{ background: block.color }} />
        <span>{block.name}</span>
      </div>
      {block.hasMau && block.showMauTooltip && (
        <div className="trend-hover-row">
          <span className="trend-hover-label">MAU</span>
          <span className="trend-hover-value">{mauLine()}</span>
        </div>
      )}
      {block.showNewTooltip && (
        <div className="trend-hover-row">
          <span className="trend-hover-label">{block.newOnly ? '신규가입' : '신규사용자'}</span>
          <span className="trend-hover-value">{newLine()}</span>
        </div>
      )}
    </div>
  );
}
