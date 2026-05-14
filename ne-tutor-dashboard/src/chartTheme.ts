export type ColorMode = 'light' | 'dark';

/** Plotly·이벤트 말풍선 등에 공통으로 쓰는 팔레트 */
export type ChartTheme = {
  paper: string;
  plot: string;
  grid: string;
  font: string;
  fontStrong: string;
  bubbleBg: string;
  bubbleFont: string;
  /** 이벤트 발생일 세로 가이드(점선) — 격자보다 눈에 띄게 */
  eventLine: string;
};

/** 라이트(White) UI */
export const CHART_THEME_LIGHT: ChartTheme = {
  paper: '#f8fafc',
  plot: '#f8fafc',
  grid: '#cbd5e1',
  font: '#334155',
  fontStrong: '#0f172a',
  bubbleBg: 'rgba(255, 255, 255, 0.96)',
  bubbleFont: '#0f172a',
  eventLine: '#64748b',
};

/** 다크 UI — 대비·눈 피로 완화 톤 */
export const CHART_THEME_DARK: ChartTheme = {
  paper: '#131a22',
  plot: '#131a22',
  grid: '#3d4d63',
  font: '#cbd5e1',
  fontStrong: '#f1f5f9',
  bubbleBg: 'rgba(30, 41, 55, 0.97)',
  bubbleFont: '#e8eef5',
  eventLine: '#93c5fd',
};

export function getChartTheme(mode: ColorMode): ChartTheme {
  return mode === 'dark' ? CHART_THEME_DARK : CHART_THEME_LIGHT;
}

/** 하위 호환·정적 참조용 (라이트 = 기본) */
export const CHART_THEME = CHART_THEME_LIGHT;
