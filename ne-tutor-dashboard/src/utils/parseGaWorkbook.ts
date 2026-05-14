import * as XLSX from 'xlsx';
import type { DailyMetricRow, EbookMonthlyRow } from '../types';
import { parseEbookWideSheet, parseSpreadsheetMetricOrNull } from './parseGaMonthlyWorkbook';
import { parseYyyymmdd } from './dateUtil';
import { mergeRowsByDate } from './parseHtmlSheets';

const COL = {
  date: '날짜',
  newUsers: '새 사용자 수',
  active: '활성 사용자',
  total: '총 사용자',
  views: '조회수',
  returning: '재방문자 수',
  dauMau: 'DAU/MAU',
} as const;

function parseNumber(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw).replace(/,/g, '').trim();
  if (s.endsWith('%')) {
    const n = Number(s.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDateCell(cell: unknown): string | null {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return cell.toISOString().slice(0, 10);
  }
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    const s = String(Math.trunc(cell));
    if (s.length === 8) return parseYyyymmdd(s);
  }
  if (cell == null || cell === '') return null;
  const s = String(cell).trim();
  if (!s) return null;
  const iso = parseYyyymmdd(s);
  if (iso) return iso;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

/** 시트 탭 이름 → 서비스·디바이스·원시 파일명(HTML과 동일 규칙) */
export function parseGaSheetTabName(sheetName: string): { service: string; device: 'M' | 'PC'; sourceFile: string } | null {
  const t = sheetName.trim();
  const m = t.match(/^(.+?)\s+(PC|M)$/i);
  if (m) {
    const device = m[2].toUpperCase() === 'PC' ? 'PC' : 'M';
    const service = m[1].trim();
    return { service, device, sourceFile: `${service} ${device === 'PC' ? 'PC' : 'M'}.html` };
  }
  return null;
}

function findHeaderRow(matrix: unknown[][]): { headerIdx: number; colIndex: Record<string, number> } | null {
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i] as unknown[];
    if (!row?.length) continue;
    const colIndex: Record<string, number> = {};
    row.forEach((cell, j) => {
      const name = String(cell ?? '').trim();
      if (name) colIndex[name] = j;
    });
    if (colIndex[COL.date] != null && colIndex[COL.active] != null) {
      return { headerIdx: i, colIndex };
    }
  }
  return null;
}

function parseOneSheet(
  matrix: unknown[][],
  meta: { service: string; device: 'M' | 'PC'; sourceFile: string },
): { rows: DailyMetricRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const found = findHeaderRow(matrix);
  if (!found) {
    warnings.push(`시트 "${meta.service} ${meta.device}"(또는 탭): 일별 GA 헤더(날짜·활성 사용자) 없음 — 건너뜀`);
    return { rows: [], warnings };
  }
  const { headerIdx, colIndex } = found;
  const need = [COL.newUsers, COL.active, COL.views, COL.returning];
  for (const k of need) {
    if (colIndex[k] == null) warnings.push(`시트 ${meta.sourceFile}: "${k}" 없음 — 0 처리`);
  }

  const out: DailyMetricRow[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] as unknown[];
    if (!row?.length) continue;
    const di = colIndex[COL.date];
    const iso = normalizeDateCell(row[di]);
    if (!iso) continue;

    const g = (name: string) => {
      const idx = colIndex[name];
      if (idx == null) return 0;
      return parseNumber(row[idx]);
    };
    const dm =
      colIndex[COL.dauMau] != null ? parseNumber(row[colIndex[COL.dauMau]]) : null;

    out.push({
      sourceFile: meta.sourceFile,
      service: meta.service,
      device: meta.device,
      date: iso,
      newUsers: g(COL.newUsers),
      activeUsers: g(COL.active),
      totalUsers: g(COL.total),
      views: g(COL.views),
      returningUsers: g(COL.returning),
      dauMau: dm != null && Number.isFinite(dm) ? dm : null,
    });
  }
  return { rows: mergeRowsByDate(out), warnings };
}

function findEbookHeaderRow(
  matrix: unknown[][],
): { headerIdx: number; cYear: number; cMonth: number; cClicks: number } | null {
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i] as unknown[];
    if (!row?.length) continue;
    const idx: Record<string, number> = {};
    row.forEach((cell, j) => {
      const name = String(cell ?? '').trim();
      if (name) idx[name] = j;
    });
    if (idx['년'] != null && idx['월'] != null && idx['클릭수'] != null) {
      return { headerIdx: i, cYear: idx['년'], cMonth: idx['월'], cClicks: idx['클릭수'] };
    }
  }
  return null;
}

function parseLegacyEbookSheet(matrix: unknown[][]): { rows: EbookMonthlyRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const head = findEbookHeaderRow(matrix);
  if (!head) {
    warnings.push('E-Book 시트: 헤더(년/월/클릭수) 행을 찾지 못함');
    return { rows: [], warnings };
  }
  const out: EbookMonthlyRow[] = [];
  for (let i = head.headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] as unknown[];
    if (!row?.length) continue;
    const y = Number(String(row[head.cYear] ?? '').trim());
    const mo = Number(String(row[head.cMonth] ?? '').trim());
    if (!Number.isFinite(y) || y < 2000 || y > 2100) continue;
    if (!Number.isFinite(mo) || mo < 1 || mo > 12) continue;
    const clk = parseSpreadsheetMetricOrNull(row[head.cClicks]);
    out.push({
      year: y,
      month: mo,
      monthKey: `${y}-${String(mo).padStart(2, '0')}`,
      clicks: clk,
    });
  }
  out.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  return { rows: out, warnings };
}

/**
 * IT 검증용 통합 xlsx(시트별 GA4 일별 + E-Book 월별) 파싱.
 */
export function parseGaWorkbook(buf: ArrayBuffer): {
  daily: DailyMetricRow[];
  ebookMonthly: EbookMonthlyRow[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const all: DailyMetricRow[] = [];
  let ebookMonthly: EbookMonthlyRow[] = [];

  for (const sheetName of wb.SheetNames) {
    const t = sheetName.trim();
    if (/^E-Book$/i.test(t)) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const matrix = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
        raw: false,
      }) as unknown[][];
      const wide = parseEbookWideSheet(matrix);
      if (wide.rows.length > 0) {
        ebookMonthly = wide.rows;
        warnings.push(...wide.warnings);
      } else {
        const { rows, warnings: w } = parseLegacyEbookSheet(matrix);
        ebookMonthly = rows;
        warnings.push(...w);
      }
      continue;
    }
    const meta = parseGaSheetTabName(sheetName);
    if (!meta) {
      warnings.push(`시트 무시(이름 규칙 아님): ${sheetName}`);
      continue;
    }
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][];
    const { rows, warnings: w } = parseOneSheet(matrix, meta);
    warnings.push(...w);
    all.push(...rows);
  }

  return { daily: all, ebookMonthly, warnings };
}

/** 동일 service|device|date면 workbook 행이 우선(덮어쓰기) */
export function mergeDailyPreferWorkbook(
  workbookRows: DailyMetricRow[],
  htmlRows: DailyMetricRow[],
): DailyMetricRow[] {
  const map = new Map<string, DailyMetricRow>();
  const keyOf = (r: DailyMetricRow) => `${r.service}|${r.device}|${r.date}`;
  for (const r of htmlRows) {
    map.set(keyOf(r), { ...r });
  }
  for (const r of workbookRows) {
    map.set(keyOf(r), { ...r });
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
