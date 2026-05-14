/**
 * 나눔스퀘어 네오 (네이버 pstatic 웹폰트)
 * - UI: index.css
 * - Plotly: layout.font.family
 */
export const APP_FONT_FAMILY =
  'NanumSquareNeoVariable, NanumSquareNeo, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

/** Plotly 호버(말풍선) — 나눔스퀘어 네오 계열 */
export const PLOTLY_HOVERLABEL = {
  font: { family: APP_FONT_FAMILY, size: 12, color: '#0f172a' },
  bgcolor: 'rgba(255, 255, 255, 0.97)',
  bordercolor: '#94a3b8',
} as const;

export const PLOTLY_HOVERLABEL_DARK = {
  font: { family: APP_FONT_FAMILY, size: 12, color: '#e8eef5' },
  bgcolor: 'rgba(30, 41, 55, 0.96)',
  bordercolor: '#64748b',
} as const;
