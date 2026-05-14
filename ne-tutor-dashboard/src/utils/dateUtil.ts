/** YYYYMMDD → YYYY-MM-DD */
export function parseYyyymmdd(raw: string): string | null {
  const s = raw.replace(/\D/g, '');
  if (s.length !== 8) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
}

export function toMonthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** YYYY-MM 달력 delta개월 이동 */
export function addCalendarMonths(ym: string, delta: number): string {
  let y = Number(ym.slice(0, 4));
  let m = Number(ym.slice(5, 7)) - 1 + delta;
  while (m < 0) {
    m += 12;
    y -= 1;
  }
  while (m >= 12) {
    m -= 12;
    y += 1;
  }
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function toYearKey(isoDate: string): string {
  return isoDate.slice(0, 4);
}

export function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime();
  const db = new Date(b + 'T00:00:00Z').getTime();
  return Math.round((db - da) / 86400000);
}

export function clampRange(start: string, end: string, min: string, max: string): { start: string; end: string } {
  const s = start > min ? start : min;
  const e = end < max ? end : max;
  if (s > e) {
    return { start: min, end: max };
  }
  return { start: s, end: e };
}
