/** rangeStart/rangeEnd 가 YYYY-MM-DD 이면 월 키(YYYY-MM) 구간을 닫힌 목록으로 반환 */
export function listMonthsBetweenInclusive(rangeStart: string, rangeEnd: string): string[] {
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
