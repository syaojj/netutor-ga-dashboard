import { useEffect, useMemo, useRef, useState } from 'react';
import type { EbookMonthlyRow, MonthlyByDeviceRow } from '../types';
import { listMonthsBetweenInclusive } from '../utils/monthRange';
import { SERIES_STYLE, type TrendSeriesName } from './trendSeriesConfig';

const SHARE_SERVICES: { key: string; label: string }[] = [
  { key: 'NELT', label: 'NELT' },
  { key: '문법문제', label: '문법문제뱅크' },
  { key: '어휘출제', label: '어휘출제마법사' },
  { key: '클래스카드', label: '클래스카드' },
];

function svcSeriesColors(key: string): { mau: string; neu: string } {
  const mau = SERIES_STYLE[`${key} MAU` as TrendSeriesName]?.color ?? '#93c5fd';
  const neu = SERIES_STYLE[`${key} 신규사용자` as TrendSeriesName]?.color ?? '#93c5fd';
  return { mau, neu };
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat('ko-KR').format(Math.round(n));
}

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

/** 선택 기간 월평균 — 정보 버튼 클릭 시 레이어에 표시 */
const MONTHLY_AVG_HELP_TOOLTIP =
  '[NE Tutor] 구간 내 각 월 값의 산술평균이며, 선택 기간 전체의 고유 사용자 수는 아닙니다.\n\n[서비스별] 선택 기간 내 월별 MAU 평균입니다. 동일 사용자가 여러 월에 방문한 경우 각 월의 MAU에 포함됩니다.';

/** 차트·원시와 동일한 디바이스 합산 규칙. PC+MO인데 모바일 결측(null)이면 해당 월 합계는 null */
function mauForSelection(r: MonthlyByDeviceRow, showPC: boolean, showMobile: boolean): number | null {
  if (showPC && showMobile) {
    if (r.moMau == null) return null;
    if (r.pcMau == null) return null;
    return r.pcMau + r.moMau;
  }
  if (showPC && !showMobile) return r.pcMau;
  if (!showPC && showMobile) return r.moMau;
  return null;
}

function newForSelection(r: MonthlyByDeviceRow, showPC: boolean, showMobile: boolean): number | null {
  if (showPC && showMobile) {
    if (r.moNew == null || r.pcNew == null) return null;
    let v = r.pcNew + r.moNew;
    if (r.service === '통합회원') {
      if (r.teacherNew == null) return null;
      v += r.teacherNew;
    }
    return v;
  }
  if (showPC && !showMobile) return r.pcNew;
  if (!showPC && showMobile) return r.moNew;
  return null;
}

function deviceHint(showPC: boolean, showMobile: boolean): string {
  if (showPC && showMobile) return 'PC+Mobile 합산';
  if (showPC) return 'PC만';
  return 'Mobile만';
}

/** E-Book·부가자료 카드 색 — 월별 추이 차트 LAW MAU 시리즈와 동일 */
const EBOOK_MAU_COLOR = SERIES_STYLE['E-Book MAU'].color;
const SUP_MAU_COLOR = SERIES_STYLE['부가자료(개별) MAU'].color;

/**
 * 월별 구간·PC/Mobile 선택에 따른 요약 카드.
 * NE Tutor를 비교 기준으로 서비스별 월평균과 비중(%)을 표시.
 * E-Book·부가자료(LAW)는 월간 xlsx E-Book 시트 기준 구간 월평균 MAU와 NE Tutor 월평균 MAU 대비 %를 표시합니다.
 */
export function MonthlyTrendSummaryCards(props: {
  monthlyByDevice: readonly MonthlyByDeviceRow[];
  ebookMonthly: readonly EbookMonthlyRow[];
  rangeStart: string;
  rangeEnd: string;
  showPC: boolean;
  showMobile: boolean;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!helpOpen) return;
    const onDocDown = (e: MouseEvent) => {
      const el = helpRootRef.current;
      if (el && !el.contains(e.target as Node)) setHelpOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [helpOpen]);

  useEffect(() => {
    if (!helpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHelpOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [helpOpen]);

  const stats = useMemo(() => {
    const months = listMonthsBetweenInclusive(props.rangeStart, props.rangeEnd);
    const { showPC, showMobile } = props;
    const byMonth = new Map<string, Map<string, MonthlyByDeviceRow>>();
    for (const r of props.monthlyByDevice) {
      if (!byMonth.has(r.month)) byMonth.set(r.month, new Map());
      byMonth.get(r.month)!.set(r.service, r);
    }

    let sumTutorMau = 0;
    let sumTutorNew = 0;
    let nTutor = 0;
    const sumSvcMau = new Map<string, number>();
    const nSvcMau = new Map<string, number>();
    const sumSvcNew = new Map<string, number>();
    const nSvcNew = new Map<string, number>();

    for (const mo of months) {
      const m = byMonth.get(mo);
      const tutor = m?.get('NE Tutor');
      if (tutor) {
        const mv = mauForSelection(tutor, showPC, showMobile);
        const nv = newForSelection(tutor, showPC, showMobile);
        if (mv != null && nv != null) {
          sumTutorMau += mv;
          sumTutorNew += nv;
          nTutor += 1;
        }
      }
      for (const { key } of SHARE_SERVICES) {
        const row = m?.get(key);
        if (!row) continue;
        const mv = mauForSelection(row, showPC, showMobile);
        const nv = newForSelection(row, showPC, showMobile);
        if (mv != null) {
          sumSvcMau.set(key, (sumSvcMau.get(key) ?? 0) + mv);
          nSvcMau.set(key, (nSvcMau.get(key) ?? 0) + 1);
        }
        if (nv != null) {
          sumSvcNew.set(key, (sumSvcNew.get(key) ?? 0) + nv);
          nSvcNew.set(key, (nSvcNew.get(key) ?? 0) + 1);
        }
      }
    }

    const avgTutorMau = nTutor > 0 ? sumTutorMau / nTutor : null;
    const avgTutorNew = nTutor > 0 ? sumTutorNew / nTutor : null;

    const shares = SHARE_SERVICES.map(({ key, label }) => {
      const nM = nSvcMau.get(key) ?? 0;
      const nN = nSvcNew.get(key) ?? 0;
      const mauPct =
        nM === 0 || avgTutorMau == null || avgTutorMau <= 0
          ? null
          : ((sumSvcMau.get(key) ?? 0) / nM / avgTutorMau) * 100;
      const newPct =
        nN === 0 || avgTutorNew == null || avgTutorNew <= 0
          ? null
          : ((sumSvcNew.get(key) ?? 0) / nN / avgTutorNew) * 100;
      const avgMau = nM > 0 ? (sumSvcMau.get(key) ?? 0) / nM : null;
      const avgNew = nN > 0 ? (sumSvcNew.get(key) ?? 0) / nN : null;
      return { key, label, mauPct, newPct, avgMau, avgNew };
    });

    const ebookByMonth = new Map(props.ebookMonthly.map((r) => [r.monthKey, r]));
    let sumUser = 0;
    let nUser = 0;
    let sumInd = 0;
    let nInd = 0;
    for (const mo of months) {
      const row = ebookByMonth.get(mo);
      if (!row) continue;
      if (row.lawEbookUniqueUsers != null) {
        sumUser += row.lawEbookUniqueUsers;
        nUser += 1;
      }
      if (row.lawSupplementaryIndividualDownloads != null) {
        sumInd += row.lawSupplementaryIndividualDownloads;
        nInd += 1;
      }
    }

    const avgEbookUsers = nUser > 0 ? sumUser / nUser : null;
    const avgSupInd = nInd > 0 ? sumInd / nInd : null;

    const ebookMauPct =
      avgEbookUsers != null && avgTutorMau != null && avgTutorMau > 0
        ? (avgEbookUsers / avgTutorMau) * 100
        : null;
    const supMauPct =
      avgSupInd != null && avgTutorMau != null && avgTutorMau > 0
        ? (avgSupInd / avgTutorMau) * 100
        : null;

    return {
      monthCount: months.length,
      dataMonths: nTutor,
      avgTutorMau,
      avgTutorNew,
      shares,
      hint: deviceHint(showPC, showMobile),
      avgEbookUsers,
      ebookMauPct,
      avgSupInd,
      supMauPct,
    };
  }, [props.monthlyByDevice, props.ebookMonthly, props.rangeStart, props.rangeEnd, props.showPC, props.showMobile]);

  return (
    <div className="monthly-trend-summary monthly-trend-summary--flat" aria-label="선택 기간 월평균 요약">
      <div className="monthly-trend-summary-head-row">
        <div className="monthly-trend-summary-head-line">
          <h3 className="trend-subsection-title monthly-trend-summary-title-line">선택 기간 월평균 요약</h3>
          <span className="monthly-trend-summary-meta-inline">
            집계 구간 {stats.monthCount}개월 · {stats.hint}
            {stats.dataMonths === 0 ? ' · NE Tutor 행 없음' : ''}
          </span>
        </div>
      </div>
      <div className="monthly-trend-summary-lede-block" ref={helpRootRef}>
        <p className="monthly-trend-summary-lede">
          GA에서 월 단위로 중복 제거된 MAU/신규사용자를 선택 기간 개월 수로 평균한 값입니다. 선택 기간 전체 고유 사용자 수와는
          다릅니다.{' '}
          <button
            type="button"
            className="monthly-trend-summary-info"
            aria-expanded={helpOpen}
            aria-controls="monthly-avg-help-layer"
            aria-label="NE Tutor·서비스별 월평균 추가 안내"
            onClick={() => setHelpOpen((v) => !v)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 16v-4M12 8h.01M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2s10 4.477 10 10Z"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </p>
        {helpOpen ? (
          <div
            id="monthly-avg-help-layer"
            className="monthly-trend-summary-help-layer"
            role="region"
            aria-label="월평균 산출 방식 안내"
          >
            <div className="monthly-trend-summary-help-layer__body">{MONTHLY_AVG_HELP_TOOLTIP}</div>
          </div>
        ) : null}
      </div>
      <div className="monthly-trend-summary-grid monthly-trend-summary-grid--fluid">
        <div className="monthly-trend-ne-tower">
          <div className="monthly-trend-card monthly-trend-card--primary">
            <div className="monthly-trend-card-head">
              <span className="monthly-trend-card-title-main">NE Tutor</span>
              <span className="monthly-trend-card-badge">비교 기준</span>
            </div>
            <div className="monthly-trend-card-metrics-row">
              <div className="monthly-trend-card-metric-half">
                <div className="monthly-trend-card-kicker">MAU</div>
                <div className="monthly-trend-card-value monthly-trend-card-value--inline">
                  {stats.avgTutorMau != null ? fmtInt(stats.avgTutorMau) : '—'}
                </div>
              </div>
              <div className="monthly-trend-card-metrics-divider" aria-hidden />
              <div className="monthly-trend-card-metric-half">
                <div className="monthly-trend-card-kicker">신규</div>
                <div className="monthly-trend-card-value monthly-trend-card-value--inline">
                  {stats.avgTutorNew != null ? fmtInt(stats.avgTutorNew) : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>
        {stats.shares.map((s) => {
          const colors = svcSeriesColors(s.key);
          return (
            <div
              key={s.key}
              className="monthly-trend-card monthly-trend-card--compare"
              title="월평균과 NE Tutor 대비 비중(%)"
            >
              <div className="monthly-trend-card-title-main monthly-trend-card-title-main--svc">{s.label}</div>
              <div className="monthly-trend-card-metrics-row">
                <div className="monthly-trend-card-metric-half">
                  <div className="monthly-trend-card-kicker">MAU</div>
                  <div className="monthly-trend-card-value-stack">
                    <span className="monthly-trend-card-value-num" style={{ color: colors.mau }}>
                      {s.avgMau != null ? fmtInt(s.avgMau) : '—'}
                    </span>
                    <span className="monthly-trend-card-value-pct" style={{ color: colors.mau }}>
                      {fmtPct(s.mauPct)}
                    </span>
                  </div>
                </div>
                <div className="monthly-trend-card-metrics-divider" aria-hidden />
                <div className="monthly-trend-card-metric-half">
                  <div className="monthly-trend-card-kicker">신규</div>
                  <div className="monthly-trend-card-value-stack">
                    <span className="monthly-trend-card-value-num" style={{ color: colors.neu }}>
                      {s.avgNew != null ? fmtInt(s.avgNew) : '—'}
                    </span>
                    <span className="monthly-trend-card-value-pct" style={{ color: colors.neu }}>
                      {fmtPct(s.newPct)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div
          className="monthly-trend-card monthly-trend-card--compare monthly-trend-card--metric-single"
          title="월간 xlsx E-Book 시트 · 구간 월평균 · %는 NE Tutor 월평균 MAU 대비"
        >
          <div className="monthly-trend-card-title-main monthly-trend-card-title-main--svc">E-Book</div>
          <div className="monthly-trend-card-metrics-row">
            <div className="monthly-trend-card-metric-half">
              <div className="monthly-trend-card-kicker">MAU</div>
              <div className="monthly-trend-card-value-stack">
                <span className="monthly-trend-card-value-num" style={{ color: EBOOK_MAU_COLOR }}>
                  {stats.avgEbookUsers != null ? fmtInt(stats.avgEbookUsers) : '—'}
                </span>
                <span className="monthly-trend-card-value-pct" style={{ color: EBOOK_MAU_COLOR }}>
                  {fmtPct(stats.ebookMauPct)}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div
          className="monthly-trend-card monthly-trend-card--compare monthly-trend-card--metric-single"
          title="월간 xlsx E-Book 시트 부가자료 행 · %는 NE Tutor 월평균 MAU 대비"
        >
          <div className="monthly-trend-card-title-main monthly-trend-card-title-main--svc">부가자료(개별다운)</div>
          <div className="monthly-trend-card-metrics-row">
            <div className="monthly-trend-card-metric-half">
              <div className="monthly-trend-card-kicker">MAU</div>
              <div className="monthly-trend-card-value-stack">
                <span className="monthly-trend-card-value-num" style={{ color: SUP_MAU_COLOR }}>
                  {stats.avgSupInd != null ? fmtInt(stats.avgSupInd) : '—'}
                </span>
                <span className="monthly-trend-card-value-pct" style={{ color: SUP_MAU_COLOR }}>
                  {fmtPct(stats.supMauPct)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
