/**
 * ne_tutor_event_cards_v2.html 스타일의 카드 그리드.
 * 검색 구간(월)에 기준일이 포함된 ECOSYSTEM_EVENTS만 표시하고,
 * NE Tutor 월간 통합 행으로 이벤트 전후 7개월(T-3~T+3) 추이·전월 대비 증감%를 연결합니다.
 */
import { useMemo, useRef, useState, type MouseEvent } from 'react';
import type { EcosystemEvent, MonthlyByDeviceRow } from '../types';
import { addCalendarMonths, toMonthKey } from '../utils/dateUtil';

const NE = 'NE Tutor';

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
      return { cls: 'event-card-badge event-card-badge--open', label: '오픈' };
    case 'launch':
      return { cls: 'event-card-badge event-card-badge--open', label: '출시' };
    case 'end':
      return { cls: 'event-card-badge event-card-badge--close', label: '종료' };
    case 'reform':
      return { cls: 'event-card-badge event-card-badge--event', label: '개편' };
    default:
      return { cls: 'event-card-badge', label: ev.type };
  }
}

function accentColor(ev: EcosystemEvent): string {
  switch (ev.type) {
    case 'open':
      return '#10b981';
    case 'launch':
      return '#3b82f6';
    case 'end':
      return '#ef4444';
    case 'reform':
      return '#f59e0b';
    default:
      return '#64748b';
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
}

function buildMetricPack(
  byMonth: Map<string, Map<string, MonthlyByDeviceRow>>,
  anchorMonth: string,
): MetricPack | null {
  const prevM = addCalendarMonths(anchorMonth, -1);
  const cur = neRow(byMonth, anchorMonth);
  const prev = neRow(byMonth, prevM);
  if (!cur && !prev) return null;

  const read = (r: MonthlyByDeviceRow | undefined) =>
    r
      ? {
          pcMau: r.pcMau,
          pcNew: r.pcNew,
          moMau: r.moMau,
          moNew: r.moNew,
        }
      : { pcMau: null as number | null, pcNew: null as number | null, moMau: null as number | null, moNew: null as number | null };

  const c = read(cur);
  const p = read(prev);

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
    pcMauMom: momPct(c.pcMau, p.pcMau),
    pcNewMom: momPct(c.pcNew, p.pcNew),
    moMauMom: momPct(c.moMau, p.moMau),
    moNewMom: momPct(c.moNew, p.moNew),
    pcMauSeries,
    pcNewSeries,
    moMauSeries,
    moNewSeries,
    moAllNull,
  };
}

function statusFrom(m: MetricPack): { cls: string; line: string; sub: string } {
  const vals = [m.pcMauMom, m.pcNewMom, m.moMauMom, m.moNewMom].filter((v) => v != null && Number.isFinite(v)) as number[];
  if (vals.length === 0) return { cls: 'event-card-status event-card-status--neut', line: '데이터 없음', sub: '' };
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (avg > 3) return { cls: 'event-card-status event-card-status--up', line: '↗ 전월 대비 상승', sub: 'NE Tutor 합산 지표' };
  if (avg < -3) return { cls: 'event-card-status event-card-status--dn', line: '↘ 전월 대비 하락', sub: 'NE Tutor 합산 지표' };
  return { cls: 'event-card-status event-card-status--neut', line: '→ 혼조·유지', sub: 'NE Tutor 합산 지표' };
}

const SPARK_X_LABELS = ['T-3', 'T-2', 'T-1', '이벤트', 'T+1', 'T+2', 'T+3'] as const;

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
  const vbH = 96;
  const padL = 42;
  const padR = 6;
  const padB = 22;
  const padT = 6;
  const plotW = vbW - padL - padR;
  const plotH = vbH - padT - padB;

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
        {SPARK_X_LABELS.map((lab, i) => {
          const x = xs[i];
          return (
            <text
              key={lab}
              x={x}
              y={vbH - 4}
              textAnchor="middle"
              fill="currentColor"
              fillOpacity={0.65}
              fontSize="9"
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
      {tip && (
        <div
          className="event-card-spark-tooltip"
          style={{
            left: Math.min(tip.left + 10, (wrapRef.current?.clientWidth ?? 300) - 172),
            top: Math.max(4, tip.top - 108),
          }}
        >
          <div className="event-card-spark-tooltip-title">{SPARK_X_LABELS[tip.idx]}</div>
          {(
            [
              ['PC MAU', fmtSparkInt(metrics.pcMauSeries[tip.idx])],
              ['PC 신규', fmtSparkInt(metrics.pcNewSeries[tip.idx])],
              ['모바일 MAU', fmtSparkInt(metrics.moMauSeries[tip.idx])],
              ['모바일 신규', fmtSparkInt(metrics.moNewSeries[tip.idx])],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="event-card-spark-tooltip-row">
              <span>{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      )}
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
    <div className="event-cards-panel" aria-label="서비스별 이벤트 전후 NE Tutor 지표">
      <p className="event-cards-panel-lede">
        이벤트 기준월 대비 <strong>전월 대비 증감%</strong> · PC·Mobile × MAU·신규 4지표 · 스파크라인: 전월 3개월 → 기준월 →
        후월 3개월
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
            const ac = accentColor(ev);
            const st = statusFrom(metrics);
            return (
              <article key={ev.id} className="event-card">
                <div className="event-card-accent" style={{ background: ac }} />
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
                    <div className="event-card-device event-card-device--pc">PC</div>
                    <div className="event-card-kind">MAU 전월 대비</div>
                    <div className={valCls(metrics.pcMauMom)}>
                      {arrowFor(metrics.pcMauMom)}
                      {fmtMom(metrics.pcMauMom)}
                    </div>
                  </div>
                  <div className="event-card-metric-cell">
                    <div className="event-card-device event-card-device--pc">PC</div>
                    <div className="event-card-kind">신규 전월 대비</div>
                    <div className={valCls(metrics.pcNewMom)}>
                      {arrowFor(metrics.pcNewMom)}
                      {fmtMom(metrics.pcNewMom)}
                    </div>
                  </div>
                  <div className="event-card-metric-cell">
                    <div className="event-card-device event-card-device--mo">모바일</div>
                    <div className="event-card-kind">MAU 전월 대비</div>
                    <div className={valCls(metrics.moMauMom)}>
                      {arrowFor(metrics.moMauMom)}
                      {fmtMom(metrics.moMauMom)}
                    </div>
                  </div>
                  <div className="event-card-metric-cell">
                    <div className="event-card-device event-card-device--mo">모바일</div>
                    <div className="event-card-kind">신규 전월 대비</div>
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
                      <i className="event-card-leg-line" style={{ background: ac }} /> PC MAU
                    </span>
                    <span>
                      <i className="event-card-leg-line event-card-leg-line--dash" style={{ borderColor: ac }} /> PC
                      신규
                    </span>
                    <span>
                      <i className="event-card-leg-line" style={{ background: '#a78bfa' }} /> 모바일 MAU
                    </span>
                    <span>
                      <i
                        className="event-card-leg-line event-card-leg-line--dash"
                        style={{ borderColor: '#a78bfa' }}
                      />{' '}
                      모바일 신규
                    </span>
                  </div>
                  <EventWindowSpark color={ac} colorMo="#a78bfa" metrics={metrics} />
                </div>
                {metrics.moAllNull ? <p className="event-card-note">* 해당 구간 모바일 NE Tutor 행이 없거나 전부 결측입니다.</p> : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
