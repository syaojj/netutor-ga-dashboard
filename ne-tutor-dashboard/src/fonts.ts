/**
 * 나눔스퀘어 네오 (네이버 pstatic 웹폰트)
 * - UI: index.css
 * - Plotly: layout.font.family
 */
export const APP_FONT_FAMILY =
  'NanumSquareNeoVariable, NanumSquareNeo, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

/** Plotly 호버(말풍선) — 나눔스퀘어 네오 계열 */
export const PLOTLY_HOVERLABEL = {
  font: { family: APP_FONT_FAMILY, size: 12 },
  bgcolor: 'rgba(15, 23, 42, 0.96)',
  bordercolor: '#64748b',
};
