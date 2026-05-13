/** GA HTML보내기 파일명 (public/data) */
export const GA_HTML_SOURCES = [
  'NE Tutor M.html',
  'NE Tutor PC.html',
  'NELT M.html',
  'NELT PC.html',
  '교재자료 M.html',
  '교재자료 PC.html',
  '문법문제뱅크 M.html',
  '문법문제뱅크 PC.html',
  '어휘출제마법사 M.html',
  '어휘출제마법사 PC.html',
  '클래스카드 M.html',
  '클래스카드 PC.html',
] as const;

export const ORDERS_XLSX_NAME = '주문별현황2021~2026.xlsx';

export type GaHtmlSource = (typeof GA_HTML_SOURCES)[number];
