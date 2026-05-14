import type { DeviceFilter, MonthlyByDeviceRow, MonthlyMetricRow, YearlyMetricRow } from '../types';

function mauForDevice(r: MonthlyByDeviceRow, device: DeviceFilter): number | null {
  if (device === 'PC') return r.pcMau;
  if (device === 'M') return r.moMau;
  if (r.moMau == null || r.pcMau == null) return null;
  return r.pcMau + r.moMau;
}

function newForDevice(r: MonthlyByDeviceRow, device: DeviceFilter): number | null {
  if (device === 'PC') return r.pcNew;
  if (device === 'M') return r.moNew;
  if (r.moNew == null || r.pcNew == null) return null;
  let base = r.pcNew + r.moNew;
  if (r.service === '통합회원' && device === 'all') {
    if (r.teacherNew == null) return null;
    base += r.teacherNew;
  }
  return base;
}

/** 월간 by-device 행 → 트렌드 차트가 기대하는 MonthlyMetricRow[]로 변환 */
export function monthlyByDeviceToMonthly(
  rows: readonly MonthlyByDeviceRow[],
  device: DeviceFilter,
): MonthlyMetricRow[] {
  return rows.map((r) => ({
    service: r.service,
    device,
    month: r.month,
    newUsersSum: newForDevice(r, device),
    mauEstimate: mauForDevice(r, device),
    viewsSum: 0,
    returningUsersSum: 0,
    returningRateAvg: null,
  }));
}

/**
 * 월간 by-device 행 → 연도별 집계.
 * - MAU: 해당 연도 내 월별 MAU 중 최댓값 (피크); 모바일 결측 월은 PC만 비교할 때만 반영
 * - 신규사용자: 해당 연도 내 월별 합계(결측 월은 합산에서 제외)
 */
export function monthlyByDeviceToYearly(
  rows: readonly MonthlyByDeviceRow[],
  device: DeviceFilter,
): YearlyMetricRow[] {
  const map = new Map<
    string,
    {
      service: string;
      year: string;
      mau: number | null;
      newUsers: number | null;
    }
  >();
  for (const r of rows) {
    const year = r.month.slice(0, 4);
    const key = `${r.service}|${year}`;
    const prev = map.get(key) ?? { service: r.service, year, mau: null as number | null, newUsers: null };
    const m = mauForDevice(r, device);
    if (m != null) prev.mau = prev.mau == null ? m : Math.max(prev.mau, m);

    const n = newForDevice(r, device);
    if (n == null) prev.newUsers = null;
    else prev.newUsers = prev.newUsers == null ? n : prev.newUsers + n;

    map.set(key, prev);
  }
  return [...map.values()]
    .sort((a, b) => a.service.localeCompare(b.service) || a.year.localeCompare(b.year))
    .map((v) => ({
      service: v.service,
      device,
      year: v.year,
      newUsersSum: v.newUsers,
      mauEstimate: v.mau,
      viewsSum: 0,
      returningUsersSum: 0,
      returningRateAvg: null,
    }));
}

/** 월간 by-device 행 → 데이터 기간 범위(YYYY-MM-DD) */
export function monthlyByDeviceBounds(
  rows: readonly MonthlyByDeviceRow[],
): { min: string; max: string } | null {
  if (rows.length === 0) return null;
  const months = rows.map((r) => r.month).sort();
  const min = months[0];
  const max = months[months.length - 1];
  // 월의 시작/끝 일자로 변환 (해당 월말까지 데이터가 있다고 간주)
  const [my, mm] = max.split('-').map(Number);
  const lastDay = new Date(my, mm, 0).getDate();
  return { min: `${min}-01`, max: `${max}-${String(lastDay).padStart(2, '0')}` };
}
