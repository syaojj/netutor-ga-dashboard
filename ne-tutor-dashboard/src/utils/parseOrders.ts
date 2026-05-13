import * as XLSX from 'xlsx';
import type { OrderRecord, ParsedOrders } from '../types';

function excelSerialToDate(serial: number): Date {
  const utc = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(utc);
}

function parseOrderDate(cell: unknown): Date | null {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) return cell;
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    return excelSerialToDate(cell);
  }
  if (typeof cell === 'string') {
    const t = Date.parse(cell);
    if (!Number.isNaN(t)) return new Date(t);
  }
  return null;
}

export function parseOrdersWorkbook(buf: ArrayBuffer): ParsedOrders {
  const warnings: string[] = [];
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) {
    return { orders: [], warnings: ['시트 없음'] };
  }
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];
  if (rows.length < 3) {
    return { orders: [], warnings: ['주문 행이 충분하지 않음'] };
  }
  const header = (rows[0] as unknown[]).map((h) => String(h).trim());
  const idx = (name: string) => header.indexOf(name);

  const iId = idx('아이디');
  const iDate = idx('주문일');
  const iCat = idx('카테고리명');
  const iProd = idx('주문상품');
  const iStatus = idx('상태');
  if (iId < 0 || iDate < 0 || iCat < 0) {
    warnings.push('주문 엑셀 헤더(아이디/주문일/카테고리명) 확인 필요');
    return { orders: [], warnings };
  }

  const orders: OrderRecord[] = [];
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row || !row.length) continue;
    const userId = String(row[iId] ?? '').trim();
    if (!userId) continue;
    const dt = parseOrderDate(row[iDate]);
    if (!dt) continue;
    orders.push({
      userId,
      orderDate: dt,
      category: String(row[iCat] ?? '').trim(),
      product: String(row[iProd] ?? '').trim(),
      status: String(row[iStatus] ?? '').trim(),
    });
  }

  if (!orders.length) warnings.push('유효 주문 0건 — 엑셀 형식 확인');
  return { orders, warnings };
}

export function isGrammarCategory(cat: string): boolean {
  return cat.includes('문법문제뱅크') || cat.includes('문법') || cat.includes('문뱅');
}

/** 단기 상품: 1·3개월 (6·12개월 등은 장기로 분류) */
export function isShortTermGrammarProduct(product: string): boolean {
  return product === '1개월' || product === '3개월';
}

export function isLongTermGrammarProduct(product: string): boolean {
  return product === '6개월' || product === '12개월';
}
