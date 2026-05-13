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
  '문법예문검색 M.html',
  '문법예문검색 PC.html',
  '어휘출제마법사 M.html',
  '어휘출제마법사 PC.html',
  '클래스카드 M.html',
  '클래스카드 PC.html',
] as const;

/** IT 검증용 GA 일별 통합 통계(시트=서비스+디바이스). 있으면 HTML보다 우선 병합 */
export const GA_DAILY_WORKBOOK_XLSX_NAME = 'NE Tutor_데이터 현황_260513.xlsx';

/**
 * 월간 통합 xlsx — 트렌드 차트(월별·년간)의 1순위 데이터 소스.
 * 시트: Tutor, 클카, 문뱅, NELT, 어출마, 교재자료, 문예, 통합회원, E-Book.
 */
export const GA_MONTHLY_WORKBOOK_XLSX_NAME = 'NE Tutor 데이터 현황_260513_월간data.xlsx';

/** E-Book Raw Data 메뉴 키 */
export const EBOOK_RAW_KEY = 'E-Book';
/** 주문별현황 Raw Data 메뉴 키 */
export const ORDERS_RAW_KEY = '주문별현황';

export const ORDERS_XLSX_NAME = '주문별현황2021~2026.xlsx';

export type GaHtmlSource = (typeof GA_HTML_SOURCES)[number];

/**
 * Raw Data 사이드 메뉴 항목.
 * - displayName: 사이드 메뉴 / 페이지 타이틀에 표시되는 이름 (사용자 친화적 풀네임)
 * - dataService:
 *    · 일반 서비스 행: 월간 xlsx의 MonthlyByDeviceRow.service 키
 *    · 'E-Book': ebookMonthly 데이터 사용
 *    · '주문별현황': orders 데이터 사용
 */
export const RAW_MENU_ITEMS: readonly { displayName: string; dataService: string }[] = [
  { displayName: 'NE Tutor', dataService: 'NE Tutor' },
  { displayName: '통합회원', dataService: '통합회원' },
  { displayName: 'NELT', dataService: 'NELT' },
  { displayName: '문법문제뱅크', dataService: '문법문제' },
  { displayName: '문법예문검색', dataService: '문법예문' },
  { displayName: '어휘출제마법사', dataService: '어휘출제' },
  { displayName: '클래스카드', dataService: '클래스카드' },
  { displayName: EBOOK_RAW_KEY, dataService: EBOOK_RAW_KEY },
  { displayName: ORDERS_RAW_KEY, dataService: ORDERS_RAW_KEY },
] as const;

export type RawMenuItem = (typeof RAW_MENU_ITEMS)[number];
