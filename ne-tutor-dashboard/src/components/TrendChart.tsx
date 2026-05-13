import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { Data, Layout, Shape } from 'plotly.js';
import type { EcosystemEvent, MonthlyByDeviceRow, MonthlyMetricRow } from '../types';
import { assignEventAnnotationLanes, splitEventNameToTwoLines } from '../utils/trendEventLayout';
import { APP_FONT_FAMILY } from '../fonts';

/** 차트 색상을 영역 채움(반투명)·바 채움 등에 활용하기 위한 보조 함수 */
function hexToRgba(hex: string, a: number): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** 영역 채움(NE Tutor) 대상 시리즈 */
const AREA_FILL_NAMES = new Set<string>(['NE Tutor MAU', 'NE Tutor 신규사용자']);
/** 막대 그래프로 렌더링할 시리즈 */
const BAR_NAMES = new Set<string>(['통합회원']);

/** 호버 시 표시할 서비스별 PC/MO 분해값 */
interface HoverServiceData {
  /** 표시명 (NE Tutor, NELT, 문법문제 …) */
  name: string;
  /** 라운드 swatch 색상 — MAU 시리즈 색을 사용 */
  color: string;
  pcMau: number;
  moMau: number;
  pcNew: number;
  moNew: number;
  /** 통합회원 시트 교강사 신규 (PC+Mobile 동시 선택 시 합산에 포함) */
  teacherNew?: number;
  /** 통합회원 등 MAU 가 없는 시트인지 여부 */
  hasMau: boolean;
  /** 통합회원 등 신규사용자만 표기되는지 (라벨용) */
  newOnly?: boolean;
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

function fmtIntKo(n: number): string {
  return new Intl.NumberFormat('ko-KR').format(n);
}

/** 시리즈명 → MAU(실선) 색상 */
function mauColorForService(svc: string): string {
  if (svc === 'NE Tutor') return SERIES_STYLE['NE Tutor MAU'].color;
  if (svc === '통합회원') return SERIES_STYLE['통합회원'].color;
  const key = `${svc} MAU` as TrendSeriesName;
  return SERIES_STYLE[key]?.color ?? '#94a3b8';
}

/** 시리즈명·범례 토글에 동일하게 사용 (※ 표시용 라벨 = 시리즈명) */
export const TREND_SERIES_NAMES = [
  'NE Tutor MAU',
  'NE Tutor 신규사용자',
  '통합회원',
  'NELT MAU',
  'NELT 신규사용자',
  '문법문제 MAU',
  '문법문제 신규사용자',
  '문법예문 MAU',
  '문법예문 신규사용자',
  '어휘출제 MAU',
  '어휘출제 신규사용자',
  '클래스카드 MAU',
  '클래스카드 신규사용자',
] as const;

export type TrendSeriesName = (typeof TREND_SERIES_NAMES)[number];

/** 상단(주력) 그룹: NE Tutor + 통합회원 신규가입 */
export const TREND_PRIMARY_NAMES: readonly TrendSeriesName[] = [
  'NE Tutor MAU',
  'NE Tutor 신규사용자',
  '통합회원',
] as const;

/**
 * 하단(서비스) 그룹: 표시 라벨 ↔ 월간 xlsx 시트의 서비스명 매핑.
 * 월간 xlsx는 이미 짧은 이름(NELT/문법문제/문법예문/어휘출제/클래스카드)을 사용한다.
 */
export const TREND_SERVICE_ROW: readonly { display: string; dataService: string }[] = [
  { display: 'NELT', dataService: 'NELT' },
  { display: '문법문제', dataService: '문법문제' },
  { display: '문법예문', dataService: '문법예문' },
  { display: '어휘출제', dataService: '어휘출제' },
  { display: '클래스카드', dataService: '클래스카드' },
] as const;

export const SERIES_STYLE: Record<TrendSeriesName, { color: string; dash: 'solid' | 'dot' }> = {
  'NE Tutor MAU': { color: '#60a5fa', dash: 'solid' },
  'NE Tutor 신규사용자': { color: '#93c5fd', dash: 'dot' },
  '통합회원': { color: '#f87171', dash: 'solid' },
  'NELT MAU': { color: '#fbbf24', dash: 'solid' },
  'NELT 신규사용자': { color: '#fcd34d', dash: 'dot' },
  '문법문제 MAU': { color: '#f472b6', dash: 'solid' },
  '문법문제 신규사용자': { color: '#f9a8d4', dash: 'dot' },
  '문법예문 MAU': { color: '#2dd4bf', dash: 'solid' },
  '문법예문 신규사용자': { color: '#5eead4', dash: 'dot' },
  '어휘출제 MAU': { color: '#34d399', dash: 'solid' },
  '어휘출제 신규사용자': { color: '#6ee7b7', dash: 'dot' },
  '클래스카드 MAU': { color: '#a78bfa', dash: 'solid' },
  '클래스카드 신규사용자': { color: '#c4b5fd', dash: 'dot' },
};

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

export function TrendChart(props: {
  monthly: MonthlyMetricRow[];
  /** 월별 PC/MO 원시 행 — 호버 툴팁의 PC/MO 분해값 표시에 사용 */
  monthlyByDevice: readonly MonthlyByDeviceRow[];
  rangeStart: string;
  rangeEnd: string;
  /** 검색 영역 PC/Mobile 선택 — 툴팁에 표시할 항목만 반영 */
  showPC: boolean;
  showMobile: boolean;
  logScale: boolean;
  events: EcosystemEvent[];
  services: readonly string[];
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>(initialVisible);
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

    const series: { name: TrendSeriesName; y: (number | null)[] }[] = [
      { name: 'NE Tutor MAU', y: mauY('NE Tutor') },
      { name: 'NE Tutor 신규사용자', y: newY('NE Tutor') },
      { name: '통합회원', y: newY('통합회원') },
      ...TREND_SERVICE_ROW.flatMap((s) => [
        { name: `${s.display} MAU` as TrendSeriesName, y: mauY(s.dataService) },
        { name: `${s.display} 신규사용자` as TrendSeriesName, y: newY(s.dataService) },
      ]),
    ];

    return { months, series, markerSize };
  }, [props.monthly, props.rangeStart, props.rangeEnd]);

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
    const BUBBLE_LANE_SPACING_PX = 58;
    const BUBBLE_HEIGHT_PX = 50;
    const topMargin = Math.max(
      60,
      eventLaneMeta.maxLanes * BUBBLE_LANE_SPACING_PX + BUBBLE_HEIGHT_PX + 10,
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
     * Plotly는 trace 배열의 앞쪽 원소를 먼저 그리고 뒤쪽 원소를 위에 덮어 그립니다.
     * NE Tutor 면 채움 그래프가 다른 라인을 가리지 않도록 가장 먼저(맨 뒤) 그리고,
     * 그 위에 막대(통합회원) → 나머지 라인 시리즈 순으로 배치합니다.
     */
    const orderedSeries = [
      ...series.filter((s) => AREA_FILL_NAMES.has(s.name)),
      ...series.filter((s) => BAR_NAMES.has(s.name)),
      ...series.filter((s) => !AREA_FILL_NAMES.has(s.name) && !BAR_NAMES.has(s.name)),
    ];

    const out: Data[] = [];
    for (const s of orderedSeries) {
      const on = visible[s.name] !== false;
      const st = SERIES_STYLE[s.name];
      const yRaw = s.y;
      const y = props.logScale
        ? yRaw.map((v) => (v != null && Number.isFinite(v) && v > 0 ? v : null))
        : yRaw.map((v) => (v != null && Number.isFinite(v) ? v : null));

      // 통합회원: 막대그래프
      if (BAR_NAMES.has(s.name)) {
        out.push({
          type: 'bar',
          name: s.name,
          x: months,
          y,
          visible: on,
          showlegend: false,
          marker: { color: hexToRgba(st.color, 0.75), line: { color: st.color, width: 1 } },
          hoverinfo: 'none',
        });
        continue;
      }

      // NE Tutor 라인: 영역 채움
      const fillProps = AREA_FILL_NAMES.has(s.name)
        ? { fill: 'tozeroy' as const, fillcolor: hexToRgba(st.color, 0.14) }
        : {};

      out.push({
        type: 'scatter',
        mode: 'lines+markers',
        name: s.name,
        x: months,
        y,
        visible: on,
        showlegend: false,
        connectgaps: false,
        ...fillProps,
        line: {
          shape: 'linear',
          width: AREA_FILL_NAMES.has(s.name) ? 2.4 : 2,
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

  const toggleSeries = useCallback((name: string) => {
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

    const { months } = seriesData;
    const firstM = months[0];
    const lastM = months[months.length - 1];
    const eventsVisible = props.events.filter((ev) => {
      const mk = monthKeyFromAnchor(ev.anchorDate);
      return mk >= firstM && mk <= lastM;
    });

    const shapes: Partial<Shape>[] = eventsVisible.map((ev) => ({
      type: 'line',
      xref: 'x',
      yref: 'paper',
      x0: monthKeyFromAnchor(ev.anchorDate),
      x1: monthKeyFromAnchor(ev.anchorDate),
      y0: 0,
      y1: 1,
      line: { color: eventLineColor(ev), width: 1, dash: 'dot' },
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
    const BUBBLE_LANE_SPACING_PX = 58;
    const BUBBLE_HEIGHT_PX = 50;
    const annotations = annMeta.map(({ ev, lane, xshift }) => {
      const border = eventLineColor(ev);
      const lines = splitEventNameToTwoLines(ev.name);
      return {
        x: monthKeyFromAnchor(ev.anchorDate),
        xref: 'x' as const,
        xshift,
        y: 1,
        yref: 'paper' as const,
        yshift: lane * BUBBLE_LANE_SPACING_PX + 6,
        text: `<b>${eventBubbleText(ev)}</b><br>${lines.join('<br>')}`,
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
        borderpad: 5,
        font: { family: APP_FONT_FAMILY, size: 9, color: '#f9fafb' },
        align: 'center' as const,
      };
    });

    const maxLanes = annMeta.length === 0 ? 0 : Math.max(...annMeta.map((a) => a.lane + 1));
    /** 픽셀 단위 top margin = 가장 위 레인의 bubble 상단 + 약간의 여유 */
    const topMargin = Math.max(60, maxLanes * BUBBLE_LANE_SPACING_PX + BUBBLE_HEIGHT_PX + 10);

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
      annotations,
      hovermode: 'closest',
      bargap: 0.25,
    };

    Plotly.newPlot(el, traces, layout, {
      responsive: true,
      displaylogo: false,
      locale: 'ko',
      displayModeBar: true,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
    });

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
      if (!monthMap) return;

      const makeBlock = (svc: string, opts?: { newOnly?: boolean }): HoverServiceData | null => {
        const r = monthMap.get(svc);
        if (!r) return null;
        return {
          name: svc,
          color: mauColorForService(svc),
          pcMau: r.pcMau,
          moMau: r.moMau,
          pcNew: r.pcNew,
          moNew: r.moNew,
          teacherNew: svc === '통합회원' ? r.teacherNew : undefined,
          hasMau: !opts?.newOnly,
          newOnly: opts?.newOnly,
        };
      };

      const primary: HoverServiceData[] = [];
      const neTutorBlock = makeBlock('NE Tutor');
      if (neTutorBlock) primary.push(neTutorBlock);
      const memberBlock = makeBlock('통합회원', { newOnly: true });
      if (memberBlock) primary.push(memberBlock);

      const secondaryServices = ['NELT', '문법문제', '문법예문', '어휘출제', '클래스카드'];
      const secondary = secondaryServices
        .map((s) => makeBlock(s))
        .filter((b): b is HoverServiceData => b != null);

      const shell = shellRef.current;
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      const mx = data.event.clientX - rect.left;
      const my = data.event.clientY - rect.top;
      setHover({ x: xv, primary, secondary, left: mx, top: my });
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
  ]);

  void props.services;

  return (
    <div ref={shellRef} className="trend-chart-shell chart-box">
      <div className="trend-chart-toolbar">
        <div className="trend-series-toggles" aria-label="표시할 시리즈 선택">
          <div className="trend-toggle-group trend-toggle-group--primary">
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
          <div className="trend-toggle-group trend-toggle-group--others">
            <label className="trend-trace-toggle trend-trace-toggle--all">
              <input type="checkbox" checked={allSecondaryOn} onChange={toggleAllSecondary} />
              <span>전체</span>
            </label>
            {(['MAU', '신규사용자'] as const).map((kind) => (
              <div key={kind} className="trend-service-row">
                <span className="trend-service-row-label">{kind}</span>
                {TREND_SERVICE_ROW.map((s) => {
                  const name = `${s.display} ${kind}` as TrendSeriesName;
                  const st = SERIES_STYLE[name];
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
        <button type="button" className="btn trend-fs-btn" onClick={toggleFullscreen} title="Plotly 툴바의 확대 아이콘은 축 자동 맞춤입니다. 여기서 차트 영역 전체화면을 켜고 끕니다.">
          {isFs ? '전체 화면 종료' : '전체 화면'}
        </button>
      </div>
      <div ref={plotRef} style={{ width: '100%', height: chartHeight }} />
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
  const teacher = block.teacherNew ?? 0;

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
        block.newOnly && teacher > 0 ? (
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
      {block.hasMau && (
        <div className="trend-hover-row">
          <span className="trend-hover-label">MAU</span>
          <span className="trend-hover-value">{mauLine()}</span>
        </div>
      )}
      <div className="trend-hover-row">
        <span className="trend-hover-label">{block.newOnly ? '신규가입' : '신규사용자'}</span>
        <span className="trend-hover-value">{newLine()}</span>
      </div>
    </div>
  );
}
