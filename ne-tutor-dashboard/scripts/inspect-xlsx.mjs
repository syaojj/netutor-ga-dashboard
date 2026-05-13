import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const paths = [
  'C:/Users/snkang/Downloads/주문별현황2021~2026.xlsx',
  join(root, 'public', 'data', '주문별현황2021~2026.xlsx'),
];

let buf = null;
for (const p of paths) {
  try {
    buf = readFileSync(p);
    console.log('Using', p);
    break;
  } catch {
    /* try next */
  }
}
if (!buf) {
  console.error('xlsx not found');
  process.exit(1);
}
const wb = XLSX.read(buf, { type: 'buffer' });
console.log('Sheets:', wb.SheetNames);
for (const name of wb.SheetNames.slice(0, 3)) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  console.log('\n---', name, 'rows', rows.length);
  console.log('First 5 rows:');
  console.log(JSON.stringify(rows.slice(0, 5), null, 2));
}
