import type { DailyMetricRow } from '../types';

/** fetch 실패 시에도 레이아웃 검증용 최소 샘플 */
export function buildSampleDaily(): DailyMetricRow[] {
  const services = [
    'NE Tutor',
    '문법문제뱅크',
    '문법예문검색',
    'NELT',
    '어휘출제마법사',
    '클래스카드',
    '교재자료',
  ];
  const out: DailyMetricRow[] = [];
  for (let m = 0; m < 6; m++) {
    for (let d = 1; d <= 28; d++) {
      const month = 9 + m;
      const date = `2025-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      for (const service of services) {
        const base =
          service === 'NE Tutor'
            ? 80000
            : service === '문법문제뱅크' || service === '문법예문검색'
              ? 8000
              : 15000;
        const noise = (m + d) % 7;
        out.push({
          sourceFile: `${service} M.html`,
          service,
          device: 'M',
          date,
          newUsers: Math.round(50 + noise * 10),
          activeUsers: Math.round(base * (1 + noise * 0.01)),
          totalUsers: 0,
          views: Math.round(base * 3),
          returningUsers: Math.round(base * 0.25),
          dauMau: 0.3,
        });
        out.push({
          sourceFile: `${service} PC.html`,
          service,
          device: 'PC',
          date,
          newUsers: Math.round(40 + noise * 8),
          activeUsers: Math.round(base * 0.4 * (1 + noise * 0.01)),
          totalUsers: 0,
          views: Math.round(base * 1.2),
          returningUsers: Math.round(base * 0.1),
          dauMau: 0.25,
        });
      }
    }
  }
  return out;
}
