/**
 * ne_tutor_event_cards_v2.html 스타일의 카드 그리드.
 * 검색 구간(월)에 기준일이 포함된 ECOSYSTEM_EVENTS만 표시하고,
 * NE Tutor 월간 통합 행으로 이벤트 전후 7개월(T-3~T+3) 스파크·기준월(M) 대비 이후 3개월(M+1~M+3) 평균 증감%를 연결합니다.
 */
import { useMemo, useRef, useState, type MouseEvent } from 'react';
import type { EcosystemEvent, MonthlyByDeviceRow } from '../types';
import { addCalendarMonths, toMonthKey } from '../utils/dateUtil';
import { SERIES_STYLE } from './trendSeriesConfig';

const NE = 'NE Tutor';

/** 스파크·범례 PC선 — 이벤트 유형과 무관(NE Tutor MAU와 동일 톤) */
const EVENT_CARD_PC_LINE = SERIES_STYLE['NE Tutor MAU'].color;
const EVENT_CARD_MO_LINE = '#a78bfa';

type CardFilter = 'all' | 'open' | 'close' | 'event';

function buildByMonth(rows: readonly MonthlyByDeviceRow[]) {
  const map = new Map<string, Map<string, MonthlyByDeviceRow>>();
  for (const r of rows) {
    if (!map.has(r.month)) map.set(r.month, new Map());
    map.get(r.month)!.set(r.service, r);
  }
  return map;
}

function neRow(byMonth: Map<string, Map<string, MonthlyByDeviceRow>>, m: string) {
  return byMonth.get(m)?.get(NE);
}

function momPct(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function filterKey(ev: EcosystemEvent): CardFilter {
  if (ev.type === 'open' || ev.type === 'launch') return 'open';
  if (ev.type === 'end') return 'close';
  return 'event';
}

function badgeFor(ev: EcosystemEvent): { cls: string; label: string } {
  switch (ev.type) {
    case 'open':
      return { cls: 'event-card-badge event-card-badge--neutral', label: '오픈' };
    case 'launch':
      return { cls: 'event-card-badge event-card-badge--neutral', label: '출시' };
    case 'end':
      return { cls: 'event-card-badge event-card-badge--neutral', label: '종료' };
    case 'reform':
      return { cls: 'event-card-badge event-card-badge--neutral', label: '개편' };
    default:
      return { cls: 'event-card-badge event-card-badge--neutral', label: ev.type };
  }
}

function fmtMom(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

function valCls(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return 'event-card-val event-card-val--na';
  if (Math.abs(v) < 0.05) return 'event-card-val event-card-val--neut';
  return v > 0 ? 'event-card-val event-card-val--up' : 'event-card-val event-card-val--dn';
}

function arrowFor(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '';
  if (Math.abs(v) < 0.05) return '→ ';
  return v > 0 ? '▲ ' : '▼ ';
}

interface MetricPack {
  pcMauMom: number | null;
  pcNewMom: number | null;
  moMauMom: number | null;
  moNewMom: number | null;
  pcMauSeries: (number | null)[];
  pcNewSeries: (number | null)[];
  moMauSeries: (number | null)[];
  moNewSeries: (number | null)[];
  moAllNull: boolean;
  /** 스파크 X축 순서와 동일한 YYYY-MM (기준월 전후 각 3개월) */
  sparkMonthKeys: string[];
}

/** M+1·M+2·M+3 세 달 값이 모두 있을 때만 산술평균, 하나라도 없으면 null */
function mean3After(
  a: number | null | undefined,
  b: number | null | undefined,
  c: number | null | undefined,
): number | null {
  if (a == null || b == null || c == null) return null;
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return null;
  return (a + b + c) / 3;
}

function buildMetricPack(
  byMonth: Map<string, Map<string, MonthlyByDeviceRow>>,
  anchorMonth: string,
): MetricPack | null {
  /** 기준월(M) 단일값 대비, 이후 3개월(M+1~M+3) 산술평균의 증감% (M+3 한 달만 비교하지 않음) */
  const m1 = addCalendarMonths(anchorMonth, 1);
  const m2 = addCalendarMonths(anchorMonth, 2);
  const m3 = addCalendarMonths(anchorMonth, 3);
  const rowAnchor = neRow(byMonth, anchorMonth);
  const r1 = neRow(byMonth, m1);
  const r2 = neRow(byMonth, m2);
  const r3 = neRow(byMonth, m3);
  if (!rowAnchor && !r1 && !r2 && !r3) return null;

  const read = (r: MonthlyByDeviceRow | undefined) =>
    r
      ? {
          pcMau: r.pcMau,
          pcNew: r.pcNew,
          moMau: r.moMau,
          moNew: r.moNew,
        }
      : { pcMau: null as number | null, pcNew: null as number | null, moMau: null as number | null, moNew: null as number | null };

  const base = read(rowAnchor);
  const afterPcMau = mean3After(r1?.pcMau, r2?.pcMau, r3?.pcMau);
  const afterPcNew = mean3After(r1?.pcNew, r2?.pcNew, r3?.pcNew);
  const afterMoMau = mean3After(r1?.moMau, r2?.moMau, r3?.moMau);
  const afterMoNew = mean3After(r1?.moNew, r2?.moNew, r3?.moNew);

  const months: string[] = [];
  for (let d = -3; d <= 3; d++) months.push(addCalendarMonths(anchorMonth, d));

  const seriesFor = (key: 'pcMau' | 'pcNew' | 'moMau' | 'moNew') =>
    months.map((m) => {
      const row = neRow(byMonth, m);
      if (!row) return null;
      return row[key];
    });

  const pcMauSeries = seriesFor('pcMau');
  const pcNewSeries = seriesFor('pcNew');
  const moMauSeries = seriesFor('moMau');
  const moNewSeries = seriesFor('moNew');
  const moAllNull = [...moMauSeries, ...moNewSeries].every((v) => v == null);

  return {
    pcMauMom: momPct(afterPcMau, base.pcMau),
    pcNewMom: momPct(afterPcNew, base.pcNew),
    moMauMom: momPct(afterMoMau, base.moMau),
    moNewMom: momPct(afterMoNew, base.moNew),
    pcMauSeries,
    pcNewSeries,
    moMauSeries,
    moNewSeries,
    moAllNull,
    sparkMonthKeys: months,
  };
}

function statusFrom(m: MetricPack): { cls: string; line: string; sub: string } {
  const vals = [m.pcMauMom, m.pcNewMom, m.moMauMom, m.moNewMom].filter((v) => v != null && Number.isFinite(v)) as number[];
  if (vals.length === 0) return { cls: 'event-card-status event-card-status--neut', line: '데이터 없음', sub: '' };
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (avg > 3) return { cls: 'event-card-status event-card-status--up', line: '↗ 후속 3개월 평균 상승', sub: 'NE Tutor 전체 기준' };
  if (avg < -3) return { cls: 'event-card-status event-card-status--dn', line: '↘ 후속 3개월 평균 하락', sub: 'NE Tutor 전체 기준' };
  return { cls: 'event-card-status event-card-status--neut', line: '→ 혼조·유지', sub: 'NE Tutor 전체 기준' };
}

/** YYYY-MM → '26-01 */
function formatSparkMonthLabel(ym: string): string {
  if (ym.length < 7) return ym;
  return `'${ym.slice(2, 4)}-${ym.slice(5, 7)}`;
}

function fmtSparkInt(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('ko-KR').format(Math.round(n));
}

function fmtSparkAxis(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}천`;
  return String(Math.round(n));
}

function EventWindowSpark({ color, colorMo, metrics }: { color: string; colorMo: string; metrics: MetricPack }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{
    idx: number;
    left: number;
    top: number;
  } | null>(null);

  const vbW = 300;
  const vbH = 100;
  const padL = 42;
  const padR = 6;
  const padB = 28;
  const padT = 6;
  const plotW = vbW - padL - padR;
  const plotH = vbH - padT - padB;

  const sparkLabels = useMemo(
    () => metrics.sparkMonthKeys.map(formatSparkMonthLabel),
    [metrics.sparkMonthKeys],
  );

  const n = metrics.pcMauSeries.length;
  const xs = metrics.pcMauSeries.map((_, i) => padL + (i / Math.max(1, n - 1)) * plotW);

  const { lo, hi, yTicks } = useMemo(() => {
    const allVals: number[] = [];
    for (const arr of [metrics.pcMauSeries, metrics.pcNewSeries, metrics.moMauSeries, metrics.moNewSeries]) {
      for (const v of arr) {
        if (v != null && Number.isFinite(v) && v > 0) allVals.push(v);
      }
    }
    let min = allVals.length ? Math.min(...allVals) : 0;
    let max = allVals.length ? Math.max(...allVals) : 1;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
      min = 0;
      max = max > 0 ? max : 1;
    }
    const span = max - min || 1;
    const lo = min - span * 0.06;
    const hi = max + span * 0.06;
    const yTicks = [hi, (hi + lo) / 2, lo];
    return { lo, hi, yTicks };
  }, [metrics.pcMauSeries, metrics.pcNewSeries, metrics.moMauSeries, metrics.moNewSeries]);

  const yAt = (v: number | null) => {
    if (v == null || !Number.isFinite(v) || v <= 0) return null;
    const t = (v - lo) / (hi - lo || 1);
    return padT + (1 - t) * plotH;
  };

  const yScale = (tv: number) => padT + (1 - (tv - lo) / (hi - lo || 1)) * plotH;

  const pathD = (vals: (number | null)[]) => {
    let d = '';
    for (let i = 0; i < vals.length; i++) {
      const y = yAt(vals[i]);
      if (y == null) continue;
      const x = xs[i];
      d += d ? ` L${x.toFixed(1)},${y.toFixed(1)}` : `M${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return d || null;
  };

  const d1 = pathD(metrics.pcMauSeries);
  const d2 = pathD(metrics.pcNewSeries);
  const d3 = pathD(metrics.moMauSeries);
  const d4 = pathD(metrics.moNewSeries);

  const onLeave = () => setTip(null);
  const onMove = (i: number, e: MouseEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setTip({
      idx: i,
      left: e.clientX - r.left,
      top: e.clientY - r.top,
    });
  };

  const band = plotW / Math.max(1, n);

  return (
    <div ref={wrapRef} className="event-card-spark-wrap" onMouseLeave={onLeave}>
      <svg
        className="event-card-spark"
        viewBox={`0 0 ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        {yTicks.map((tv, j) => {
          const yy = yScale(tv);
          return (
            <g key={`yt-${j}`}>
              <line
                x1={padL}
                x2={vbW - padR}
                y1={yy}
                y2={yy}
                stroke="currentColor"
                strokeOpacity={0.12}
                vectorEffect="non-scaling-stroke"
              />
              <text x={4} y={yy + 3} fill="currentColor" fillOpacity={0.55} fontSize="9">
                {fmtSparkAxis(tv)}
              </text>
            </g>
          );
        })}
        {sparkLabels.map((lab, i) => {
          const x = xs[i];
          const yBase = vbH - 3;
          return (
            <text
              key={metrics.sparkMonthKeys[i] ?? i}
              x={x}
              y={yBase}
              transform={`rotate(-28 ${x} ${yBase})`}
              textAnchor="end"
              fill="currentColor"
              fillOpacity={0.68}
              fontSize="8"
            >
              {lab}
            </text>
          );
        })}
        {d1 ? <path d={d1} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" /> : null}
        {d2 ? (
          <path
            d={d2}
            fill="none"
            stroke={color}
            strokeWidth={1.4}
            strokeDasharray="5 4"
            opacity={0.75}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {d3 ? <path d={d3} fill="none" stroke={colorMo} strokeWidth={2} vectorEffect="non-scaling-stroke" /> : null}
        {d4 ? (
          <path
            d={d4}
            fill="none"
            stroke={colorMo}
            strokeWidth={1.4}
            strokeDasharray="5 4"
            opacity={0.75}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {xs.map((x, i) => (
          <rect
            key={`hit-${i}`}
            x={x - Math.max(band, 14) / 2}
            y={padT}
            width={Math.max(band, 14)}
            height={plotH}
            fill="transparent"
            onMouseEnter={(e) => onMove(i, e)}
            onMouseMove={(e) => onMove(i, e)}
          />
        ))}
      </svg>
      {tip && (() => {
        /** 툴팁을 커서 바로 아래에 두고, 하단이 잘리면 커서 위로 옮김 */
        const EST_W = 172;
        const EST_H = 120;
        const GAP = 12;
        const wrap = wrapRef.current;
        const cw = wrap?.clientWidth ?? 300;
        const ch = wrap?.clientHeight ?? 100;
        let left = tip.left + 8;
        left = Math.max(4, Math.min(left, cw - EST_W - 4));
        let top = tip.top + GAP;
        if (top + EST_H > ch - 4) top = tip.top - EST_H - GAP;
        top = Math.max(4, Math.min(top, ch - EST_H - 4));
        return (
        <div
          className="event-card-spark-tooltip"
          style={{ left, top }}
        >
          <div className="event-card-spark-tooltip-title">{sparkLabels[tip.idx]}</div>
          {(
            [
              ['PC MAU', fmtSparkInt(metrics.pcMauSeries[tip.idx])],
              ['PC 신규사용자', fmtSparkInt(metrics.pcNewSeries[tip.idx])],
              ['MOBILE MAU', fmtSparkInt(metrics.moMauSeries[tip.idx])],
              ['MOBILE 신규사용자', fmtSparkInt(metrics.moNewSeries[tip.idx])],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="event-card-spark-tooltip-row">
              <span>{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
        );
      })()}
    </div>
  );
}

export function NeTutorEventCardsPanel(props: {
  monthlyByDevice: readonly MonthlyByDeviceRow[];
  events: readonly EcosystemEvent[];
  rangeStart: string;
  rangeEnd: string;
}) {
  const [filter, setFilter] = useState<CardFilter>('all');

  const byMonth = useMemo(() => buildByMonth(props.monthlyByDevice), [props.monthlyByDevice]);

  const cards = useMemo(() => {
    const lo = toMonthKey(props.rangeStart);
    const hi = toMonthKey(props.rangeEnd);
    const inRange = props.events.filter((ev) => {
      const mk = toMonthKey(ev.anchorDate);
      return mk >= lo && mk <= hi;
    });
    const filtered = filter === 'all' ? inRange : inRange.filter((ev) => filterKey(ev) === filter);
    return filtered
      .map((ev) => {
        const M = toMonthKey(ev.anchorDate);
        const metrics = buildMetricPack(byMonth, M);
        if (!metrics) return null;
        return { ev, M, metrics };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }, [byMonth, props.events, props.rangeStart, props.rangeEnd, filter]);

  return (
    <div className="event-cards-panel" aria-label="서비스 이벤트 전후 3개월 평균 비교 NE Tutor 지표">
      <p className="event-cards-panel-lede">
        이벤트 기준월 값을 기준으로, 이후 3개월(M+1~M+3) 평균과 비교한 증감률입니다. M+3 단일 월 비교가 아니며, PC·MOBILE ×
        MAU·신규사용자 4개 지표를 확인합니다.
      </p>
      <div className="event-cards-filter-row" role="toolbar" aria-label="이벤트 유형 필터">
        <span className="event-cards-filter-label">필터</span>
        {(
          [
            ['all', '전체'],
            ['open', '오픈·출시'],
            ['close', '종료'],
            ['event', '개편'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`event-cards-fbtn${filter === key ? ' event-cards-fbtn--on' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {cards.length === 0 ? (
        <p className="event-cards-empty" role="status">
          선택 구간에 표시할 이벤트가 없거나, NE Tutor 월간 행이 없습니다.
        </p>
      ) : (
        <div className="event-cards-grid">
          {cards.map(({ ev, M, metrics }) => {
            const badge = badgeFor(ev);
            const st = statusFrom(metrics);
            return (
              <article key={ev.id} className="event-card">
                <div className="event-card-accent" aria-hidden />
                <header className="event-card-head">
                  <div className="event-card-name">
                    <span>{ev.name}</span>
                    <span className={badge.cls}>{badge.label}</span>
                  </div>
                  <div className="event-card-date">
                    기준월 {M} · {ev.anchorDate}
                  </div>
                </header>
                <div className="event-card-metrics-4">
                  <div className="event-card-metric-cell">
                    <div className="event-card-device event-card-device--pc event-card-device--heading">PC MAU</div>
                    <div className="event-card-kind-sub">기준월 대비 이후 3개월 평균</div>
                    <div className={valCls(metrics.pcMauMom)}>
                      {arrowFor(metrics.pcMauMom)}
                      {fmtMom(metrics.pcMauMom)}
                    </div>
                  </div>
                  <div className="event-card-metric-cell">
                    <div className="event-card-device event-card-device--pc event-card-device--heading">
                      PC 신규사용자
                    </div>
                    <div className="event-card-kind-sub">기준월 대비 이후 3개월 평균</div>
                    <div className={valCls(metrics.pcNewMom)}>
                      {arrowFor(metrics.pcNewMom)}
                      {fmtMom(metrics.pcNewMom)}
                    </div>
                  </div>
                  <div className="event-card-metric-cell">
                    <div className="event-card-device event-card-device--mo event-card-device--heading">MOBILE MAU</div>
                    <div className="event-card-kind-sub">기준월 대비 이후 3개월 평균</div>
                    <div className={valCls(metrics.moMauMom)}>
                      {arrowFor(metrics.moMauMom)}
                      {fmtMom(metrics.moMauMom)}
                    </div>
                  </div>
                  <div className="event-card-metric-cell">
                    <div className="event-card-device event-card-device--mo event-card-device--heading">
                      MOBILE 신규사용자
                    </div>
                    <div className="event-card-kind-sub">기준월 대비 이후 3개월 평균</div>
                    <div className={valCls(metrics.moNewMom)}>
                      {arrowFor(metrics.moNewMom)}
                      {fmtMom(metrics.moNewMom)}
                    </div>
                  </div>
                </div>
                <div className={st.cls}>
                  <span>{st.line}</span>
                  <span className="event-card-status-sub">{st.sub}</span>
                </div>
                <div className="event-card-chart-wrap">
                  <div className="event-card-legend">
                    <span>
                      <i className="event-card-leg-line" style={{ background: EVENT_CARD_PC_LINE }} /> PC MAU
                    </span>
                    <span>
                      <i
                        className="event-card-leg-line event-card-leg-line--dash"
                        style={{ borderColor: EVENT_CARD_PC_LINE }}
                      />{' '}
                      PC 신규사용자
                    </span>
                    <span>
                      <i className="event-card-leg-line" style={{ background: EVENT_CARD_MO_LINE }} /> MOBILE MAU
                    </span>
                    <span>
                      <i
                        className="event-card-leg-line event-card-leg-line--dash"
                        style={{ borderColor: EVENT_CARD_MO_LINE }}
                      />{' '}
                      MOBILE 신규사용자
                    </span>
                  </div>
                  <EventWindowSpark color={EVENT_CARD_PC_LINE} colorMo={EVENT_CARD_MO_LINE} metrics={metrics} />
                </div>
                {metrics.moAllNull ? (
                  <p className="event-card-note">* 해당 구간 MOBILE NE Tutor 행이 없거나 전부 결측입니다.</p>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
