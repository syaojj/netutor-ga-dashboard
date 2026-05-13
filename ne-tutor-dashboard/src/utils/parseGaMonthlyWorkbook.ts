import * as XLSX from 'xlsx';
import type { EbookMonthlyRow, MonthlyByDeviceRow } from '../types';

/** 시트명 → 대시보드 표시용 서비스명 매핑 (월간 xlsx 시트 기준) */
const SERVICE_SHEET_MAP: Record<string, string> = {
  Tutor: 'NE Tutor',
  '클카': '클래스카드',
  '문뱅': '문법문제',
  NELT: 'NELT',
  '어출마': '어휘출제',
  '교재자료': '교재자료',
  '문예': '문법예문',
};

const MEMBER_SHEET = '통합회원';
const EBOOK_SHEET = 'E-Book';

function parseNumber(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw ?? '').replace(/,/g, '').trim();
  if (!s) return 0;
  if (s.endsWith('%')) {
    const n = Number(s.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function monthKeyFromCell(cell: unknown): string | null {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, '0')}`;
  }
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    // 엑셀 일련번호일 가능성은 낮지만(문자열로 들어오는 케이스가 일반) 안전 처리
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
    if (!out.has(label)) out.set(label, row);
  }
  return out;
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
  const pcMauRow = labelMap.get('PC 활성사용자수');
  const moMauRow = labelMap.get('MO 활성사용자수');
  const pcNewRow = labelMap.get('PC 새사용자수');
  const moNewRow = labelMap.get('MO 새사용자수');
  if (!pcMauRow && !moMauRow && !pcNewRow && !moNewRow) {
    warnings.push(`시트 "${service}": PC/MO 활성/새 사용자 행 없음 — 건너뜀`);
    return { rows: [], warnings };
  }
  const rows: MonthlyByDeviceRow[] = [];
  for (const { col, month } of head.monthCols) {
    rows.push({
      service,
      month,
      pcMau: pcMauRow ? parseNumber(pcMauRow[col]) : 0,
      moMau: moMauRow ? parseNumber(moMauRow[col]) : 0,
      pcNew: pcNewRow ? parseNumber(pcNewRow[col]) : 0,
      moNew: moNewRow ? parseNumber(moNewRow[col]) : 0,
      teacherNew: 0,
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
      pcMau: 0,
      moMau: 0,
      pcNew: pcRow ? parseNumber(pcRow[col]) : 0,
      moNew: moRow ? parseNumber(moRow[col]) : 0,
      teacherNew: tcRow ? parseNumber(tcRow[col]) : 0,
    });
  }
  return { rows, warnings };
}

function parseEbookSheet(matrix: unknown[][]): { rows: EbookMonthlyRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const head = findMonthHeader(matrix);
  if (!head) {
    warnings.push('E-Book 시트: "월별" 헤더 행 없음 — 건너뜀');
    return { rows: [], warnings };
  }
  const labelMap = rowsByLabel(matrix, head.headerIdx + 1);
  const clickRow = labelMap.get('클릭 수') ?? labelMap.get('클릭수');
  if (!clickRow) {
    warnings.push('E-Book 시트: "클릭 수" 행 없음 — 건너뜀');
    return { rows: [], warnings };
  }
  const rows: EbookMonthlyRow[] = [];
  for (const { col, month } of head.monthCols) {
    const v = parseNumber(clickRow[col]);
    const [yStr, mStr] = month.split('-');
    rows.push({
      year: Number(yStr),
      month: Number(mStr),
      monthKey: month,
      clicks: Math.round(v),
    });
  }
  rows.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  return { rows, warnings };
}

/**
 * 월간 통합 xlsx 파싱 (시트별 PC/MO 활성·신규 + 통합회원 신규가입 + E-Book 클릭수).
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

  for (const sheet of wb.SheetNames) {
    const t = sheet.trim();
    const ws = wb.Sheets[sheet];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][];

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
      const r = parseEbookSheet(matrix);
      ebookMonthly = r.rows;
      warnings.push(...r.warnings);
      continue;
    }
    warnings.push(`알 수 없는 시트 (무시): ${sheet}`);
  }

  all.sort((a, b) => a.service.localeCompare(b.service) || a.month.localeCompare(b.month));
  return { monthlyByDevice: all, ebookMonthly, warnings };
}
