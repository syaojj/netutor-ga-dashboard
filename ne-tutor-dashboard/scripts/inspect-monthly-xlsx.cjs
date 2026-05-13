/* eslint-disable */
const path = require('path');
const XLSX = require('xlsx');

const file = path.resolve(__dirname, '..', 'public', 'data', 'NE Tutor 데이터 현황_260513_월간data.xlsx');
console.log('FILE', file);
const wb = XLSX.readFile(file, { cellDates: true });
console.log('SHEETS', wb.SheetNames);

for (const name of wb.SheetNames) {
  console.log('\n=====================================');
  console.log('SHEET:', JSON.stringify(name));
  const ws = wb.Sheets[name];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  const rows = matrix.slice(0, 12);
  rows.forEach((r, i) => {
    console.log(String(i).padStart(2, '0'), JSON.stringify(r));
  });
  console.log('... totalRows:', matrix.length);
}
