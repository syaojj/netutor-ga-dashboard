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

/**
 * 일별 xlsx(워크북)에 행이 있을 때, GA HTML 14개를 추가로 받아 병합할지 여부.
 * 기본(false): 병합 생략 → 초기 네트워크·메인 스레드 HTML 파싱 부하가 크게 줄어듭니다.
 * HTML까지 워크북과 합쳐야 하면 빌드/로컬에서 `VITE_MERGE_GA_HTML=1` 을 설정하세요.
 */
export const MERGE_GA_HTML_WITH_WORKBOOK = import.meta.env.VITE_MERGE_GA_HTML === '1';

/** IT 검증용 GA 일별 통합 통계(시트=서비스+디바이스). 있으면 HTML보다 우선 병합 */
export const GA_DAILY_WORKBOOK_XLSX_NAME = 'NE Tutor_데이터 현황_260513.xlsx';

/**
 * 월간 통합 xlsx — 트렌드 차트(월별·년간)의 1순위 데이터 소스.
 * 시트: Tutor, 클카, 문뱅, … 통합회원, E-Book 및 *PC law* / *M law* 보조 시트(무시), 교재별* 요약 시트(무시).
 */
export const GA_MONTHLY_WORKBOOK_XLSX_NAME = 'NE Tutor 데이터 현황_260514_v3.xlsx';

/** E-Book Raw Data 메뉴 키 (월간 E-Book 클릭·이용자) */
export const EBOOK_RAW_KEY = 'E-Book';
/** 부가자료 Raw Data 메뉴 키 (월간 부가자료 전체·개별) */
export const SUPPLEMENTARY_RAW_KEY = '부가자료';
/** 주문별현황 Raw Data 메뉴 키 */
export const ORDERS_RAW_KEY = '주문별현황';

export const ORDERS_XLSX_NAME = '주문별현황2021~2026.xlsx';

export type GaHtmlSource = (typeof GA_HTML_SOURCES)[number];

/**
 * LAW DATA 사이드 하위 메뉴.
 * - displayName: 사이드바·원시 패널 제목
 * - dataService: 월간 행의 service 키, 또는 EBOOK_RAW_KEY / SUPPLEMENTARY_RAW_KEY / ORDERS_RAW_KEY
 */
export const LAW_DATA_SUBMENU_ITEMS: readonly { displayName: string; dataService: string }[] = [
  { displayName: 'Tutor', dataService: 'NE Tutor' },
  { displayName: '통합회원', dataService: '통합회원' },
  { displayName: 'NELT', dataService: 'NELT' },
  { displayName: '문법문제뱅크', dataService: '문법문제' },
  { displayName: '문법예문검색', dataService: '문법예문' },
  { displayName: '어휘출제마법사', dataService: '어휘출제' },
  { displayName: '클래스카드', dataService: '클래스카드' },
  { displayName: '교재자료', dataService: '교재자료' },
  { displayName: EBOOK_RAW_KEY, dataService: EBOOK_RAW_KEY },
  { displayName: SUPPLEMENTARY_RAW_KEY, dataService: SUPPLEMENTARY_RAW_KEY },
  { displayName: ORDERS_RAW_KEY, dataService: ORDERS_RAW_KEY },
] as const;

export const RAW_MENU_ITEMS = LAW_DATA_SUBMENU_ITEMS;

export type RawMenuItem = (typeof LAW_DATA_SUBMENU_ITEMS)[number];
