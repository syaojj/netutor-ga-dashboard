import * as XLSX from 'xlsx';
import type { EbookMonthlyRow, MonthlyByDeviceRow } from '../types';

/** 시트명 → 대시보드 표시용 서비스명 매핑 (월간 xlsx 시트 기준) */
const SERVICE_SHEET_MAP: Record<string, string> = {
  Tutor: 'NE Tutor',
  /** 구버전 약칭 + v3 풀네임 */
  '클카': '클래스카드',
  클래스카드: '클래스카드',
  문뱅: '문법문제',
  문법문제뱅크: '문법문제',
  NELT: 'NELT',
  어출마: '어휘출제',
  어휘출제마법사: '어휘출제',
  교재자료: '교재자료',
  문예: '문법예문',
  문법예문검색: '문법예문',
};

const MEMBER_SHEET = '통합회원';
const EBOOK_SHEET = 'E-Book';
/** v3: 부가자료 지표가 별도 시트 — 병합용 */
const SUPPLEMENTARY_SHEET = '부가자료';

/**
 * 문법문제뱅크 모바일: 이 월 미만은 월간 시트에 모바일 집계 없음(엑셀 0과 구분해 null).
 * 2025-09월까지 결측, 2025-10부터 수치가 있다고 가정.
 */
const GRAMMAR_MOBILE_FIRST_MONTH_KEY = '2025-10';

function applyGrammarMobileNullSentinel(rows: MonthlyByDeviceRow[]) {
  for (const r of rows) {
    if (r.service !== '문법문제') continue;
    if (r.month.localeCompare(GRAMMAR_MOBILE_FIRST_MONTH_KEY) < 0) {
      r.moMau = null;
      r.moNew = null;
    }
  }
}

/**
 * 월간 xlsx·LAW 셀: 빈 값·플레이스홀더는 null, 숫자 0은 그대로 0.
 * (엑셀에서 빈 칸이 0으로 잡히는 경우는 드물며, 수식 오류 문자열은 null 처리)
 */
export function parseSpreadsheetMetricOrNull(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return Math.round(raw);
  }
  if (typeof raw === 'boolean') return raw ? 1 : null;
  const s = String(raw).replace(/,/g, '').trim();
  if (!s) return null;
  const u = s.toUpperCase();
  if (
    u === '#N/A' ||
    u === 'N/A' ||
    u === 'NULL' ||
    u === '-' ||
    u === '—' ||
    u === '–' ||
    /^(소실|없음|오류)$/.test(s) ||
    /^[—\-–]+$/u.test(s)
  ) {
    return null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function monthKeyFromCell(cell: unknown): string | null {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, '0')}`;
  }
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    const n = cell;
    /** 엑셀 숫자 월 표기: 2022.01~2022.12, 2022.1 = 10월(표시 w: 2022.10) */
    if (n > 2000 && n < 2101) {
      const y = Math.floor(n + 1e-9);
      const rem = n - y;
      const month = Math.round(rem * 100 + 1e-4);
      if (month >= 1 && month <= 12) return `${y}-${String(month).padStart(2, '0')}`;
    }
    const d = XLSX.SSF?.parse_date_code?.(cell);
    if (d && d.y >= 2000 && d.m >= 1 && d.m <= 12) {
      return `${d.y}-${String(d.m).padStart(2, '0')}`;
    }
  }
  const s = String(cell ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})[.\-/](\d{1,2})$/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}`;
  return null;
}

function findMonthHeader(
  matrix: unknown[][],
): { headerIdx: number; monthCols: { col: number; month: string }[] } | null {
  for (let i = 0; i < Math.min(matrix.length, 30); i++) {
    const row = matrix[i] ?? [];
    const labelCell = String(row[0] ?? '').trim();
    if (labelCell !== '월별') continue;
    const monthCols: { col: number; month: string }[] = [];
    for (let j = 1; j < row.length; j++) {
      const mk = monthKeyFromCell(row[j]);
      if (mk) monthCols.push({ col: j, month: mk });
    }
    if (monthCols.length > 0) return { headerIdx: i, monthCols };
  }
  return null;
}

function rowsByLabel(matrix: unknown[][], startIdx: number): Map<string, unknown[]> {
  const out = new Map<string, unknown[]>();
  for (let i = startIdx; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const label = String(row[0] ?? '').trim();
    if (!label) continue;
    /** GA보내기 주석 행(설명)은 지표 행으로 쓰지 않음 */
    if (label.startsWith('*')) continue;
    if (!out.has(label)) out.set(label, row);
  }
  return out;
}

function pickLabelRow(labelMap: Map<string, unknown[]>, candidates: readonly string[]): unknown[] | undefined {
  for (const key of candidates) {
    const row = labelMap.get(key);
    if (row) return row;
  }
  return undefined;
}

function parseServiceSheet(
  service: string,
  matrix: unknown[][],
): { rows: MonthlyByDeviceRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const head = findMonthHeader(matrix);
  if (!head) {
    warnings.push(`시트 "${service}": "월별" 헤더 행 없음 — 건너뜀`);
    return { rows: [], warnings };
  }
  const labelMap = rowsByLabel(matrix, head.headerIdx + 1);
  const pcMauRow = pickLabelRow(labelMap, ['PC 활성사용자수', 'PC MAU']);
  const moMauRow = pickLabelRow(labelMap, ['MO 활성사용자수', 'MO MAU']);
  const pcNewRow = pickLabelRow(labelMap, ['PC 새사용자수', 'PC 신규사용자']);
  const moNewRow = pickLabelRow(labelMap, ['MO 새사용자수', 'MO 신규사용자', 'MO 신규 사용자']);
  if (!pcMauRow && !moMauRow && !pcNewRow && !moNewRow) {
    warnings.push(`시트 "${service}": PC/MO 활성/새 사용자 행 없음 — 건너뜀`);
    return { rows: [], warnings };
  }
  const rows: MonthlyByDeviceRow[] = [];
  for (const { col, month } of head.monthCols) {
    rows.push({
      service,
      month,
      pcMau: pcMauRow ? parseSpreadsheetMetricOrNull(pcMauRow[col]) : null,
      moMau: moMauRow ? parseSpreadsheetMetricOrNull(moMauRow[col]) : null,
      pcNew: pcNewRow ? parseSpreadsheetMetricOrNull(pcNewRow[col]) : null,
      moNew: moNewRow ? parseSpreadsheetMetricOrNull(moNewRow[col]) : null,
      teacherNew: null,
    });
  }
  return { rows, warnings };
}

function parseMemberSheet(
  matrix: unknown[][],
): { rows: MonthlyByDeviceRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const head = findMonthHeader(matrix);
  if (!head) {
    warnings.push('통합회원 시트: "월별" 헤더 행 없음 — 건너뜀');
    return { rows: [], warnings };
  }
  const labelMap = rowsByLabel(matrix, head.headerIdx + 1);
  const pcRow = labelMap.get('PC');
  const moRow = labelMap.get('Mobile') ?? labelMap.get('MO') ?? labelMap.get('모바일');
  const tcRow = labelMap.get('교강사') ?? labelMap.get('교사');
  if (!pcRow && !moRow && !tcRow) {
    warnings.push('통합회원 시트: PC/Mobile/교강사 행 없음 — 건너뜀');
    return { rows: [], warnings };
  }
  const rows: MonthlyByDeviceRow[] = [];
  for (const { col, month } of head.monthCols) {
    rows.push({
      service: '통합회원',
      month,
      pcMau: null,
      moMau: null,
      pcNew: pcRow ? parseSpreadsheetMetricOrNull(pcRow[col]) : null,
      moNew: moRow ? parseSpreadsheetMetricOrNull(moRow[col]) : null,
      teacherNew: tcRow ? parseSpreadsheetMetricOrNull(tcRow[col]) : null,
    });
  }
  return { rows, warnings };
}

/**
 * E-Book 시트: "월별" 가로 헤더 + 클릭 수 행.
 * v2.0: E-book 클릭(중복)·이용자(중복제거)·부가자료 전체/개별 행을 함께 읽습니다.
 */
export function parseEbookWideSheet(matrix: unknown[][]): { rows: EbookMonthlyRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const head = findMonthHeader(matrix);
  if (!head) {
    warnings.push('E-Book 시트: "월별" 헤더 행 없음 — 건너뜀');
    return { rows: [], warnings };
  }
  const labelMap = rowsByLabel(matrix, head.headerIdx + 1);
  const clickRow =
    labelMap.get('E-book 클릭 수 (중복포함)') ??
    labelMap.get('E-Book 클릭 수 (중복포함)') ??
    labelMap.get('클릭 수') ??
    labelMap.get('클릭수');
  if (!clickRow) {
    warnings.push('E-Book 시트: 클릭 수 행 없음 — 건너뜀');
    return { rows: [], warnings };
  }
  const usersRow = labelMap.get('E-Book 이용자수 (중복제거)');
  const supFullRow = labelMap.get('부가자료전체다운로드(중복포함)');
  const supIndRow = labelMap.get('부가자료개별다운로드(중복제거)');

  const rows: EbookMonthlyRow[] = [];
  for (const { col, month } of head.monthCols) {
    const [yStr, mStr] = month.split('-');
    rows.push({
      year: Number(yStr),
      month: Number(mStr),
      monthKey: month,
      clicks: parseSpreadsheetMetricOrNull(clickRow[col]),
      lawEbookUniqueUsers: usersRow ? parseSpreadsheetMetricOrNull(usersRow[col]) : null,
      lawSupplementaryFullDownloads: supFullRow ? parseSpreadsheetMetricOrNull(supFullRow[col]) : null,
      lawSupplementaryIndividualDownloads: supIndRow ? parseSpreadsheetMetricOrNull(supIndRow[col]) : null,
    });
  }
  rows.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  return { rows, warnings };
}

/** v3: 부가자료 시트만 읽어 월별 전체/개별 다운로드 (E-Book 시트와 병합) */
function parseSupplementaryMonthlySheet(matrix: unknown[][]): { rows: EbookMonthlyRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const head = findMonthHeader(matrix);
  if (!head) {
    warnings.push('부가자료 시트: "월별" 헤더 행 없음 — 건너뜀');
    return { rows: [], warnings };
  }
  const labelMap = rowsByLabel(matrix, head.headerIdx + 1);
  const supFullRow = labelMap.get('부가자료전체다운로드(중복포함)');
  const supIndRow = labelMap.get('부가자료개별다운로드(중복제거)');
  if (!supFullRow && !supIndRow) {
    warnings.push('부가자료 시트: 부가자료 전체/개별 행 없음 — 건너뜀');
    return { rows: [], warnings };
  }
  const rows: EbookMonthlyRow[] = [];
  for (const { col, month } of head.monthCols) {
    const [yStr, mStr] = month.split('-');
    rows.push({
      year: Number(yStr),
      month: Number(mStr),
      monthKey: month,
      clicks: null,
      lawEbookUniqueUsers: null,
      lawSupplementaryFullDownloads: supFullRow ? parseSpreadsheetMetricOrNull(supFullRow[col]) : null,
      lawSupplementaryIndividualDownloads: supIndRow ? parseSpreadsheetMetricOrNull(supIndRow[col]) : null,
    });
  }
  rows.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  return { rows, warnings };
}

function mergeEbookSupplementary(primary: EbookMonthlyRow[], extra: EbookMonthlyRow[]): EbookMonthlyRow[] {
  if (extra.length === 0) return primary;
  if (primary.length === 0) {
    return [...extra].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }
  const ex = new Map(extra.map((r) => [r.monthKey, r]));
  const primaryKeys = new Set(primary.map((r) => r.monthKey));
  const out: EbookMonthlyRow[] = primary.map((r) => {
    const e = ex.get(r.monthKey);
    if (!e) return r;
    return {
      ...r,
      lawSupplementaryFullDownloads:
        e.lawSupplementaryFullDownloads != null
          ? e.lawSupplementaryFullDownloads
          : r.lawSupplementaryFullDownloads,
      lawSupplementaryIndividualDownloads:
        e.lawSupplementaryIndividualDownloads != null
          ? e.lawSupplementaryIndividualDownloads
          : r.lawSupplementaryIndividualDownloads,
    };
  });
  for (const e of extra) {
    if (primaryKeys.has(e.monthKey)) continue;
    out.push({ ...e });
  }
  out.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  return out;
}

/**
 * 월간 통합 xlsx 파싱 (시트별 PC/MO 활성·신규 + 통합회원 신규가입 + E-Book·LAW 월별).
 */
export function parseGaMonthlyWorkbook(buf: ArrayBuffer): {
  monthlyByDevice: MonthlyByDeviceRow[];
  ebookMonthly: EbookMonthlyRow[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const all: MonthlyByDeviceRow[] = [];
  let ebookMonthly: EbookMonthlyRow[] = [];
  let ebookSuppPatch: EbookMonthlyRow[] = [];

  for (const sheet of wb.SheetNames) {
    const t = sheet.trim();
    const ws = wb.Sheets[sheet];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][];

    if (/\s+law$/i.test(t)) {
      continue;
    }

    if (SERVICE_SHEET_MAP[t] != null) {
      const r = parseServiceSheet(SERVICE_SHEET_MAP[t], matrix);
      all.push(...r.rows);
      warnings.push(...r.warnings);
      continue;
    }
    if (t === MEMBER_SHEET) {
      const r = parseMemberSheet(matrix);
      all.push(...r.rows);
      warnings.push(...r.warnings);
      continue;
    }
    if (t === EBOOK_SHEET) {
      const r = parseEbookWideSheet(matrix);
      ebookMonthly = r.rows;
      warnings.push(...r.warnings);
      continue;
    }
    if (t === SUPPLEMENTARY_SHEET) {
      const r = parseSupplementaryMonthlySheet(matrix);
      ebookSuppPatch = r.rows;
      warnings.push(...r.warnings);
      continue;
    }
    if (t.startsWith('교재별')) {
      continue;
    }
    warnings.push(`알 수 없는 시트 (무시): ${sheet}`);
  }

  ebookMonthly = mergeEbookSupplementary(ebookMonthly, ebookSuppPatch);

  applyGrammarMobileNullSentinel(all);
  all.sort((a, b) => a.service.localeCompare(b.service) || a.month.localeCompare(b.month));
  return { monthlyByDevice: all, ebookMonthly, warnings };
}
