import type { DailyMetricRow } from '../types';
import { parseYyyymmdd } from './dateUtil';

export interface FileMeta {
  filename: string;
  service: string;
  device: 'M' | 'PC';
}

const COL = {
  date: '날짜',
  path: '페이지 경로 및 화면 클래스',
  newUsers: '새 사용자 수',
  active: '활성 사용자',
  total: '총 사용자',
  views: '조회수',
  returning: '재방문자 수',
  dauMau: 'DAU/MAU',
} as const;

/** "NE Tutor M.html" → service, device. "E-Book.html" 등 M/PC 없는 단일 시트는 PC로 취급 */
export function parseFilename(filename: string): FileMeta | null {
  const base = filename.replace(/^.*[/\\]/, '').replace(/\.html?$/i, '');
  const m = base.match(/^(.+?)\s+(M|PC)$/i);
  if (m) {
    const device = m[2].toUpperCase() === 'PC' ? 'PC' : 'M';
    return { filename: base + '.html', service: m[1].trim(), device };
  }
  if (base.length > 0 && /^[\w가-힣.\-\s]+$/i.test(base)) {
    return { filename: `${base}.html`, service: base, device: 'PC' };
  }
  return null;
}

function parseNumber(raw: string): number {
  const s = String(raw).replace(/,/g, '').trim();
  if (s.endsWith('%')) {
    const n = Number(s.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** 동일 날짜·서비스·디바이스 행 병합: 조회수/신규는 합산, 활성은 경로 중복 가능성으로 max */
export function mergeRowsByDate(rows: DailyMetricRow[]): DailyMetricRow[] {
  const map = new Map<string, DailyMetricRow>();
  for (const r of rows) {
    const key = `${r.service}|${r.device}|${r.date}`;
    const ex = map.get(key);
    if (!ex) {
      map.set(key, { ...r });
    } else {
      ex.newUsers += r.newUsers;
      ex.activeUsers = Math.max(ex.activeUsers, r.activeUsers);
      ex.totalUsers = Math.max(ex.totalUsers, r.totalUsers);
      ex.views += r.views;
      ex.returningUsers += r.returningUsers;
      if (r.dauMau != null) ex.dauMau = r.dauMau;
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Google Sheets HTML보내기(table.waffle) 파싱.
 * 헤더는 첫 번째 데이터 셀이 "날짜"인 행을 기준으로 탐지.
 */
export function parseHtmlSheet(html: string, meta: FileMeta): { rows: DailyMetricRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table.waffle');
  if (!table) {
    warnings.push(`${meta.filename}: waffle 테이블 없음`);
    return { rows: [], warnings };
  }

  const bodyRows = table.querySelectorAll('tbody tr');
  const matrix: string[][] = [];

  bodyRows.forEach((tr) => {
    const tds = tr.querySelectorAll('td');
    if (!tds.length) return;
    const cells: string[] = [];
    tds.forEach((td) => {
      cells.push((td.textContent ?? '').trim());
    });
    matrix.push(cells);
  });

  let headerIdx = -1;
  const colIndex: Record<string, number> = {};

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i];
    const di = row.findIndex((c) => c === COL.date);
    if (di >= 0) {
      headerIdx = i;
      row.forEach((name, j) => {
        if (name) colIndex[name] = j;
      });
      break;
    }
  }

  if (headerIdx < 0 || colIndex[COL.date] == null) {
    warnings.push(`${meta.filename}: "날짜" 헤더 행을 찾지 못함`);
    return { rows: [], warnings };
  }

  const need = [COL.newUsers, COL.active, COL.views, COL.returning];
  for (const k of need) {
    if (colIndex[k] == null) warnings.push(`${meta.filename}: "${k}" 컬럼 없음 — 0 처리`);
  }

  const out: DailyMetricRow[] = [];

  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i];
    const di = colIndex[COL.date];
    const rawDate = row[di];
    if (!rawDate) continue;
    const iso = parseYyyymmdd(rawDate);
    if (!iso) {
      warnings.push(`${meta.filename}: 날짜 파싱 실패 "${rawDate}"`);
      continue;
    }
    const g = (name: string) => {
      const idx = colIndex[name];
      if (idx == null) return 0;
      return parseNumber(row[idx] ?? '0');
    };
    const dm =
      colIndex[COL.dauMau] != null ? parseNumber(row[colIndex[COL.dauMau]] ?? '') : null;

    out.push({
      sourceFile: meta.filename,
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

export function parseHtmlSheets(
  files: { name: string; html: string }[],
): { daily: DailyMetricRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const all: DailyMetricRow[] = [];
  for (const f of files) {
    const meta = parseFilename(f.name);
    if (!meta) {
      warnings.push(`파일명 규칙 불일치(무시): ${f.name}`);
      continue;
    }
    const { rows, warnings: w } = parseHtmlSheet(f.html, meta);
    warnings.push(...w);
    all.push(...rows);
  }
  return { daily: all, warnings };
}
