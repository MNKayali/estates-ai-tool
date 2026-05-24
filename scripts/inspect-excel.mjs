// Temporary inspection script — run once to understand Excel structure
import * as XLSX from 'xlsx';

const RATES_URL = 'https://raw.githubusercontent.com/MNKayali/estates-ai-tool/main/NRM1_Cost_Estimate_Tool_v3.xlsx';
const PROG_URL  = 'https://raw.githubusercontent.com/MNKayali/estates-ai-tool/main/Estates_AI_Programme_Duration_Reference_v2.xlsx';

async function fetchWorkbook(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buf = await res.arrayBuffer();
  return XLSX.read(new Uint8Array(buf), { type: 'array' });
}

function printSheet(wb, sheetName, maxRows = 20) {
  const ws = wb.Sheets[sheetName];
  if (!ws) { console.log(`  !! Sheet not found: ${sheetName}`); return; }
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  console.log(`\n  Sheet: "${sheetName}" — ${data.length} rows`);
  for (let i = 0; i < Math.min(maxRows, data.length); i++) {
    console.log(`    R${i+1}: ${JSON.stringify(data[i])}`);
  }
  if (data.length > maxRows) console.log(`    ... (${data.length - maxRows} more rows)`);
}

async function main() {
  console.log('=== NRM1 Cost Workbook ===');
  const wb1 = await fetchWorkbook(RATES_URL);
  console.log('Sheet names:', wb1.SheetNames);
  for (const name of wb1.SheetNames) {
    printSheet(wb1, name, 25);
  }

  console.log('\n\n=== Programme Workbook ===');
  const wb2 = await fetchWorkbook(PROG_URL);
  console.log('Sheet names:', wb2.SheetNames);
  for (const name of wb2.SheetNames) {
    printSheet(wb2, name, 25);
  }
}

main().catch(console.error);
