import fs from 'node:fs'
import { calculateCost } from '../lib/costCalculator.js'
const constructionStartWeek = p => p.stages.find(s => !s.parallel && /^construction/i.test(s.stage))?.startWeek
const constructionMidDate = p => { const s=p.stages.filter(s=>!s.parallel && /^construction/i.test(s.stage)); return new Date((Date.parse(s[0].startDate)+Date.parse(s.at(-1).endDate))/2).toISOString().slice(0,10) }
import { budgetVerdict } from '../lib/senseCheck.js'
const file='public/sample/report.json'
const d=JSON.parse(fs.readFileSync(file,'utf8')), old=d.cost
process.env.RATES_FILE_URL='NRM1_Cost_Estimate_Tool_v5_2.xlsx'
const cost=await calculateCost(d.answers,d.programme.totalWeeks,d.programme.constructionWeeks,{rangeGrade:d.confidence.score,constructionMid:constructionMidDate(d.programme),weeksToConstruction:constructionStartWeek(d.programme),procurementRoute:d.procurement?.preferred?.route?.name})
// Refresh only range-dependent figures; the historic sample date and programme remain unchanged.
if(Math.abs(cost.total.mid-old.total.mid)>1) throw new Error('Sample central estimate changed: regenerate the full sample instead')
const budget=budgetVerdict(d.answers,cost), pairs=new Map()
const money=n=>'£'+(Math.round(n/1000)*1000).toLocaleString('en-GB')
for(const key of ['works','construction','total'])for(const bound of ['low','high'])pairs.set(money(old[key][bound]),money(cost[key][bound]))
if(d.budget?.margin!=null)pairs.set(money(d.budget.margin),money(budget.margin))
if(d.budget?.grossLow!=null)pairs.set(money(d.budget.grossLow),money(budget.grossLow))
if(d.budget?.grossHigh!=null)pairs.set(money(d.budget.grossHigh),money(budget.grossHigh))
const update=v=>typeof v==='string'?v.replace(/£[\d,]+/g,m=>pairs.get(m)||m):Array.isArray(v)?v.map(update):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,update(x)])):v
d.aiProse=update(d.aiProse);d.cost=cost;d.budget=budget
fs.writeFileSync(file,JSON.stringify(d,null,2)+'\n')
console.log('Sample refreshed',cost.workbookVersion,cost.rangeApplied,cost.total)
