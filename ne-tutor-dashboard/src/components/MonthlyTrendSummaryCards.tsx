import { useMemo } from 'react';
import type { MonthlyByDeviceRow } from '../types';
import { listMonthsBetweenInclusive } from '../utils/monthRange';

const SHARE_SERVICES: { key: string; label: string }[] = [
  { key: 'NELT', label: 'NELT' },
  { key: '문법문제', label: '문법문제' },
  { key: '문법예문', label: '문법예문' },
  { key: '어휘출제', label: '어휘출제' },
  { key: '클래스카드', label: '클래스카드' },
];

function fmtInt(n: number): string {
  return new Intl.NumberFormat('ko-KR').format(Math.round(n));
}

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

/** 차트·원시와 동일한 디바이스 합산 규칙 */
function mauForSelection(r: MonthlyByDeviceRow, showPC: boolean, showMobile: boolean): number {
  let v = 0;
  if (showPC) v += r.pcMau;
  if (showMobile) v += r.moMau;
  return v;
}

function newForSelection(r: MonthlyByDeviceRow, showPC: boolean, showMobile: boolean): number {
  let v = 0;
  if (showPC) v += r.pcNew;
  if (showMobile) v += r.moNew;
  if (r.service === '통합회원' && showPC && showMobile) v += r.teacherNew;
  return v;
}

function deviceHint(showPC: boolean, showMobile: boolean): string {
  if (showPC && showMobile) return 'PC+Mobile 합산';
  if (showPC) return 'PC만';
  return 'Mobile만';
}

/**
 * 월별 검색 구간·PC/Mobile 선택에 맞춘 요약 카드.
 * - NE Tutor: 구간 내 월별 MAU·신규의 산술평균
 * - 주요 서비스: 동일 기간 월별 MAU 평균을 NE Tutor 월별 MAU 평균으로 나눈 비중(%)
 */
export function MonthlyTrendSummaryCards(props: {
  monthlyByDevice: readonly MonthlyByDeviceRow[];
  rangeStart: string;
  rangeEnd: string;
  showPC: boolean;
  showMobile: boolean;
}) {
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
    const nSvc = new Map<string, number>();

    for (const mo of months) {
      const m = byMonth.get(mo);
      const tutor = m?.get('NE Tutor');
      if (tutor) {
        sumTutorMau += mauForSelection(tutor, showPC, showMobile);
        sumTutorNew += newForSelection(tutor, showPC, showMobile);
        nTutor += 1;
      }
      for (const { key } of SHARE_SERVICES) {
        const row = m?.get(key);
        if (row) {
          sumSvcMau.set(key, (sumSvcMau.get(key) ?? 0) + mauForSelection(row, showPC, showMobile));
          nSvc.set(key, (nSvc.get(key) ?? 0) + 1);
        }
      }
    }

    const avgTutorMau = nTutor > 0 ? sumTutorMau / nTutor : null;
    const avgTutorNew = nTutor > 0 ? sumTutorNew / nTutor : null;

    const shares: { key: string; label: string; pct: number | null }[] = SHARE_SERVICES.map(({ key, label }) => {
      const n = nSvc.get(key) ?? 0;
      if (n === 0 || avgTutorMau == null || avgTutorMau <= 0) return { key, label, pct: null };
      const avgSvc = (sumSvcMau.get(key) ?? 0) / n;
      return { key, label, pct: (avgSvc / avgTutorMau) * 100 };
    });

    return {
      monthCount: months.length,
      dataMonths: nTutor,
      avgTutorMau,
      avgTutorNew,
      shares,
      hint: deviceHint(showPC, showMobile),
    };
  }, [props.monthlyByDevice, props.rangeStart, props.rangeEnd, props.showPC, props.showMobile]);

  return (
    <div className="monthly-trend-summary" aria-label="월별 요약 지표">
      <p className="monthly-trend-summary-meta">
        선택 기간 {stats.monthCount}개월 · {stats.hint}
        {stats.dataMonths === 0 ? ' · NE Tutor 데이터 없음' : ''}
      </p>
      <div className="monthly-trend-summary-grid monthly-trend-summary-grid--cols7">
        <div className="monthly-trend-card">
          <div className="monthly-trend-card-kicker">NE Tutor</div>
          <div className="monthly-trend-card-title">기간 평균 MAU</div>
          <div className="monthly-trend-card-value">
            {stats.avgTutorMau != null ? `${fmtInt(stats.avgTutorMau)}명` : '—'}
          </div>
          <div className="monthly-trend-card-note">월별 MAU의 산술평균</div>
        </div>
        <div className="monthly-trend-card">
          <div className="monthly-trend-card-kicker">NE Tutor</div>
          <div className="monthly-trend-card-title">기간 평균 신규사용자</div>
          <div className="monthly-trend-card-value">
            {stats.avgTutorNew != null ? `${fmtInt(stats.avgTutorNew)}명` : '—'}
          </div>
          <div className="monthly-trend-card-note">월별 신규 사용자 수의 산술평균</div>
        </div>
        {stats.shares.map((s) => (
          <div key={s.key} className="monthly-trend-card">
            <div className="monthly-trend-card-kicker">{s.label}</div>
            <div className="monthly-trend-card-title">MAU 비중</div>
            <div className="monthly-trend-card-value monthly-trend-card-value--accent">{fmtPct(s.pct)}</div>
            <div className="monthly-trend-card-note">NE Tutor 대비(월 평균 MAU 기준)</div>
          </div>
        ))}
      </div>
    </div>
  );
}
