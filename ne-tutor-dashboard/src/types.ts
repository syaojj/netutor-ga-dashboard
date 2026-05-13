export type DeviceFilter = 'all' | 'M' | 'PC';

/** GA 시트에서 추출한 일별 행 (경로 분리 행은 같은 날짜로 묶기 전 원시 행) */
export interface DailyMetricRow {
  /** GA HTML 파일명 (시트별 원시 조회용). Mobile+PC 병합 행에는 없을 수 있음 */
  sourceFile?: string;
  service: string;
  device: 'M' | 'PC';
  date: string; // YYYY-MM-DD
  newUsers: number;
  activeUsers: number;
  totalUsers: number;
  views: number;
  returningUsers: number;
  dauMau: number | null;
}

export interface MonthlyMetricRow {
  service: string;
  device: DeviceFilter;
  month: string; // YYYY-MM
  newUsersSum: number;
  /** 월 내 일별 활성 사용자 집계 후 산출한 추정 MAU (MVP) */
  mauEstimate: number;
  viewsSum: number;
  returningUsersSum: number;
  /** 일별 (재방문/활성) 비율의 월 평균 */
  returningRateAvg: number | null;
}

export interface YearlyMetricRow {
  service: string;
  device: DeviceFilter;
  year: string; // YYYY
  newUsersSum: number;
  mauEstimate: number;
  viewsSum: number;
  returningUsersSum: number;
  returningRateAvg: number | null;
}

export interface EcosystemEvent {
  id: string;
  date: string; // YYYY-MM-DD or YYYY-MM for month-only
  /** 표시용 정규화된 기준일 */
  anchorDate: string;
  type: 'open' | 'end' | 'reform' | 'launch';
  name: string;
}

export interface OrderRecord {
  userId: string;
  orderDate: Date;
  category: string;
  product: string;
  status: string;
}

export interface ParsedOrders {
  orders: OrderRecord[];
  warnings: string[];
}

export interface GrammarOverlapFlow {
  label: string;
  count: number;
  pct: number;
}

/** E-Book 시트(년·월·클릭수) 월별 원시 행 */
export interface EbookMonthlyRow {
  year: number;
  month: number;
  monthKey: string;
  clicks: number;
}

/**
 * 월간 통합 xlsx에서 추출한 시트별 월간 데이터.
 * 활성사용자수=MAU, 새사용자수=신규사용자.
 * 통합회원 시트는 PC/Mobile/교강사의 신규가입 수만 가짐(MAU 없음).
 */
export interface MonthlyByDeviceRow {
  /** 표시용 서비스 키 (예: 'NE Tutor', 'NELT', '클래스카드', '문법문제', '문법예문', '어휘출제', '교재자료', '통합회원') */
  service: string;
  /** YYYY-MM */
  month: string;
  pcMau: number;
  moMau: number;
  pcNew: number;
  moNew: number;
  /** 통합회원 시트의 '교강사' 신규가입 행 (그 외 서비스는 0) */
  teacherNew: number;
}
