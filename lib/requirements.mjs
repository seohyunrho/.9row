// Each condition contributes at most once per posting. Shares describe mentions,
// not employability, importance, or the percentage of postings.
export function summarizeRequirements(jobs) {
  const counts = new Map();
  for (const job of jobs) {
    for (const text of new Set((job.requirements || '').split('\n').map(x=>x.trim()).filter(Boolean))) {
      const entry = counts.get(text) || {text, count:0, companies:[]};
      entry.count++; entry.companies.push(job.company); counts.set(text,entry);
    }
  }
  const entries = [...counts.values()].sort((a,b)=>b.count-a.count || a.text.localeCompare(b.text,'ko'));
  const total = entries.reduce((sum,item)=>sum+item.count,0);
  const slices = entries.slice(0,5).map(item=>({...item}));
  if(entries.length>5) slices.push({text:`기타 ${entries.length-5}개 조건`,count:entries.slice(5).reduce((sum,item)=>sum+item.count,0)});
  return {entries, total, slices, jobCount:jobs.length};
}
