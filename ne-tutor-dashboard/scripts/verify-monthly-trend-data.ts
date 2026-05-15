/**
 * 월간 xlsx 기준 데이터 검증: PC / Mobile / PC+Mobile 집계, 문법문제(모바일 결측),
 * LAW(E-Book·부가자료) 월평균이 요약 카드·차트(TrendChart) 산식과 일치하는지 확인합니다.
 *
 * 실행: npm run verify-monthly
 *       npx tsx scripts/verify-monthly-trend-data.ts [월간xlsx경로]
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { listMonthsBetweenInclusive } from '../src/utils/monthRange';
import {
  deviceFromPcMoFlags,
  mauForDevice,
  monthlyByDeviceBounds,
  monthlyByDeviceToMonthly,
  newForDevice,
} from '../src/utils/monthlyTrend';
import { parseGaMonthlyWorkbook } from '../src/utils/parseGaMonthlyWorkbook';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/** 대시보드가 로드하는 월간 파일명과 동일해야 함 (`src/data/gaSources.ts` 의 GA_MONTHLY_WORKBOOK_XLSX_NAME) */
const DEFAULT_MONTHLY_REL = 'NE Tutor 데이터 현황_260514_v3.xlsx';
const DEFAULT_MONTHLY = join(root, 'public', 'data', DEFAULT_MONTHLY_REL);

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  const u = new Uint8Array(buf.byteLength);
  u.set(buf);
  return u.buffer;
}

function nearlyEq(a: number, b: number, eps = 0.5): boolean {
  return Math.abs(a - b) <= eps;
}

function main() {
  const path = process.argv[2] && existsSync(process.argv[2]) ? process.argv[2] : DEFAULT_MONTHLY;
  if (!existsSync(path)) {
    console.error(`파일 없음: ${path}`);
    process.exit(1);
  }

  const buf = readFileSync(path);
  const { monthlyByDevice, ebookMonthly } = parseGaMonthlyWorkbook(toArrayBuffer(buf));
  const bounds = monthlyByDeviceBounds(monthlyByDevice);
  if (!bounds) {
    console.error('월간 by-device 행이 비어 있습니다.');
    process.exit(1);
  }

  const months = listMonthsBetweenInclusive(bounds.min, bounds.max);
  const ebookByMonth = new Map(ebookMonthly.map((r) => [r.monthKey, r]));

  const failures: string[] = [];
  const notes: string[] = [];

  /** 1) monthlyByDeviceToMonthly 가 mauForDevice/newForDevice 와 항상 일치 */
  for (const d of ['PC', 'M', 'all'] as const) {
    const conv = monthlyByDeviceToMonthly(monthlyByDevice, d);
    const byKey = new Map(conv.map((r) => [`${r.service}|${r.month}`, r]));
    for (const r of monthlyByDevice) {
      const key = `${r.service}|${r.month}`;
      const row = byKey.get(key);
      if (!row) {
        failures.push(`변환 행 누락: ${key} (${d})`);
        continue;
      }
      const em = mauForDevice(r, d);
      const en = newForDevice(r, d);
      if (row.mauEstimate !== em) failures.push(`MAU 불일치 ${key} (${d}): row=${row.mauEstimate} vs fn=${em}`);
      if (row.newUsersSum !== en) failures.push(`신규 불일치 ${key} (${d}): row=${row.newUsersSum} vs fn=${en}`);
    }
  }

  /** 2) 문법문제: 모바일 null 이고 PC 유효한 월 → all MAU 는 PC와 동일 */
  const GRAMMAR_MOBILE_FIRST = '2025-10';
  for (const r of monthlyByDevice) {
    if (r.service !== '문법문제') continue;
    if (r.month.localeCompare(GRAMMAR_MOBILE_FIRST) >= 0) continue;
    const allMau = mauForDevice(r, 'all');
    const pc = r.pcMau;
    if (allMau !== pc) {
      failures.push(`문법문제 ${r.month}: PC+Mobile MAU=${allMau}, PC MAU=${pc} (모바일 결측 구간에서 일치해야 함)`);
    }
  }

  /** 3) NE Tutor: pc·mo 모두 유한일 때 all = 합 */
  for (const r of monthlyByDevice) {
    if (r.service !== 'NE Tutor') continue;
    if (r.pcMau == null || r.moMau == null) continue;
    const allMau = mauForDevice(r, 'all');
    if (allMau !== r.pcMau + r.moMau) {
      failures.push(`NE Tutor ${r.month}: 합산 오류 MAU all=${allMau}, pc+mo=${r.pcMau + r.moMau}`);
    }
    if (r.pcNew != null && r.moNew != null) {
      const allN = newForDevice(r, 'all');
      if (allN !== r.pcNew + r.moNew) {
        failures.push(`NE Tutor ${r.month}: 합산 오류 신규 all=${allN}, pc+mo=${r.pcNew + r.moNew}`);
      }
    }
  }

  /** 4) LAW 월평균 = 차트 시리즈(구간 월 × 값) 산술평균 — 요약 카드와 동일 루프 */
  let sumE = 0;
  let nE = 0;
  let sumS = 0;
  let nS = 0;
  for (const mo of months) {
    const row = ebookByMonth.get(mo);
    if (!row) continue;
    if (row.lawEbookUniqueUsers != null) {
      sumE += row.lawEbookUniqueUsers;
      nE += 1;
    }
    if (row.lawSupplementaryIndividualDownloads != null) {
      sumS += row.lawSupplementaryIndividualDownloads;
      nS += 1;
    }
  }
  const yE = months.map((mo) => ebookByMonth.get(mo)?.lawEbookUniqueUsers ?? null);
  const yS = months.map((mo) => ebookByMonth.get(mo)?.lawSupplementaryIndividualDownloads ?? null);
  const avgFromSeries = (ys: (number | null)[]) => {
    const vals = ys.filter((v): v is number => v != null && Number.isFinite(v));
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  const cardE = nE > 0 ? sumE / nE : null;
  const cardS = nS > 0 ? sumS / nS : null;
  const seriesE = avgFromSeries(yE);
  const seriesS = avgFromSeries(yS);
  if (cardE != null && seriesE != null && !nearlyEq(cardE, seriesE)) {
    failures.push(`E-Book 월평균 불일치: 카드루프=${cardE}, 시리즈y평균=${seriesE}`);
  }
  if (cardS != null && seriesS != null && !nearlyEq(cardS, seriesS)) {
    failures.push(`부가자료 월평균 불일치: 카드루프=${cardS}, 시리즈y평균=${seriesS}`);
  }

  /** 5) NE Tutor 월평균(요약 카드와 동일: mv·nv 둘 다 있는 월만) — device all 일 때 */
  const devAll = deviceFromPcMoFlags(true, true);
  let sumM = 0;
  let sumN = 0;
  let nP = 0;
  for (const mo of months) {
    const m = new Map(monthlyByDevice.filter((r) => r.month === mo).map((r) => [r.service, r]));
    const t = m.get('NE Tutor');
    if (!t) continue;
    const mv = mauForDevice(t, devAll);
    const nv = newForDevice(t, devAll);
    if (mv != null && nv != null) {
      sumM += mv;
      sumN += nv;
      nP += 1;
    }
  }
  const avgM = nP > 0 ? sumM / nP : null;
  const avgN = nP > 0 ? sumN / nP : null;
  const yNeMau = months.map((mo) => {
    const row = monthlyByDevice.find((r) => r.month === mo && r.service === 'NE Tutor');
    return row ? mauForDevice(row, devAll) : null;
  });
  const yNeNew = months.map((mo) => {
    const row = monthlyByDevice.find((r) => r.month === mo && r.service === 'NE Tutor');
    return row ? newForDevice(row, devAll) : null;
  });
  let pairSumM = 0;
  let pairSumN = 0;
  let pairN = 0;
  for (let i = 0; i < months.length; i++) {
    const a = yNeMau[i];
    const b = yNeNew[i];
    if (a != null && b != null) {
      pairSumM += a;
      pairSumN += b;
      pairN += 1;
    }
  }
  const avgPairM = pairN > 0 ? pairSumM / pairN : null;
  const avgPairN = pairN > 0 ? pairSumN / pairN : null;
  if (avgM != null && avgPairM != null && !nearlyEq(avgM, avgPairM)) {
    failures.push(`NE Tutor MAU 월평균 불일치: 카드규칙=${avgM}, 시리즈쌍=${avgPairM}`);
  }
  if (avgN != null && avgPairN != null && !nearlyEq(avgN, avgPairN)) {
    failures.push(`NE Tutor 신규 월평균 불일치: 카드규칙=${avgN}, 시리즈쌍=${avgPairN}`);
  }
  if (nP !== pairN) failures.push(`NE Tutor 페어 월 개수 불일치: ${nP} vs ${pairN}`);

  /** 6) 통합회원 PC+Mobile 신규: 결측은 0으로 합산, 세 지표 모두 결측일 때만 null */
  for (const r of monthlyByDevice) {
    if (r.service !== '통합회원') continue;
    const v = newForDevice(r, 'all');
    if (r.pcNew == null && r.moNew == null && r.teacherNew == null) {
      if (v != null) failures.push(`통합회원 ${r.month}: 전부 결측인데 신규합 ${v}`);
    } else {
      const sum = (r.pcNew ?? 0) + (r.moNew ?? 0) + (r.teacherNew ?? 0);
      if (v !== sum) failures.push(`통합회원 ${r.month}: 신규 ${v} vs 기대 ${sum}`);
    }
  }

  notes.push(`파일: ${path}`);
  notes.push(`by-device 행: ${monthlyByDevice.length}, ebook 월 행: ${ebookMonthly.length}, 구간 월 수: ${months.length}`);
  notes.push(`NE Tutor(PC+Mobile) 페어 월: ${nP}, 월평균 MAU≈${avgM != null ? avgM.toFixed(2) : '—'}, 신규≈${nP > 0 ? (sumN / nP).toFixed(2) : '—'}`);
  notes.push(`E-Book LAW 월평균(유효 월 ${nE}): ${cardE != null ? cardE.toFixed(2) : '—'}`);
  notes.push(`부가자료 개별 LAW 월평균(유효 월 ${nS}): ${cardS != null ? cardS.toFixed(2) : '—'}`);
  notes.push('');
  notes.push(
    '참고: 대시보드에서 E-Book·부가자료(LAW)는 PC 체크 시에만 차트·요약에 표시되며, NE Tutor 대비 % 분모는 NE Tutor PC MAU 월평균입니다.',
  );

  for (const line of notes) console.log(line);
  if (failures.length) {
    console.error('\n[실패]');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('\n[검증 통과] 위 산식·구간 기준으로 불일치 없음.');
}

main();
