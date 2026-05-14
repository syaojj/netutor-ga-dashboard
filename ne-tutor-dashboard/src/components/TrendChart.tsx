import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { Config, Data, Layout, Shape } from 'plotly.js';
import type { EbookMonthlyRow, EcosystemEvent, MonthlyByDeviceRow, MonthlyMetricRow } from '../types';
import { assignEventAnnotationLanes, formatEventAnnotationHtml } from '../utils/trendEventLayout';
import { APP_FONT_FAMILY } from '../fonts';
import { useTheme } from '../context/ThemeContext';
import {
  AREA_FILL_NAMES,
  BAR_NAMES,
  initialTrendSeriesVisibility,
  orderTrendSeriesForPlot,
  SERIES_STYLE,
  TREND_LAW_MAU_SERIES,
  TREND_NEW_TOGGLE_DISABLED,
  TREND_PRIMARY_NAMES,
  TREND_SERIES_NAMES,
  TREND_SERVICE_ROW,
  type TrendSeriesName,
} from './trendSeriesConfig';

/** 모드바 Autoscale·홈 복원 — purge 없이 react 할 때 축 UI 유지 */
const TREND_PLOT_CONFIG: Partial<Config> = {
  responsive: true,
  displaylogo: false,
  locale: 'ko',
  displayModeBar: false,
  doubleClick: 'reset+autosize',
};

/** 차트 색상을 영역 채움(반투명)·바 채움 등에 활용하기 위한 보조 함수 */
function hexToRgba(hex: string, a: number): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** 호버 시 표시할 서비스별 PC/MO 분해값 */
interface HoverServiceData {
  /** 표시명 (NE Tutor, NELT, 문법문제 …) */
  name: string;
  /** 라운드 swatch 색상 — MAU 시리즈 색을 사용 */
  color: string;
  pcMau: number | null;
  moMau: number | null;
  pcNew: number | null;
  moNew: number | null;
  /** 통합회원 시트 교강사 신규 (PC+Mobile 동시 선택 시 합산에 포함) */
  teacherNew?: number | null;
  /** 통합회원 등 MAU 가 없는 시트인지 여부 */
  hasMau: boolean;
  /** 통합회원 등 신규사용자만 표기되는지 (라벨용) */
  newOnly?: boolean;
  /** 범례 체크된 MAU 시리즈만 툴팁 MAU 행 표시 */
  showMauTooltip: boolean;
  /** 범례 체크된 신규(또는 통합회원) 시리즈만 툴팁 신규 행 표시 */
  showNewTooltip: boolean;
  /** PC/MO 분해 없는 월간 LAW 단일 MAU(E-Book·부가자료) */
  aggregateMau?: number | null;
}

interface HoverState {
  x: string;
  /** 상단 강조 블록 (NE Tutor, 통합회원) */
  primary: HoverServiceData[];
  /** 하단 2-컬럼 블록 (다른 서비스들) */
  secondary: HoverServiceData[];
  /** 셸 기준 좌표 */
  left: number;
  top: number;
}

function fmtIntKo(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('ko-KR').format(n);
}

/** 시리즈명 → MAU(실선) 색상 */
function mauColorForService(svc: string): string {
  if (svc === 'NE Tutor') return SERIES_STYLE['NE Tutor MAU'].color;
  if (svc === '통합회원') return SERIES_STYLE['통합회원'].color;
  const key = `${svc} MAU` as TrendSeriesName;
  return SERIES_STYLE[key]?.color ?? '#94a3b8';
}

function monthKeyFromAnchor(iso: string): string {
  return iso.slice(0, 7);
}

function monthKeyFromRangeDate(iso: string): string {
  return iso.slice(0, 7);
}

function monthsInRange(rangeStart: string, rangeEnd: string): string[] {
  const start = monthKeyFromRangeDate(rangeStart);
  const end = monthKeyFromRangeDate(rangeEnd);
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
  if (out.length === 0) {
    out.push(start);
  }
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

export function TrendChart(props: {
  monthly: MonthlyMetricRow[];
  /** 월별 PC/MO 원시 행 — 호버 툴팁의 PC/MO 분해값 표시에 사용 */
  monthlyByDevice: readonly MonthlyByDeviceRow[];
  /** 월간 xlsx E-Book·부가자료 LAW 행 — E-Book MAU·부가자료(개별) MAU 시리즈 */
  ebookMonthly: readonly EbookMonthlyRow[];
  rangeStart: string;
  rangeEnd: string;
  /** 검색 영역 PC/Mobile 선택 — 툴팁에 표시할 항목만 반영 */
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
    const months = monthsInRange(props.rangeStart, props.rangeEnd);
    const by = new Map<string, Map<string, MonthlyMetricRow>>();
    for (const r of props.monthly) {
      if (!by.has(r.service)) by.set(r.service, new Map());
      by.get(r.service)!.set(r.month, r);
    }

    const nMonths = months.length;
    const markerSize = nMonths <= 1 ? 12 : nMonths <= 3 ? 8 : 5;
    const mauY = (svc: string) => months.map((mo) => by.get(svc)?.get(mo)?.mauEstimate ?? null);
    const newY = (svc: string) => months.map((mo) => by.get(svc)?.get(mo)?.newUsersSum ?? null);

    const ebookByMonth = new Map(props.ebookMonthly.map((r) => [r.monthKey, r]));
    const ebookMauY = () =>
      months.map((mo) => ebookByMonth.get(mo)?.lawEbookUniqueUsers ?? null);
    const supIndMauY = () =>
      months.map((mo) => ebookByMonth.get(mo)?.lawSupplementaryIndividualDownloads ?? null);

    const series: { name: TrendSeriesName; y: (number | null)[] }[] = [
      { name: 'NE Tutor MAU', y: mauY('NE Tutor') },
      { name: 'NE Tutor 신규사용자', y: newY('NE Tutor') },
      { name: '통합회원', y: newY('통합회원') },
      ...TREND_SERVICE_ROW.flatMap((s) => [
        { name: `${s.display} MAU` as TrendSeriesName, y: mauY(s.dataService) },
        { name: `${s.display} 신규사용자` as TrendSeriesName, y: newY(s.dataService) },
      ]),
      { name: 'E-Book MAU', y: ebookMauY() },
      { name: '부가자료(개별) MAU', y: supIndMauY() },
    ];

    return { months, series, markerSize };
  }, [props.monthly, props.ebookMonthly, props.rangeStart, props.rangeEnd]);

  /**
   * 이벤트 말풍선의 레인 수 사전 계산. layout 의 top margin 과 차트 div 높이를 모두 결정한다.
   * 픽셀 단위 yshift 를 사용하므로 plot 영역 크기를 항상 일정하게 유지하기 위해 동적으로 보정한다.
   */
  const eventLaneMeta = useMemo(() => {
    const { months } = seriesData;
    if (months.length === 0) return { maxLanes: 0 };
    const firstM = months[0];
    const lastM = months[months.length - 1];
    const eventsVisible = props.events.filter((ev) => {
      const mk = monthKeyFromAnchor(ev.anchorDate);
      return mk >= firstM && mk <= lastM;
    });
    const meta = assignEventAnnotationLanes(eventsVisible, months, (anchor) =>
      months.indexOf(monthKeyFromAnchor(anchor)),
    );
    const maxLanes = meta.length === 0 ? 0 : Math.max(...meta.map((m) => m.lane + 1));
    return { maxLanes };
  }, [seriesData, props.events]);

  /**
   * 차트 div 픽셀 높이. plot 본문이 항상 ~360px 이상 보장되도록
   * (이벤트 레인 영역 + 본문 + 하단 축) 합으로 계산.
   */
  const chartHeight = useMemo(() => {
    const BUBBLE_LANE_SPACING_PX = 46;
    const BUBBLE_HEIGHT_PX = 38;
    const topMargin = Math.max(
      52,
      eventLaneMeta.maxLanes * BUBBLE_LANE_SPACING_PX + BUBBLE_HEIGHT_PX + 8,
    );
    const PLOT_BODY_PX = 360;
    const BOTTOM_MARGIN_PX = 56;
    return topMargin + PLOT_BODY_PX + BOTTOM_MARGIN_PX;
  }, [eventLaneMeta.maxLanes]);

  /**
   * 호버 시 PC/MO 분해값 조회용 인덱스: month -> service -> { pcMau, moMau, pcNew, moNew, teacherNew }
   * 월간 by-device 원시 행을 한 번만 펴서 저장. 호버 시 O(1) 조회.
   */
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
    /**
     * 맨 뒤→앞: NE Tutor MAU → NE Tutor 신규 → 통합회원(막대) → 서비스 선들.
     * `orderTrendSeriesForPlot` 순서로 trace를 쌓고, 시리즈 인덱스마다 `zorder`를 한 칸씩 올려 bar가 서비스보다 뒤에 오게 합니다.
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

      // 통합회원: 막대그래프
      if (BAR_NAMES.has(s.name)) {
        out.push({
          type: 'bar',
          name: s.name,
          x: months,
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
          x: months,
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
          x: months,
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
        x: months,
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
    if (TREND_NEW_TOGGLE_DISABLED.has(name as TrendSeriesName)) return;
    setVisible((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      const on = TREND_SERIES_NAMES.filter((n) => next[n] !== false).length;
      if (on === 0) return prev;
      return next;
    });
  }, []);

  const secondaryNames = useMemo<TrendSeriesName[]>(
    () => TREND_SERIES_NAMES.filter((n) => !TREND_PRIMARY_NAMES.includes(n)),
    [],
  );
  const secondaryToggleable = useMemo(
    () => secondaryNames.filter((n) => !TREND_NEW_TOGGLE_DISABLED.has(n)),
    [secondaryNames],
  );
  const allSecondaryOn =
    secondaryToggleable.length > 0 && secondaryToggleable.every((n) => visible[n] !== false);
  const toggleAllSecondary = useCallback(() => {
    setVisible((prev) => {
      const target = !secondaryToggleable.every((n) => prev[n] !== false);
      const next = { ...prev };
      for (const n of secondaryNames) {
        if (TREND_NEW_TOGGLE_DISABLED.has(n)) {
          next[n] = false;
          continue;
        }
        next[n] = target;
      }
      const on = TREND_SERIES_NAMES.filter((n) => next[n] !== false).length;
      if (on === 0) return prev;
      return next;
    });
  }, [secondaryNames, secondaryToggleable]);

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

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;

    const { months } = seriesData;
    const firstM = months[0];
    const lastM = months[months.length - 1];
    const eventsVisible = props.events.filter((ev) => {
      const mk = monthKeyFromAnchor(ev.anchorDate);
      return mk >= firstM && mk <= lastM;
    });

    const eventLineColor = chartTheme.eventLine;
    const shapes: Partial<Shape>[] = eventsVisible.map((ev) => ({
      type: 'line',
      xref: 'x',
      yref: 'paper',
      x0: monthKeyFromAnchor(ev.anchorDate),
      x1: monthKeyFromAnchor(ev.anchorDate),
      y0: 0,
      y1: 1,
      line: { color: eventLineColor, width: 2.25, dash: 'dot' },
    }));

    const xTickStep = Math.max(1, Math.ceil(months.length / 14));
    const tickvals = months.filter((_, i) => i % xTickStep === 0);
    const ticktext = tickvals.map(formatMonthTick);

    const logY =
      props.logScale && yMax > 0
        ? buildLogYAxisTicks(yMin, yMax)
        : { tickvals: [] as number[], ticktext: [] as string[] };
    const linearY = !props.logScale ? buildLinearYAxisTicks(yMin, yMax) : {};

    const annMeta = assignEventAnnotationLanes(eventsVisible, months, (anchor) =>
      months.indexOf(monthKeyFromAnchor(anchor)),
    );
    /**
     * 말풍선 레이아웃을 픽셀 좌표(yshift) 기반으로 전환.
     * paper 좌표(yStep)는 차트 plot 높이에 비례해 변동하므로 레인이 많아질수록
     * top margin 이 plot 영역을 잠식하는 문제가 있었음. 픽셀 단위 yshift 는 plot 높이와
     * 무관하므로 차트 본문이 일정하게 보장된다.
     */
    const BUBBLE_LANE_SPACING_PX = 46;
    const BUBBLE_HEIGHT_PX = 38;
    const annotations = annMeta.map(({ ev, lane, xshift }) => {
      return {
        x: monthKeyFromAnchor(ev.anchorDate),
        xref: 'x' as const,
        xshift,
        y: 1,
        yref: 'paper' as const,
        yshift: lane * BUBBLE_LANE_SPACING_PX + 4,
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
    /** 픽셀 단위 top margin = 가장 위 레인의 라벨 상단 + 약간의 여유 */
    const topMargin = Math.max(52, maxLanes * BUBBLE_LANE_SPACING_PX + BUBBLE_HEIGHT_PX + 8);

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
      uirevision: 'monthly-mau-trend',
      paper_bgcolor: chartTheme.paper,
      plot_bgcolor: chartTheme.plot,
      font: { color: chartTheme.font, family: APP_FONT_FAMILY, size: 11 },
      margin: { t: topMargin, r: 24, b: 56, l: 76 },
      showlegend: false,
      xaxis: {
        type: 'category',
        categoryorder: 'array',
        categoryarray: months,
        gridcolor: chartTheme.grid,
        tickangle: -35,
        title: { text: '월', font: { color: chartTheme.font } },
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
        ? Plotly.react(el, traces, layout, TREND_PLOT_CONFIG)
        : Plotly.newPlot(el, traces, layout, TREND_PLOT_CONFIG);

    /**
     * 커스텀 HTML 툴팁: 호버한 월(x) 기준으로 PC/MO 분해값을 직접 조회해서 표시.
     * - 상단: NE Tutor (MAU/신규사용자) + 통합회원 (신규가입만)
     * - 하단(2-컬럼): NELT/문법문제/문법예문/어휘출제/클래스카드 (각 MAU/신규사용자)
     */
    const handleHover = (data: Readonly<{ points: { x: string }[]; event: MouseEvent }>) => {
      const point = data.points?.[0];
      if (!point) return;
      const xv = String(point.x);
      const monthMap = pcMoLookup.get(xv);

      const isOn = (name: TrendSeriesName) => visible[name] !== false;

      const makeNeTutorBlock = (): HoverServiceData | null => {
        if (!monthMap) return null;
        const r = monthMap.get('NE Tutor');
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
          teacherNew: undefined,
          hasMau: true,
          newOnly: false,
          showMauTooltip: showMau,
          showNewTooltip: showNew,
        };
      };

      const makeMemberBlock = (): HoverServiceData | null => {
        if (!monthMap) return null;
        const r = monthMap.get('통합회원');
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
        if (!monthMap) return null;
        const r = monthMap.get(svc);
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
          teacherNew: undefined,
          hasMau: true,
          newOnly: false,
          showMauTooltip: showMau,
          showNewTooltip: showNew,
        };
      };

      const primary: HoverServiceData[] = [];
      const neTutorBlock = makeNeTutorBlock();
      if (neTutorBlock) primary.push(neTutorBlock);
      const memberBlock = makeMemberBlock();
      if (memberBlock) primary.push(memberBlock);

      const secondaryBase = TREND_SERVICE_ROW.map((s) => makeSecondaryBlock(s.dataService, s.display)).filter(
        (b): b is HoverServiceData => b != null,
      );

      const ebookByMonth = new Map(props.ebookMonthly.map((r) => [r.monthKey, r]));
      const lawRow = ebookByMonth.get(xv);
      const lawBlocks: HoverServiceData[] = [];
      if (lawRow && isOn('E-Book MAU') && lawRow.lawEbookUniqueUsers != null) {
        lawBlocks.push({
          name: 'E-Book MAU',
          color: SERIES_STYLE['E-Book MAU'].color,
          pcMau: null,
          moMau: null,
          pcNew: null,
          moNew: null,
          hasMau: true,
          newOnly: false,
          showMauTooltip: true,
          showNewTooltip: false,
          aggregateMau: lawRow.lawEbookUniqueUsers,
        });
      }
      if (lawRow && isOn('부가자료(개별) MAU') && lawRow.lawSupplementaryIndividualDownloads != null) {
        lawBlocks.push({
          name: '부가자료(개별) MAU',
          color: SERIES_STYLE['부가자료(개별) MAU'].color,
          pcMau: null,
          moMau: null,
          pcNew: null,
          moNew: null,
          hasMau: true,
          newOnly: false,
          showMauTooltip: true,
          showNewTooltip: false,
          aggregateMau: lawRow.lawSupplementaryIndividualDownloads,
        });
      }

      const secondary = [...secondaryBase, ...lawBlocks];

      if (primary.length === 0 && secondary.length === 0) return;

      const shell = shellRef.current;
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      const mx = data.event.clientX - rect.left;
      const my = data.event.clientY - rect.top;
      setHover({ x: xv, primary, secondary, left: mx, top: my });
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
  }, [
    traces,
    props.logScale,
    props.events,
    seriesData,
    yMax,
    yMin,
    visible,
    pcMoLookup,
    props.showPC,
    props.showMobile,
    chartTheme,
    props.ebookMonthly,
  ]);

  void props.services;

  const renderVisibilityPill = useCallback(
    (name: TrendSeriesName, mode: 'mau' | 'new', label: string) => {
      const st = SERIES_STYLE[name];
      const on = visible[name] !== false;
      const disabled = TREND_NEW_TOGGLE_DISABLED.has(name);
      const cssVars = { '--mau-trend-pill': st.color } as CSSProperties;
      return (
        <button
          type="button"
          className={`mau-trend-pill mau-trend-pill--${mode}${on && !disabled ? ' mau-trend-pill--on' : ' mau-trend-pill--off'}`}
          style={cssVars}
          title={name}
          aria-pressed={on && !disabled}
          disabled={disabled}
          onClick={() => toggleSeries(name)}
        >
          <span className="mau-trend-pill__dot" aria-hidden />
          {label}
        </button>
      );
    },
    [visible, toggleSeries],
  );

  return (
    <div ref={shellRef} className="trend-chart-shell trend-chart-shell--flat">
      <div className="trend-chart-main-row">
        <aside className="trend-chart-filters-col" aria-label="월별 MAU·신규사용자 추이 표시 선택">
          <div className="mau-trend-query-card">
            <h3 className="mau-trend-query-card__title">월별 MAU·신규사용자 추이</h3>

            <p className="mau-trend-query-card__section-caption">기준 지표</p>
            <div className="mau-trend-query-row">
              <span className="mau-trend-query-row__name">NE Tutor</span>
              <div className="mau-trend-query-row__pills">
                {renderVisibilityPill('NE Tutor MAU', 'mau', 'MAU')}
                {renderVisibilityPill('NE Tutor 신규사용자', 'new', '신규')}
              </div>
            </div>
            <div className="mau-trend-query-row">
              <span className="mau-trend-query-row__name">통합회원</span>
              <div className="mau-trend-query-row__pills">{renderVisibilityPill('통합회원', 'new', '신규가입')}</div>
            </div>

            <div className="mau-trend-query-card__divider" role="separator" />

            <div className="mau-trend-query-card__service-head">
              <span className="mau-trend-query-card__section-caption mau-trend-query-card__section-caption--row">
                서비스별 지표
              </span>
              <button
                type="button"
                className={`mau-trend-select-all-btn${allSecondaryOn ? ' mau-trend-select-all-btn--active' : ''}`}
                onClick={toggleAllSecondary}
                aria-pressed={allSecondaryOn}
              >
                <span className="mau-trend-select-all-btn__icon" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M5 12.5l3.5 3.5L19 6"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M5 18.5l3.5 3.5L19 12"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.4"
                    />
                  </svg>
                </span>
                전체 선택
              </button>
            </div>

            <div className="mau-trend-matrix" role="group" aria-label="서비스별 지표 MAU·신규사용자">
              <div className="mau-trend-matrix__head">
                <span className="mau-trend-matrix__corner" />
                <span>MAU</span>
                <span>신규사용자</span>
              </div>
              {TREND_SERVICE_ROW.map((s) => {
                const mauName = `${s.display} MAU` as TrendSeriesName;
                const newName = `${s.display} 신규사용자` as TrendSeriesName;
                return (
                  <div key={s.dataService} className="mau-trend-matrix__row">
                    <span className="mau-trend-matrix__svc">{s.display}</span>
                    <div className="mau-trend-matrix__cell">{renderVisibilityPill(mauName, 'mau', 'MAU')}</div>
                    <div className="mau-trend-matrix__cell">{renderVisibilityPill(newName, 'new', '신규')}</div>
                  </div>
                );
              })}
              {TREND_LAW_MAU_SERIES.map((lawName) => {
                const shortLabel = lawName === 'E-Book MAU' ? 'E-Book' : '부가자료';
                return (
                  <div key={lawName} className="mau-trend-matrix__row">
                    <span className="mau-trend-matrix__svc">{shortLabel}</span>
                    <div className="mau-trend-matrix__cell">{renderVisibilityPill(lawName, 'mau', 'MAU')}</div>
                    <span className="mau-trend-matrix__dash" aria-hidden>
                      —
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mau-trend-chart-fs-wrap">
            <button
              type="button"
              className="btn trend-fs-btn trend-fs-btn--below-filters"
              onClick={toggleFullscreen}
              title="차트 영역(그래프·범례 포함)을 전체 화면으로 켜고 끕니다."
            >
              {isFs ? '전체 화면 종료' : '전체 화면'}
            </button>
          </div>
        </aside>
        <div className="trend-chart-plot-col">
          <div ref={plotRef} className="trend-chart-plot-inner" style={{ width: '100%', height: chartHeight }} />
        </div>
      </div>
      {hover && (hover.primary.length > 0 || hover.secondary.length > 0) && (
        <HoverCard
          hover={hover}
          containerEl={shellRef.current}
          showPC={props.showPC}
          showMobile={props.showMobile}
        />
      )}
    </div>
  );
}

/**
 * 차트 위에 떠 있는 커스텀 HTML 툴팁.
 * - 상단(primary): NE Tutor + 통합회원 — 강조 표시, 2-컬럼
 * - 하단(secondary): 나머지 서비스 — 2-컬럼 그리드
 * - 각 블록은 라운드 컬러 swatch + 서비스명 + (MAU / 신규사용자) PC·MO 분해값
 */
function HoverCard({
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
      <div className="trend-hover-title">{hover.x}</div>

      {hover.primary.length > 0 && (
        <div className="trend-hover-section trend-hover-section--primary">
          {hover.primary.map((s) => (
            <HoverBlock key={s.name} block={s} showPC={showPC} showMobile={showMobile} />
          ))}
        </div>
      )}

      {hover.primary.length > 0 && hover.secondary.length > 0 && (
        <div className="trend-hover-divider" />
      )}

      {hover.secondary.length > 0 && (
        <div className="trend-hover-section trend-hover-section--secondary">
          {hover.secondary.map((s) => (
            <HoverBlock key={s.name} block={s} showPC={showPC} showMobile={showMobile} />
          ))}
        </div>
      )}
    </div>
  );
}

function HoverBlock({
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
  const showTeacherExtra =
    block.newOnly && teacher != null && teacher > 0;

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
    const label = block.newOnly ? '신규가입' : '신규사용자';
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
      {block.showMauTooltip && block.aggregateMau != null && (
        <div className="trend-hover-row">
          <span className="trend-hover-label">MAU</span>
          <span className="trend-hover-value">{fmtIntKo(block.aggregateMau)}명</span>
        </div>
      )}
      {block.hasMau && block.showMauTooltip && block.aggregateMau == null && (
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
