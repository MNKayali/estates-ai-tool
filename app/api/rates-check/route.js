import { getRates } from '@/lib/parseRates'

export async function GET() {
  try {
    const rates = await getRates()
    const sheets = Object.keys(rates)
    const summary = {}

    sheets.forEach(name => {
      const data = rates[name]
      const dataRows = data.filter(r =>
        Array.isArray(r) && r.length > 2 &&
        typeof r[0] === 'string' && !isNaN(r[0]) && r[0].trim() !== ''
      )
      summary[name] = {
        totalRows: data.length,
        dataRows: dataRows.length,
        firstRow: data[0] || null,
        sampleDataRows: dataRows.slice(0, 3),
      }
    })

    // Quick sanity check on Rates Reference Table
    const rrt = rates['Rates Reference Table']
    const rrtCheck = rrt
      ? {
          found: true,
          rows: rrt.length,
          headerRow: rrt[3] || null,
          firstGroupRow: rrt[4] || null,
          firstDataRow: rrt.find(r => Array.isArray(r) && typeof r[0] === 'string' && !isNaN(r[0]) && r[0].trim() !== '' && r.length > 4) || null,
        }
      : { found: false }

    return Response.json({
      status: 'OK',
      message: 'Excel rates file loaded successfully from filesystem',
      sheetsFound: sheets,
      ratesReferenceTable: rrtCheck,
      summary,
    })
  } catch (e) {
    return Response.json({
      status: 'ERROR',
      error: e.message,
      hint: 'Check that NRM1_Cost_Estimate_Tool_v2.xlsx exists at the project root and is committed to git',
    }, { status: 500 })
  }
}
