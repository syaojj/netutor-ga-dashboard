/**
 * 전년 동월 비교: 검색 구간의 각 월과 전년 동월을 한 축에 겹쳐 표시.
 * PC·Mobile 각각 MAU·신규를 동일 Y축(명)으로 표시. 서비스 단일 선택.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Plotly from 'plotly.js-dist-min';
import type { Data, Layout } from 'plotly.js';
import type { EbookMonthlyRow, MonthlyByDeviceRow } from '../types';
import { APP_FONT_FAMILY } from '../fonts';
import { useTheme } from '../context/ThemeContext';
import { clampTooltipToViewport } from '../utils/viewportTooltipPosition';

/** 전년 동월 서비스 탭 순서(데이터가 있는 항목만 표시). LAW E-Book·부가자료는 ebookMonthly에서 합성 행으로 채움 */
const YOY_SERVICE_ORDER: readonly string[] = [
  'NE Tutor',
  '통합회원',
  '부가자료',
  'E-Book',
  '어휘출제',
  '클래스카드',
  '문법문제',
  'NELT',
];

/**
 * 전년 동월 비교: 지표별 동일 색조 — 당월 실선(진함)·전년 동월 점선(연함).
 * - MAU: 분홍 계열
 * - 신규: 청록 계열
 */
const YOY_METRIC_COLORS = {
  mauCurrent: '#be185d',
  mauPrior: '#f472b6',
  newCurrent: '#0f766e',
  newPrior: '#2dd4bf',
} as const;

const YOY_LEGEND_GROUPS: readonly {
  groupLabel: string;
  chips: readonly { key: string; label: string; color: string; dashed: boolean }[];
}[] = [
  {
    groupLabel: 'MAU',
    chips: [
      { key: 'mau-c', label: '선택월', color: YOY_METRIC_COLORS.mauCurrent, dashed: false },
      { key: 'mau-p', label: '전년동월', color: YOY_METRIC_COLORS.mauPrior, dashed: true },
    ],
  },
  {
    groupLabel: '신규사용자',
    chips: [
      { key: 'new-c', label: '선택월', color: YOY_METRIC_COLORS.newCurrent, dashed: false },
      { key: 'new-p', label: '전년동월', color: YOY_METRIC_COLORS.newPrior, dashed: true },
    ],
  },
] as const;

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

function priorYearMonth(mo: string): string {
  const y = Number(mo.slice(0, 4)) - 1;
  return `${y}-${mo.slice(5, 7)}`;
}

function formatHoverMetric(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('ko-KR').format(Math.round(v));
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
  const pow10 = 10 ** Math.floor(Math.log10(Math.max(rough, 1)));
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

function servicesWithDataInRange(
  byMonth: Map<string, Map<string, MonthlyByDeviceRow>>,
  months: string[],
): string[] {
  if (months.length === 0) return [...YOY_SERVICE_ORDER];
  const seen = new Set<string>();
  for (const mo of months) {
    const rowMap = byMonth.get(mo);
    if (!rowMap) continue;
    for (const svc of rowMap.keys()) seen.add(svc);
  }
  return YOY_SERVICE_ORDER.filter((svc) => seen.has(svc));
}

type DeviceSide = 'pc' | 'mo';

/**
 * YoY 패널은 PC·Mobile 각각 단일 축이므로 `monthlyTrend.newForDevice`와 동일하게
 * PC는 `pcNew`, Mobile은 `moNew`만 사용한다.
 * (구버전: 통합회원 PC에 교강사까지 합산하려다 `teacherNew` 결측 시 전부 null이 되어 선이 안 그려짐)
 */
function readMauNew(
  row: MonthlyByDeviceRow | undefined,
  device: DeviceSide,
  _svc: string,
): { mau: number | null; neu: number | null } {
  if (!row) return { mau: null, neu: null };
  const mau = device === 'pc' ? row.pcMau : row.moMau;
  const neu: number | null = device === 'pc' ? row.pcNew : row.moNew;
  return { mau, neu };
}

type YoyHoverTip = { device: DeviceSide; idx: number; clientX: number; clientY: number };

function YoyHoverCard({
  tip,
  months,
  selectedService,
  byMonth,
  logScale,
}: {
  tip: YoyHoverTip;
  months: string[];
  selectedService: string;
  byMonth: Map<string, Map<string, MonthlyByDeviceRow>>;
  logScale: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef(tip);
  tipRef.current = tip;
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const m = months[tip.idx];
  const sig = `${tip.idx}|${tip.device}|${selectedService}|${m ?? ''}|${tip.clientX}|${tip.clientY}`;

  const commitTooltipPos = useCallback(() => {
    const card = cardRef.current;
    const t = tipRef.current;
    if (!card) return;
    const { left, top } = clampTooltipToViewport(card, t.clientX, t.clientY);
    setPos({ left, top });
  }, []);

  useLayoutEffect(() => {
    commitTooltipPos();
    const id = requestAnimationFrame(commitTooltipPos);
    return () => cancelAnimationFrame(id);
  }, [commitTooltipPos, sig]);

  useEffect(() => {
    commitTooltipPos();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', commitTooltipPos);
    vv?.addEventListener('scroll', commitTooltipPos);
    window.addEventListener('resize', commitTooltipPos);
    return () => {
      vv?.removeEventListener('resize', commitTooltipPos);
      vv?.removeEventListener('scroll', commitTooltipPos);
      window.removeEventListener('resize', commitTooltipPos);
    };
  }, [commitTooltipPos]);

  if (!m) return null;
  const pm = priorYearMonth(m);
  const svc = selectedService;
  const curRow = byMonth.get(m)?.get(svc);
  const prevRow = byMonth.get(pm)?.get(svc);
  let { mau: mauC, neu: newC } = readMauNew(curRow, tip.device, svc);
  let { mau: mauP, neu: newP } = readMauNew(prevRow, tip.device, svc);
  if (logScale) {
    mauC = mauC != null && Number.isFinite(mauC) && mauC > 0 ? mauC : null;
    mauP = mauP != null && Number.isFinite(mauP) && mauP > 0 ? mauP : null;
    newC = newC != null && Number.isFinite(newC) && newC > 0 ? newC : null;
    newP = newP != null && Number.isFinite(newP) && newP > 0 ? newP : null;
  } else {
    mauC = mauC != null && Number.isFinite(mauC) ? mauC : null;
    mauP = mauP != null && Number.isFinite(mauP) ? mauP : null;
    newC = newC != null && Number.isFinite(newC) ? newC : null;
    newP = newP != null && Number.isFinite(newP) ? newP : null;
  }

  const deviceLabel = tip.device === 'pc' ? 'PC' : 'Mobile';
  const svcTitle = svc;

  const fmtCell = (v: number | null) =>
    v != null && Number.isFinite(v) ? `${formatHoverMetric(v)}명` : '—';

  const leftPx = pos?.left ?? tip.clientX + 10;
  const topPx = pos?.top ?? tip.clientY + 8;

  return (
    <div
      ref={cardRef}
      className="trend-hover-card yoy-hover-card trend-hover-card--viewport"
      style={{
        position: 'fixed',
        left: leftPx,
        top: topPx,
        opacity: pos == null ? 0 : 1,
        zIndex: 10050,
        pointerEvents: 'none',
      }}
      role="tooltip"
    >
      <div className="yoy-hover-layout">
        <span className="yoy-hover-arrow" aria-hidden />
        <header className="yoy-hover-head">
          <span className="yoy-hover-head-date">{formatMonthTick(m)}</span>
          <span className="yoy-hover-head-meta">
            {svcTitle} · {deviceLabel}
          </span>
        </header>

        <section className="yoy-hover-sec" aria-label="MAU">
          <h4 className="yoy-hover-sec-title" style={{ color: YOY_METRIC_COLORS.mauPrior }}>
            <span className="yoy-hover-sec-pipe" aria-hidden>
              |
            </span>{' '}
            MAU
          </h4>
          <div className="yoy-hover-line">
            <span
              className="yoy-hover-line-swatch yoy-hover-line-swatch--solid"
              style={{ background: YOY_METRIC_COLORS.mauCurrent }}
              aria-hidden
            />
            <span className="yoy-hover-line-label">선택월</span>
            <span
              className="yoy-hover-line-val"
              style={{ color: fmtCell(mauC) === '—' ? 'var(--muted)' : YOY_METRIC_COLORS.mauCurrent }}
            >
              {fmtCell(mauC)}
            </span>
          </div>
          <div className="yoy-hover-line">
            <span
              className="yoy-hover-line-swatch yoy-hover-line-swatch--dash"
              style={{ borderColor: YOY_METRIC_COLORS.mauPrior }}
              aria-hidden
            />
            <span className="yoy-hover-line-label">전년동월</span>
            <span
              className="yoy-hover-line-val"
              style={{ color: fmtCell(mauP) === '—' ? 'var(--muted)' : YOY_METRIC_COLORS.mauPrior }}
            >
              {fmtCell(mauP)}
            </span>
          </div>
        </section>

        <hr className="yoy-hover-sep" />

        <section className="yoy-hover-sec" aria-label="신규사용자">
          <h4 className="yoy-hover-sec-title" style={{ color: YOY_METRIC_COLORS.newPrior }}>
            <span className="yoy-hover-sec-pipe" aria-hidden>
              |
            </span>{' '}
            신규사용자
          </h4>
          <div className="yoy-hover-line">
            <span
              className="yoy-hover-line-swatch yoy-hover-line-swatch--solid"
              style={{ background: YOY_METRIC_COLORS.newCurrent }}
              aria-hidden
            />
            <span className="yoy-hover-line-label">선택월</span>
            <span
              className="yoy-hover-line-val"
              style={{ color: fmtCell(newC) === '—' ? 'var(--muted)' : YOY_METRIC_COLORS.newCurrent }}
            >
              {fmtCell(newC)}
            </span>
          </div>
          <div className="yoy-hover-line">
            <span
              className="yoy-hover-line-swatch yoy-hover-line-swatch--dash"
              style={{ borderColor: YOY_METRIC_COLORS.newPrior }}
              aria-hidden
            />
            <span className="yoy-hover-line-label">전년동월</span>
            <span
              className="yoy-hover-line-val"
              style={{ color: fmtCell(newP) === '—' ? 'var(--muted)' : YOY_METRIC_COLORS.newPrior }}
            >
              {fmtCell(newP)}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

interface YoYPanelPayload {
  title: string;
  device: DeviceSide;
  traces: Data[];
  yMin: number;
  yMax: number;
}

export function YoYCompareChartsGrid(props: {
  monthlyByDevice: readonly MonthlyByDeviceRow[];
  ebookMonthly: readonly EbookMonthlyRow[];
  rangeStart: string;
  rangeEnd: string;
  logScale: boolean;
}) {
  const { chartTheme } = useTheme();
  const shellRef = useRef<HTMLDivElement>(null);
  const plotRef0 = useRef<HTMLDivElement>(null);
  const plotRef1 = useRef<HTMLDivElement>(null);
  const plotRefs = [plotRef0, plotRef1] as const;
  const [selectedService, setSelectedService] = useState<string>('NE Tutor');
  const [isFs, setIsFs] = useState(false);
  const [yoyHoverTip, setYoyHoverTip] = useState<YoyHoverTip | null>(null);

  const months = useMemo(
    () => monthsInRange(props.rangeStart, props.rangeEnd),
    [props.rangeStart, props.rangeEnd],
  );

  const byMonth = useMemo(() => {
    const map = new Map<string, Map<string, MonthlyByDeviceRow>>();
    for (const r of props.monthlyByDevice) {
      if (!map.has(r.month)) map.set(r.month, new Map());
      map.get(r.month)!.set(r.service, r);
    }
    for (const eb of props.ebookMonthly) {
      const mo = eb.monthKey;
      if (!map.has(mo)) map.set(mo, new Map());
      const m = map.get(mo)!;
      const u = eb.lawEbookUniqueUsers;
      if (u != null && Number.isFinite(u)) {
        m.set('E-Book', {
          service: 'E-Book',
          month: mo,
          pcMau: u,
          moMau: u,
          pcNew: null,
          moNew: null,
          teacherNew: null,
        });
      }
      const s = eb.lawSupplementaryIndividualDownloads;
      if (s != null && Number.isFinite(s)) {
        m.set('부가자료', {
          service: '부가자료',
          month: mo,
          pcMau: s,
          moMau: s,
          pcNew: null,
          moNew: null,
          teacherNew: null,
        });
      }
    }
    return map;
  }, [props.monthlyByDevice, props.ebookMonthly]);

  const activeServices = useMemo(() => servicesWithDataInRange(byMonth, months), [byMonth, months]);

  useEffect(() => {
    if (activeServices.length === 0) return;
    if (!activeServices.includes(selectedService)) {
      setSelectedService(activeServices[0]);
    }
  }, [activeServices, selectedService]);

  useEffect(() => {
    setYoyHoverTip(null);
  }, [months, selectedService, props.rangeStart, props.rangeEnd]);

  const buildYoYPanel = useCallback(
    (device: DeviceSide): YoYPanelPayload => {
      const svc = selectedService;
      const title = device === 'pc' ? 'PC (MAU / 신규)' : 'Mobile (MAU / 신규)';
      const traces: Data[] = [];
      let yMax = 10;
      let yMin = 0;
      const nMonths = months.length;
      const markerSize = nMonths <= 1 ? 9 : nMonths <= 6 ? 6 : 4;
      const cMauC = YOY_METRIC_COLORS.mauCurrent;
      const cMauP = YOY_METRIC_COLORS.mauPrior;
      const cNewC = YOY_METRIC_COLORS.newCurrent;
      const cNewP = YOY_METRIC_COLORS.newPrior;

      /** MAU·신규 모두 동일 Y축 범위 */
      const collectY = (vals: (number | null)[]) => {
        for (const v of vals) {
          if (v == null || !Number.isFinite(v)) continue;
          if (props.logScale) {
            if (v <= 0) continue;
            yMax = Math.max(yMax, v);
            yMin = yMin === 0 ? v : Math.min(yMin, v);
          } else {
            yMax = Math.max(yMax, v);
            yMin = Math.min(yMin, v);
          }
        }
      };

      const yMauCurr: (number | null)[] = [];
      const yMauPrior: (number | null)[] = [];
      const yNewCurr: (number | null)[] = [];
      const yNewPrior: (number | null)[] = [];

      for (const m of months) {
        const curRow = byMonth.get(m)?.get(svc);
        const pm = priorYearMonth(m);
        const prevRow = byMonth.get(pm)?.get(svc);
        let { mau: cM, neu: cN } = readMauNew(curRow, device, svc);
        let { mau: pM, neu: pN } = readMauNew(prevRow, device, svc);
        if (props.logScale) {
          cM = cM != null && Number.isFinite(cM) && cM > 0 ? cM : null;
          pM = pM != null && Number.isFinite(pM) && pM > 0 ? pM : null;
          cN = cN != null && Number.isFinite(cN) && cN > 0 ? cN : null;
          pN = pN != null && Number.isFinite(pN) && pN > 0 ? pN : null;
        } else {
          cM = cM != null && Number.isFinite(cM) ? cM : null;
          pM = pM != null && Number.isFinite(pM) ? pM : null;
          cN = cN != null && Number.isFinite(cN) ? cN : null;
          pN = pN != null && Number.isFinite(pN) ? pN : null;
        }
        yMauCurr.push(cM);
        yMauPrior.push(pM);
        yNewCurr.push(cN);
        yNewPrior.push(pN);
      }
      collectY(yMauCurr);
      collectY(yMauPrior);
      collectY(yNewCurr);
      collectY(yNewPrior);

      traces.push({
        type: 'scatter',
        mode: 'lines+markers',
        name: 'MAU 선택월',
        x: months,
        y: yMauCurr,
        yaxis: 'y',
        hoverinfo: 'none',
        showlegend: false,
        connectgaps: false,
        line: { shape: 'linear', width: 2.6, color: cMauC },
        marker: { size: markerSize, color: cMauC, line: { width: 0 } },
      });
      traces.push({
        type: 'scatter',
        mode: 'lines+markers',
        name: 'MAU 전년동월',
        x: months,
        y: yMauPrior,
        yaxis: 'y',
        hoverinfo: 'none',
        showlegend: false,
        connectgaps: false,
        line: { shape: 'linear', width: 2, dash: 'dot', color: cMauP },
        marker: { size: Math.max(3, markerSize - 1), color: cMauP, opacity: 0.92, line: { width: 0 } },
      });
      traces.push({
        type: 'scatter',
        mode: 'lines+markers',
        name: '신규사용자 선택월',
        x: months,
        y: yNewCurr,
        yaxis: 'y',
        hoverinfo: 'none',
        showlegend: false,
        connectgaps: false,
        line: { shape: 'linear', width: 2.6, color: cNewC },
        marker: { size: markerSize, color: cNewC, line: { width: 0 } },
      });
      traces.push({
        type: 'scatter',
        mode: 'lines+markers',
        name: '신규사용자 전년동월',
        x: months,
        y: yNewPrior,
        yaxis: 'y',
        hoverinfo: 'none',
        showlegend: false,
        connectgaps: false,
        line: { shape: 'linear', width: 2, dash: 'dot', color: cNewP },
        marker: { size: Math.max(3, markerSize - 1), color: cNewP, opacity: 0.92, line: { width: 0 } },
      });

      if (props.logScale) {
        yMin = Math.max(yMin * 0.35, 1);
        yMax = yMax * 1.35;
      } else {
        yMin = Math.min(0, yMin * 0.95);
        yMax = yMax * 1.12;
      }
      if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMax <= yMin) {
        yMin = props.logScale ? 1 : 0;
        yMax = 10;
      }

      return { title, device, traces, yMin, yMax };
    },
    [byMonth, months, props.logScale, selectedService],
  );

  const panelPayloads = useMemo(
    () => [buildYoYPanel('pc'), buildYoYPanel('mo')],
    [buildYoYPanel],
  );

  const resizePlots = useCallback(() => {
    for (const r of plotRefs) {
      const el = r.current;
      if (!el) continue;
      try {
        (Plotly as unknown as { Plots: { resize: (root: HTMLElement) => void } }).Plots.resize(el);
      } catch {
        /* noop */
      }
    }
  }, []);

  useEffect(() => {
    const onFs = () => {
      setIsFs(document.fullscreenElement === shellRef.current);
      setTimeout(resizePlots, 120);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [resizePlots]);

  useEffect(() => {
    window.addEventListener('resize', resizePlots);
    return () => window.removeEventListener('resize', resizePlots);
  }, [resizePlots]);

  const toggleFullscreen = useCallback(async () => {
    const shell = shellRef.current;
    if (!shell) return;
    try {
      if (!document.fullscreenElement) await shell.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      /* noop */
    }
    setTimeout(resizePlots, 150);
  }, [resizePlots]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const xTickStep = Math.max(1, Math.ceil(months.length / 8));
    const tickvals = months.filter((_, i) => i % xTickStep === 0);
    const ticktext = tickvals.map(formatMonthTick);

    panelPayloads.forEach((payload, idx) => {
      const el = plotRefs[idx].current;
      if (!el) return;

      const logY =
        props.logScale && payload.yMax > 0
          ? buildLogYAxisTicks(payload.yMin, payload.yMax)
          : { tickvals: [] as number[], ticktext: [] as string[] };
      const linearY = !props.logScale ? buildLinearYAxisTicks(payload.yMin, payload.yMax) : {};

      const yaxis: Partial<Layout['yaxis']> = {
        autorange: true,
        type: props.logScale ? 'log' : 'linear',
        gridcolor: chartTheme.grid,
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
        uirevision: `yoy-compare-${payload.device}`,
        title: {
          text: '',
          font: { size: 1, color: chartTheme.fontStrong, family: APP_FONT_FAMILY },
        },
        paper_bgcolor: chartTheme.paper,
        plot_bgcolor: chartTheme.plot,
        font: { color: chartTheme.font, family: APP_FONT_FAMILY, size: 10 },
        margin: { t: 28, r: 28, b: 48, l: 58 },
        showlegend: false,
        xaxis: {
          type: 'category',
          categoryorder: 'array',
          categoryarray: months,
          gridcolor: chartTheme.grid,
          tickangle: -30,
          tickmode: 'array',
          tickvals,
          ticktext,
        },
        yaxis,
        hovermode: 'closest',
      };

      Plotly.newPlot(el, payload.traces, layout, {
        responsive: true,
        displaylogo: false,
        locale: 'ko',
        displayModeBar: false,
        doubleClick: 'reset+autosize',
      });

      const gd = el as unknown as {
        on: (ev: string, cb: (d: never) => void) => void;
        removeAllListeners?: (ev: string) => void;
      };
      const deviceForChart = payload.device;
      const handleHover = (data: { points?: { pointIndex: number }[]; event?: MouseEvent }) => {
        const pt = data.points?.[0];
        if (pt == null || typeof pt.pointIndex !== 'number') return;
        const ev = data.event;
        if (!ev) return;
        setYoyHoverTip({
          device: deviceForChart,
          idx: pt.pointIndex,
          clientX: ev.clientX,
          clientY: ev.clientY,
        });
      };
      const handleUnhover = () => setYoyHoverTip(null);
      gd.on('plotly_hover', handleHover as never);
      gd.on('plotly_unhover', handleUnhover as never);

      cleanups.push(() => {
        gd.removeAllListeners?.('plotly_hover');
        gd.removeAllListeners?.('plotly_unhover');
        Plotly.purge(el);
      });
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [panelPayloads, months, props.logScale, chartTheme]);

  return (
    <div ref={shellRef} className="trend-chart-shell trend-chart-shell--flat">
      {activeServices.length === 0 && (
        <p className="yoy-empty-hint" role="status">
          선택 구간에 월간 통합 행이 없어 차트를 그릴 수 없습니다.
        </p>
      )}
      <div className="trend-chart-toolbar trend-chart-toolbar--yoy">
        <div className="trend-series-toggles" aria-label="전년 동월 비교 — 범례 및 서비스 선택">
          <div className="yoy-legend-row">
            <div className="yoy-metric-chips yoy-metric-chips--one-row" aria-label="MAU·신규사용자 각 선택월·전년동월 선 스타일">
              {YOY_LEGEND_GROUPS.map((g, idx) => (
                <span key={g.groupLabel} className="yoy-metric-pair">
                  {idx > 0 ? (
                    <span className="yoy-metric-row-sep" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  <span className="yoy-metric-pair-label">{g.groupLabel}</span>
                  {g.chips.map((it) => (
                    <span key={it.key} className="yoy-metric-chip">
                      <span
                        className={`yoy-metric-chip-swatch${it.dashed ? ' yoy-metric-chip-swatch--dash' : ''}`}
                        style={
                          it.dashed
                            ? {
                                background: 'transparent',
                                borderTop: `3px dashed ${it.color}`,
                                height: 0,
                                borderRadius: 0,
                              }
                            : { background: it.color }
                        }
                      />
                      {it.label}
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
          <div className="yoy-service-picker" role="radiogroup" aria-label="서비스 선택">
            {activeServices.map((svc) => {
              const on = svc === selectedService;
              return (
                <button
                  key={svc}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`yoy-service-btn${on ? ' yoy-service-btn--active' : ''}`}
                  onClick={() => setSelectedService(svc)}
                >
                  <span className={`yoy-service-dot${on ? ' yoy-service-dot--active' : ''}`} aria-hidden />
                  <span>{svc}</span>
                </button>
              );
            })}
          </div>
        </div>
        <button type="button" className="btn trend-fs-btn" onClick={toggleFullscreen}>
          {isFs ? '전체 화면 종료' : '전체 화면'}
        </button>
      </div>
      <div className="yoy-compare-grid">
        {panelPayloads.map((p) => (
          <div key={p.device} className="yoy-chart-panel-wrap">
            <div className="yoy-chart-device-caption">{p.device === 'pc' ? 'PC' : 'Mobile'}</div>
            <div className="yoy-chart-panel">
              <div ref={p.device === 'pc' ? plotRef0 : plotRef1} style={{ width: '100%', height: 300 }} />
            </div>
          </div>
        ))}
      </div>
      {yoyHoverTip &&
        createPortal(
          <YoyHoverCard
            tip={yoyHoverTip}
            months={months}
            selectedService={selectedService}
            byMonth={byMonth}
            logScale={props.logScale}
          />,
          document.body,
        )}
    </div>
  );
}
