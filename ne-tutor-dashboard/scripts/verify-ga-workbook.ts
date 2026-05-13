/**
 * 사용자 제공 통합 xlsx ↔ parseGaWorkbook 결과 ↔ public/data 복사본 일치 검증
 * 실행: npx --yes tsx scripts/verify-ga-workbook.ts
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import type { DailyMetricRow } from '../src/types';
import { parseGaWorkbook } from '../src/utils/parseGaWorkbook';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const SOURCE = join(
  'C:',
  'Users',
  'snkang',
  'Desktop',
  'NE능률_IT업무',
  '07_NE Tutor',
  '[NE Tutor] 데이터 검증 및 분석',
  'NE Tutor_데이터 현황_260513.xlsx',
);
const COPY = join(root, 'public', 'data', 'NE Tutor_데이터 현황_260513.xlsx');

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  const u = new Uint8Array(buf.byteLength);
  u.set(buf);
  return u.buffer;
}

function rowKey(r: DailyMetricRow): string {
  return `${r.service}|${r.device}|${r.date}`;
}

function compareDaily(a: DailyMetricRow[], b: DailyMetricRow[]): { ok: boolean; diffs: string[] } {
  const diffs: string[] = [];
  const mapA = new Map<string, DailyMetricRow>();
  for (const r of a) mapA.set(rowKey(r), r);
  const mapB = new Map<string, DailyMetricRow>();
  for (const r of b) mapB.set(rowKey(r), r);
  if (mapA.size !== mapB.size) {
    diffs.push(`행 개수 불일치: A=${mapA.size}, B=${mapB.size}`);
  }
  const keys = new Set([...mapA.keys(), ...mapB.keys()]);
  let numFieldMismatch = 0;
  for (const k of keys) {
    const ra = mapA.get(k);
    const rb = mapB.get(k);
    if (!ra || !rb) {
      diffs.push(`한쪽에만 존재: ${k} A=${!!ra} B=${!!rb}`);
      continue;
    }
    const fields: (keyof DailyMetricRow)[] = [
      'newUsers',
      'activeUsers',
      'totalUsers',
      'views',
      'returningUsers',
    ];
    for (const f of fields) {
      if (ra[f] !== rb[f]) {
        numFieldMismatch++;
        if (diffs.length < 25) diffs.push(`${k} ${String(f)}: ${ra[f]} vs ${rb[f]}`);
      }
    }
    const da = ra.dauMau ?? null;
    const db = rb.dauMau ?? null;
    if (da !== db && (da == null || db == null || Math.abs(da - db) > 1e-9)) {
      numFieldMismatch++;
      if (diffs.length < 25) diffs.push(`${k} dauMau: ${da} vs ${db}`);
    }
  }
  return { ok: diffs.length === 0, diffs };
}

/** 시트 'NE Tutor PC'에서 날짜 20220401 행의 숫자를 직접 읽어 파싱 결과와 비교 */
function spotCheckNeTutorPc(buf: Buffer, daily: DailyMetricRow[]): string[] {
  const notes: string[] = [];
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets['NE Tutor PC'];
  if (!ws) {
    notes.push('시트 NE Tutor PC 없음');
    return notes;
  }
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
  let headerIdx = -1;
  let col: Record<string, number> = {};
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i] as unknown[];
    const idx: Record<string, number> = {};
    row.forEach((cell, j) => {
      const name = String(cell ?? '').trim();
      if (name) idx[name] = j;
    });
    if (idx['날짜'] != null && idx['활성 사용자'] != null) {
      headerIdx = i;
      col = idx;
      break;
    }
  }
  if (headerIdx < 0) {
    notes.push('헤더 행 못 찾음');
    return notes;
  }
  const di = col['날짜']!;
  const target = 20220401;
  let rawRow: unknown[] | null = null;
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] as unknown[];
    const cell = row[di];
    const n = typeof cell === 'number' ? Math.trunc(cell) : null;
    if (n === target) {
      rawRow = row;
      break;
    }
  }
  if (!rawRow) {
    notes.push(`원본에서 날짜 ${target} 행 없음`);
    return notes;
  }
  const g = (name: string) => parseNumber(rawRow![col[name]!]);
  const parsed = daily.find((r) => r.service === 'NE Tutor' && r.device === 'PC' && r.date === '2022-04-01');
  if (!parsed) {
    notes.push('파싱 결과에 2022-04-01 NE Tutor PC 없음');
    return notes;
  }
  const pairs: [string, number, number][] = [
    ['새 사용자 수', g('새 사용자 수'), parsed.newUsers],
    ['활성 사용자', g('활성 사용자'), parsed.activeUsers],
    ['총 사용자', g('총 사용자'), parsed.totalUsers],
    ['조회수', g('조회수'), parsed.views],
    ['재방문자 수', g('재방문자 수'), parsed.returningUsers],
  ];
  for (const [label, raw, p] of pairs) {
    if (raw !== p) notes.push(`${label}: 원본=${raw} 파싱=${p} 불일치`);
  }
  if (notes.length === 0) notes.push('스팟체크 NE Tutor PC 2022-04-01: 수치 일치');
  return notes;
}

function parseNumber(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const n = Number(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function main() {
  const out: string[] = [];
  const load = (label: string, path: string): Buffer | null => {
    if (!existsSync(path)) {
      out.push(`[${label}] 파일 없음: ${path}`);
      return null;
    }
    return readFileSync(path);
  };

  const srcBuf = load('원본', SOURCE);
  const copyBuf = load('public복사본', COPY);

  if (!srcBuf && !copyBuf) {
    console.log(out.join('\n'));
    process.exit(1);
  }

  if (srcBuf && copyBuf) {
    if (srcBuf.length !== copyBuf.length) {
      out.push(`[바이트 크기] 원본=${srcBuf.length}, 복사본=${copyBuf.length} (다르면 파일 내용이 다를 수 있음)`);
    } else {
      out.push(`[바이트 크기] 동일: ${srcBuf.length} bytes`);
    }
    let byteDiff = 0;
    for (let i = 0; i < Math.min(srcBuf.length, copyBuf.length); i++) {
      if (srcBuf[i] !== copyBuf[i]) byteDiff++;
    }
    if (byteDiff) out.push(`[바이트 비교] 다른 바이트 수: ${byteDiff}`);
    else out.push('[바이트 비교] 원본과 복사본 동일');
  }

  const runParse = (label: string, buf: Buffer) => {
    const { daily, warnings } = parseGaWorkbook(toArrayBuffer(buf));
    const bySvc = new Map<string, number>();
    for (const r of daily) {
      const k = `${r.service}|${r.device}`;
      bySvc.set(k, (bySvc.get(k) ?? 0) + 1);
    }
    out.push(`\n[${label}] 파싱 일별 행 수: ${daily.length}`);
    out.push(`[${label}] 경고 ${warnings.length}건 (처음 8개):`);
    warnings.slice(0, 8).forEach((w) => out.push(`  - ${w}`));
    const keys = [...bySvc.keys()].sort();
    out.push(`[${label}] 서비스×디바이스별 행 수 (${keys.length}개):`);
    for (const k of keys) out.push(`  ${k}: ${bySvc.get(k)}`);
    return daily;
  };

  let dailySrc: DailyMetricRow[] | null = null;
  let dailyCopy: DailyMetricRow[] | null = null;
  if (srcBuf) dailySrc = runParse('원본', srcBuf);
  if (copyBuf) dailyCopy = runParse('public복사본', copyBuf);

  if (dailySrc && dailyCopy) {
    const { ok, diffs } = compareDaily(dailySrc, dailyCopy);
    out.push(`\n[원본 vs public 파싱 결과] ${ok ? '✓ 동일' : '✗ 차이 있음'}`);
    diffs.forEach((d) => out.push(`  ${d}`));
  }

  const bufForSpot = srcBuf ?? copyBuf;
  const dailyForSpot = dailySrc ?? dailyCopy;
  if (bufForSpot && dailyForSpot) {
    out.push('\n[스팟 검증]');
    spotCheckNeTutorPc(bufForSpot, dailyForSpot).forEach((l) => out.push(`  ${l}`));
  }

  console.log(out.join('\n'));
}

main();
