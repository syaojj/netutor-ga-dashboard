/* eslint-disable */
const path = require('path');
const XLSX = require('xlsx');

const SERVICE_SHEET_MAP = {
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

function parseNumber(raw) {
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

function monthKeyFromCell(cell) {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, '0')}`;
  }
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    const n = cell;
    if (n > 2000 && n < 2101) {
      const y = Math.floor(n + 1e-9);
      const rem = n - y;
      const month = Math.round(rem * 100 + 1e-4);
      if (month >= 1 && month <= 12) return `${y}-${String(month).padStart(2, '0')}`;
    }
  }
  const s = String(cell ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})[.\-/](\d{1,2})$/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}`;
  return null;
}

function findMonthHeader(matrix) {
  for (let i = 0; i < Math.min(matrix.length, 30); i++) {
    const row = matrix[i] || [];
    const labelCell = String(row[0] ?? '').trim();
    if (labelCell !== '월별') continue;
    const monthCols = [];
    for (let j = 1; j < row.length; j++) {
      const mk = monthKeyFromCell(row[j]);
      if (mk) monthCols.push({ col: j, month: mk });
    }
    if (monthCols.length > 0) return { headerIdx: i, monthCols };
  }
  return null;
}

function rowsByLabel(matrix, startIdx) {
  const out = new Map();
  for (let i = startIdx; i < matrix.length; i++) {
    const row = matrix[i] || [];
    const label = String(row[0] ?? '').trim();
    if (!label) continue;
    if (!out.has(label)) out.set(label, row);
  }
  return out;
}

function parseServiceSheet(service, matrix) {
  const head = findMonthHeader(matrix);
  if (!head) return [];
  const lm = rowsByLabel(matrix, head.headerIdx + 1);
  const pcMauRow = lm.get('PC 활성사용자수');
  const moMauRow = lm.get('MO 활성사용자수');
  const pcNewRow = lm.get('PC 새사용자수');
  const moNewRow = lm.get('MO 새사용자수');
  const rows = [];
  for (const { col, month } of head.monthCols) {
    rows.push({
      service, month,
      pcMau: pcMauRow ? parseNumber(pcMauRow[col]) : 0,
      moMau: moMauRow ? parseNumber(moMauRow[col]) : 0,
      pcNew: pcNewRow ? parseNumber(pcNewRow[col]) : 0,
      moNew: moNewRow ? parseNumber(moNewRow[col]) : 0,
      teacherNew: 0,
    });
  }
  return rows;
}

function parseMemberSheet(matrix) {
  const head = findMonthHeader(matrix);
  if (!head) return [];
  const lm = rowsByLabel(matrix, head.headerIdx + 1);
  const pcRow = lm.get('PC');
  const moRow = lm.get('Mobile') || lm.get('MO') || lm.get('모바일');
  const tcRow = lm.get('교강사') || lm.get('교사');
  const rows = [];
  for (const { col, month } of head.monthCols) {
    rows.push({
      service: '통합회원', month,
      pcMau: 0, moMau: 0,
      pcNew: pcRow ? parseNumber(pcRow[col]) : 0,
      moNew: moRow ? parseNumber(moRow[col]) : 0,
      teacherNew: tcRow ? parseNumber(tcRow[col]) : 0,
    });
  }
  return rows;
}

function parseEbookSheet(matrix) {
  const head = findMonthHeader(matrix);
  if (!head) return [];
  const lm = rowsByLabel(matrix, head.headerIdx + 1);
  const clickRow =
    lm.get('E-book 클릭 수 (중복포함)') ||
    lm.get('E-Book 클릭 수 (중복포함)') ||
    lm.get('클릭 수') ||
    lm.get('클릭수');
  if (!clickRow) return [];
  const usersRow = lm.get('E-Book 이용자수 (중복제거)');
  const supFullRow = lm.get('부가자료전체다운로드(중복포함)');
  const supIndRow = lm.get('부가자료개별다운로드(중복제거)');
  const rows = [];
  for (const { col, month } of head.monthCols) {
    const v = parseNumber(clickRow[col]);
    const [y, m] = month.split('-');
    rows.push({
      year: Number(y),
      month: Number(m),
      monthKey: month,
      clicks: Math.round(v),
      lawEbookUniqueUsers: usersRow ? (parseNumber(usersRow[col]) || null) : null,
      lawSupplementaryFullDownloads: supFullRow ? (parseNumber(supFullRow[col]) || null) : null,
      lawSupplementaryIndividualDownloads: supIndRow ? (parseNumber(supIndRow[col]) || null) : null,
    });
  }
  rows.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  return rows;
}

const file = path.resolve(__dirname, '..', 'public', 'data', 'NE Tutor 데이터 현황_260514_v2.0_월간data.xlsx');
const wb = XLSX.readFile(file, { cellDates: true });
const all = [];
let ebook = [];
for (const sn of wb.SheetNames) {
  const t = sn.trim();
  const ws = wb.Sheets[sn];
  const mtx = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  if (SERVICE_SHEET_MAP[t]) {
    const rows = parseServiceSheet(SERVICE_SHEET_MAP[t], mtx);
    all.push(...rows);
    console.log(`[${t} → ${SERVICE_SHEET_MAP[t]}] rows: ${rows.length}`);
  } else if (t === MEMBER_SHEET) {
    const rows = parseMemberSheet(mtx);
    all.push(...rows);
    console.log(`[${t}] rows: ${rows.length}`);
  } else if (t === EBOOK_SHEET) {
    ebook = parseEbookSheet(mtx);
    console.log(`[${t}] rows: ${ebook.length}`);
  } else if (/\s+law$/i.test(t) || t.startsWith('교재별')) {
    console.log(`(skip) ${t}`);
  } else {
    console.log(`(skip) ${t}`);
  }
}
console.log('\n=== samples ===');
for (const svc of ['NE Tutor', '통합회원', 'NELT', '문법문제', '문법예문', '어휘출제', '클래스카드', '교재자료']) {
  const r = all.find(x => x.service === svc && x.month === '2026-04');
  console.log(svc, '2026-04 →', r);
}
console.log('ebook last:', ebook[ebook.length - 1]);
