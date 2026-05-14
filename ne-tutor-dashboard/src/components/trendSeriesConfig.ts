/**
 * 월간 트렌드 차트용 시리즈 메타(Plotly와 무관) — 가벼운 모듈로 두어 메인 번들에서 Plotly 분리.
 */

/** 영역 채움(NE Tutor) 대상 시리즈 */
export const AREA_FILL_NAMES = new Set<string>(['NE Tutor MAU', 'NE Tutor 신규사용자']);
/** 막대 그래프로 렌더링할 시리즈 */
export const BAR_NAMES = new Set<string>(['통합회원']);

/** 시리즈명·범례 토글에 동일하게 사용 (※ 표시용 라벨 = 시리즈명) */
export const TREND_SERIES_NAMES = [
  'NE Tutor MAU',
  'NE Tutor 신규사용자',
  '통합회원',
  'NELT MAU',
  'NELT 신규사용자',
  '문법문제 MAU',
  '문법문제 신규사용자',
  '문법예문 MAU',
  '문법예문 신규사용자',
  '어휘출제 MAU',
  '어휘출제 신규사용자',
  '클래스카드 MAU',
  '클래스카드 신규사용자',
  /** 월간 xlsx E-Book 시트 — 이용자수(중복제거) */
  'E-Book MAU',
  /** 월간 xlsx — 부가자료 개별 다운로드(중복제거) */
  '부가자료(개별) MAU',
] as const;

export type TrendSeriesName = (typeof TREND_SERIES_NAMES)[number];

/** 상단(주력) 그룹: NE Tutor + 통합회원 신규가입 */
export const TREND_PRIMARY_NAMES: readonly TrendSeriesName[] = [
  'NE Tutor MAU',
  'NE Tutor 신규사용자',
  '통합회원',
] as const;

/**
 * 하단(서비스) 그룹: 표시 라벨 ↔ 월간 xlsx 시트의 서비스명 매핑.
 * 월간 xlsx는 이미 짧은 이름(NELT/문법문제/문법예문/어휘출제/클래스카드)을 사용한다.
 */
export const TREND_SERVICE_ROW: readonly { display: string; dataService: string }[] = [
  { display: 'NELT', dataService: 'NELT' },
  { display: '문법문제', dataService: '문법문제' },
  { display: '문법예문', dataService: '문법예문' },
  { display: '어휘출제', dataService: '어휘출제' },
  { display: '클래스카드', dataService: '클래스카드' },
] as const;

export const SERIES_STYLE: Record<TrendSeriesName, { color: string; dash: 'solid' | 'dot' }> = {
  'NE Tutor MAU': { color: '#60a5fa', dash: 'solid' },
  'NE Tutor 신규사용자': { color: '#93c5fd', dash: 'dot' },
  통합회원: { color: '#f87171', dash: 'solid' },
  'NELT MAU': { color: '#fbbf24', dash: 'solid' },
  'NELT 신규사용자': { color: '#fcd34d', dash: 'dot' },
  '문법문제 MAU': { color: '#f472b6', dash: 'solid' },
  '문법문제 신규사용자': { color: '#f9a8d4', dash: 'dot' },
  '문법예문 MAU': { color: '#2dd4bf', dash: 'solid' },
  '문법예문 신규사용자': { color: '#5eead4', dash: 'dot' },
  '어휘출제 MAU': { color: '#34d399', dash: 'solid' },
  '어휘출제 신규사용자': { color: '#6ee7b7', dash: 'dot' },
  '클래스카드 MAU': { color: '#a78bfa', dash: 'solid' },
  '클래스카드 신규사용자': { color: '#c4b5fd', dash: 'dot' },
  'E-Book MAU': { color: '#38bdf8', dash: 'solid' },
  '부가자료(개별) MAU': { color: '#f472b6', dash: 'dot' },
};

/** 월별 추이 기본: 통합회원·서비스별 신규 시리즈는 끔, 나머지 켬 */
export function initialTrendSeriesVisibility(): Record<TrendSeriesName, boolean> {
  const v = Object.fromEntries(TREND_SERIES_NAMES.map((n) => [n, true])) as Record<TrendSeriesName, boolean>;
  v['통합회원'] = false;
  for (const s of TREND_SERVICE_ROW) {
    const key = `${s.display} 신규사용자` as TrendSeriesName;
    v[key] = false;
  }
  return v;
}

/**
 * 차트 시리즈·trace 순서(맨 뒤 → 맨 앞, 앞쪽이 먼저 그려져 뒤에 깔림):
 * NE Tutor MAU → NE Tutor 신규사용자 → 통합회원 → 서비스(NELT, 문법문제, 문법예문, 어휘출제, 클래스카드) 각 MAU/신규.
 */
export function orderTrendSeriesForPlot<
  T extends { name: TrendSeriesName; y: (number | null)[] },
>(series: readonly T[]): T[] {
  const byName = new Map(series.map((s) => [s.name, s]));
  const orderedNames: TrendSeriesName[] = [
    'NE Tutor MAU',
    'NE Tutor 신규사용자',
    '통합회원',
    ...TREND_SERVICE_ROW.flatMap((s) => [
      `${s.display} MAU` as TrendSeriesName,
      `${s.display} 신규사용자` as TrendSeriesName,
    ]),
    'E-Book MAU',
    '부가자료(개별) MAU',
  ];
  return orderedNames.map((n) => byName.get(n)).filter((s): s is T => s != null);
}
