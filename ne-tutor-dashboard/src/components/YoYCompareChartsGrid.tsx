/**
 * 전년 동기 비교: 검색 기간의 각 월에 대해 전년 동월 값을 같은 X축에 겹쳐 표시.
 * PC MAU / Mobile MAU / PC 신규 / Mobile 신규 — 2열×2행.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import type { Data, Layout } from 'plotly.js';
import type { MonthlyByDeviceRow } from '../types';
import { APP_FONT_FAMILY, PLOTLY_HOVERLABEL } from '../fonts';
import { SERIES_STYLE, TREND_SERVICE_ROW, type TrendSeriesName } from './TrendChart';

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

function hexToRgba(hex: string, a: number): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
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

type PanelKind = 'pcMau' | 'moMau' | 'pcNew' | 'moNew';

const TOGGLE_SERVICES: readonly string[] = [
  'NE Tutor',
  '통합회원',
  ...TREND_SERVICE_ROW.map((s) => s.dataService),
];

function mauSeriesKey(svc: string): TrendSeriesName {
  if (svc === 'NE Tutor') return 'NE Tutor MAU';
  return `${svc} MAU` as TrendSeriesName;
}

function newSeriesKey(svc: string): TrendSeriesName {
  if (svc === 'NE Tutor') return 'NE Tutor 신규사용자';
  if (svc === '통합회원') return '통합회원';
  return `${svc} 신규사용자` as TrendSeriesName;
}

function seriesColor(panel: PanelKind, svc: string): string {
  const isMau = panel === 'pcMau' || panel === 'moMau';
  const key = isMau ? mauSeriesKey(svc) : newSeriesKey(svc);
  return SERIES_STYLE[key]?.color ?? '#94a3b8';
}

function readMetric(row: MonthlyByDeviceRow | undefined, panel: PanelKind): number | null {
  if (!row) return null;
  switch (panel) {
    case 'pcMau':
      return row.pcMau;
    case 'moMau':
      return row.moMau;
    case 'pcNew':
      return row.pcNew;
    case 'moNew':
      return row.moNew;
    default:
      return null;
  }
}

function servicesForPanel(panel: PanelKind): string[] {
  if (panel === 'pcMau' || panel === 'moMau') {
    return ['NE Tutor', ...TREND_SERVICE_ROW.map((s) => s.dataService)];
  }
  return ['NE Tutor', '통합회원', ...TREND_SERVICE_ROW.map((s) => s.dataService)];
}

function initialVisible(): Record<string, boolean> {
  return Object.fromEntries(TOGGLE_SERVICES.map((s) => [s, true]));
}

export function YoYCompareChartsGrid(props: {
  monthlyByDevice: readonly MonthlyByDeviceRow[];
  rangeStart: string;
  rangeEnd: string;
  logScale: boolean;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const plotRef0 = useRef<HTMLDivElement>(null);
  const plotRef1 = useRef<HTMLDivElement>(null);
  const plotRef2 = useRef<HTMLDivElement>(null);
  const plotRef3 = useRef<HTMLDivElement>(null);
  const plotRefs = [plotRef0, plotRef1, plotRef2, plotRef3] as const;
  const [visible, setVisible] = useState<Record<string, boolean>>(initialVisible);
  const [isFs, setIsFs] = useState(false);

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
    return map;
  }, [props.monthlyByDevice]);

  const panelDefs: { kind: PanelKind; title: string }[] = useMemo(
    () => [
      { kind: 'pcMau', title: 'PC MAU' },
      { kind: 'moMau', title: 'Mobile MAU' },
      { kind: 'pcNew', title: 'PC 신규사용자' },
      { kind: 'moNew', title: 'Mobile 신규사용자' },
    ],
    [],
  );

  const buildPanel = useCallback(
    (panel: PanelKind): { traces: Data[]; yMin: number; yMax: number } => {
      const svcs = servicesForPanel(panel);
      const traces: Data[] = [];
      let yMax = 10;
      let yMin = 0;
      const nMonths = months.length;
      const markerSize = nMonths <= 1 ? 10 : nMonths <= 6 ? 7 : 5;

      for (const svc of svcs) {
        if (visible[svc] === false) continue;
        const yCurr: (number | null)[] = [];
        const yPrior: (number | null)[] = [];
        for (const m of months) {
          const cur = readMetric(byMonth.get(m)?.get(svc), panel);
          const pm = priorYearMonth(m);
          const prev = readMetric(byMonth.get(pm)?.get(svc), panel);
          let c = cur;
          let p = prev;
          if (props.logScale) {
            c = c != null && Number.isFinite(c) && c > 0 ? c : null;
            p = p != null && Number.isFinite(p) && p > 0 ? p : null;
          } else {
            c = c != null && Number.isFinite(c) ? c : null;
            p = p != null && Number.isFinite(p) ? p : null;
          }
          yCurr.push(c);
          yPrior.push(p);
          for (const v of [c, p]) {
            if (v != null && Number.isFinite(v) && v > 0) {
              yMax = Math.max(yMax, v);
              yMin = yMin === 0 ? v : Math.min(yMin, v);
            }
          }
        }
        const col = seriesColor(panel, svc);
        const customdata = months.map((m, i) => {
          const pm = priorYearMonth(m);
          return [pm, formatHoverMetric(yCurr[i]), formatHoverMetric(yPrior[i])];
        });
        const hovertemplate =
          `<b>[${svc} 당월]</b><br>%{x} %{customdata[1]}<br>` +
          `<b>[${svc} 전년동기]</b><br>%{customdata[0]} %{customdata[2]}<extra></extra>`;

        traces.push({
          type: 'scatter',
          mode: 'lines+markers',
          name: `${svc} (당월)`,
          x: months,
          y: yCurr,
          customdata,
          hovertemplate,
          showlegend: false,
          connectgaps: false,
          line: { shape: 'linear', width: 2.2, color: col },
          marker: { size: markerSize, color: col },
        });
        traces.push({
          type: 'scatter',
          mode: 'lines+markers',
          name: `${svc} (전년 동월)`,
          x: months,
          y: yPrior,
          customdata,
          hovertemplate,
          showlegend: false,
          connectgaps: false,
          line: { shape: 'linear', width: 2, dash: 'dot', color: hexToRgba(col, 0.72) },
          marker: {
            size: Math.max(3, markerSize - 1),
            color: hexToRgba(col, 0.72),
            line: { width: 0 },
          },
        });
      }

      if (props.logScale) {
        yMin = Math.max(yMin * 0.35, 1);
        yMax = yMax * 1.35;
      } else {
        yMin = Math.max(0, yMin * 0.85);
        yMax = yMax * 1.15;
      }
      if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMax <= yMin) {
        yMin = props.logScale ? 1 : 0;
        yMax = 10;
      }
      return { traces, yMin, yMax };
    },
    [byMonth, months, props.logScale, visible],
  );

  const panelPayloads = useMemo(
    () => panelDefs.map((d) => ({ ...d, ...buildPanel(d.kind) })),
    [panelDefs, buildPanel],
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
    const plotHeight = 300;

    panelPayloads.forEach((payload, idx) => {
      const el = plotRefs[idx].current;
      if (!el) return;
      const logY =
        props.logScale && payload.yMax > 0
          ? buildLogYAxisTicks(payload.yMin, payload.yMax)
          : { tickvals: [] as number[], ticktext: [] as string[] };
      const linearY = !props.logScale ? buildLinearYAxisTicks(payload.yMin, payload.yMax) : {};

      const yaxis: Partial<Layout['yaxis']> = {
        type: props.logScale ? 'log' : 'linear',
        gridcolor: '#374151',
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
        title: {
          text: payload.title,
          font: { size: 13, color: '#e5e7eb', family: APP_FONT_FAMILY },
          x: 0,
          xanchor: 'left',
        },
        paper_bgcolor: '#1f2937',
        plot_bgcolor: '#1f2937',
        font: { color: '#e5e7eb', family: APP_FONT_FAMILY, size: 10 },
        margin: { t: 44, r: 16, b: 48, l: 58 },
        showlegend: false,
        xaxis: {
          type: 'category',
          categoryorder: 'array',
          categoryarray: months,
          gridcolor: '#374151',
          tickangle: -30,
          tickmode: 'array',
          tickvals,
          ticktext,
        },
        yaxis,
        hovermode: 'closest',
        hoverlabel: { ...PLOTLY_HOVERLABEL },
      };

      Plotly.newPlot(el, payload.traces, layout, {
        responsive: true,
        displaylogo: false,
        locale: 'ko',
        displayModeBar: true,
        modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      });
      cleanups.push(() => {
        Plotly.purge(el);
      });
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [panelPayloads, months, props.logScale]);

  const toggleSeries = useCallback((svc: string) => {
    setVisible((prev) => {
      const next = { ...prev, [svc]: !prev[svc] };
      const on = TOGGLE_SERVICES.filter((s) => next[s] !== false).length;
      if (on === 0) return prev;
      return next;
    });
  }, []);

  return (
    <div ref={shellRef} className="trend-chart-shell chart-box">
      <div className="trend-chart-toolbar trend-chart-toolbar--yoy">
        <div className="trend-series-toggles" aria-label="전년 동기 비교 시리즈">
          <span className="yoy-legend-hint">실선: 당월 · 점선: 전년 동월</span>
          <div className="trend-toggle-group trend-toggle-group--primary yoy-toggle-row">
            {TOGGLE_SERVICES.map((svc) => {
              const isNewOnly = svc === '통합회원';
              const key = isNewOnly ? newSeriesKey(svc) : mauSeriesKey(svc);
              const st = SERIES_STYLE[key];
              const on = visible[svc] !== false;
              return (
                <label key={svc} className={`trend-trace-toggle${on ? '' : ' trend-trace-toggle-off'}`}>
                  <input type="checkbox" checked={on} onChange={() => toggleSeries(svc)} />
                  <span className="trend-swatch" style={{ background: st.color, opacity: on ? 1 : 0.35 }} />
                  <span>{isNewOnly ? `${svc} (신규)` : svc}</span>
                </label>
              );
            })}
          </div>
        </div>
        <button type="button" className="btn trend-fs-btn" onClick={toggleFullscreen}>
          {isFs ? '전체 화면 종료' : '전체 화면'}
        </button>
      </div>
      <p className="yoy-range-note">
        선택 기간의 각 월과 <strong>전년 동월</strong>을 같은 월 축에 겹쳐 표시합니다. (예: 2024-03 당월 vs
        2023-03)
      </p>
      <div className="yoy-compare-grid">
        {panelDefs.map((d, idx) => (
          <div key={d.kind} className="yoy-chart-panel">
            <div ref={plotRefs[idx]} style={{ width: '100%', height: 300 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
