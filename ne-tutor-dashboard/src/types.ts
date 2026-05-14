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
  newUsersSum: number | null;
  /** 월 내 일별 활성 사용자 집계 후 산출한 추정 MAU (MVP) */
  mauEstimate: number | null;
  viewsSum: number;
  returningUsersSum: number;
  /** 일별 (재방문/활성) 비율의 월 평균 */
  returningRateAvg: number | null;
}

export interface YearlyMetricRow {
  service: string;
  device: DeviceFilter;
  year: string; // YYYY
  newUsersSum: number | null;
  mauEstimate: number | null;
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

/** E-Book 시트 월별 원시 행 (클릭·LAW 지표는 월간 xlsx 레이아웃에 따라 null 가능) */
export interface EbookMonthlyRow {
  year: number;
  month: number;
  monthKey: string;
  /** E-book 클릭 수(중복포함) — 빈 셀은 null */
  clicks: number | null;
  /** LAW · E-Book 이용자수(중복제거) */
  lawEbookUniqueUsers?: number | null;
  /** LAW · 부가자료 전체 다운로드(중복포함) */
  lawSupplementaryFullDownloads?: number | null;
  /** LAW · 부가자료 개별 다운로드(중복제거) */
  lawSupplementaryIndividualDownloads?: number | null;
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
  /** 빈 셀·비수치는 null (0은 실제 0) */
  pcMau: number | null;
  /** 모바일 미집계·결측 구간은 null (엑셀 0과 구분) */
  moMau: number | null;
  pcNew: number | null;
  moNew: number | null;
  /** 통합회원 시트의 '교강사' 신규가입 — 빈 셀은 null */
  teacherNew: number | null;
}
