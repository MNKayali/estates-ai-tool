import * as XLSX from 'xlsx';

const RATES_URL = 'https://raw.githubusercontent.com/MNKayali/estates-ai-tool/main/NRM1_Cost_Estimate_Tool_v3.xlsx';
const PROG_URL  = 'https://raw.githubusercontent.com/MNKayali/estates-ai-tool/main/Estates_AI_Programme_Duration_Reference_v2.xlsx';

async function fetchWorkbook(url) {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return XLSX.read(new Uint8Array(buf), { type: 'array' });
}

function printFullSheet(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return;
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  console.log(`\n=== "${sheetName}" (${data.length} rows) ===`);
  data.forEach((row, i) => {
    if (row.some(c => c !== '')) {
      console.log(`R${i+1}: ${JSON.stringify(row)}`);
    }
  });
}

async function main() {
  const wb1 = await fetchWorkbook(RATES_URL);
  printFullSheet(wb1, '2. Rates Reference Table');
  printFullSheet(wb1, '3. Percentage Rules');
  printFullSheet(wb1, '7. Scope Item Map');

  const wb2 = await fetchWorkbook(PROG_URL);
  printFullSheet(wb2, 'Design Stage Durations');
  printFullSheet(wb2, 'Construction Duration');
}

main().catch(console.error);
