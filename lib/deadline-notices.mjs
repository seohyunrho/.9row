const DAY=86400000;
const submittedStatuses=new Set(['지원 완료','서류 검토 중','면접','합격','불합격']);
function calendarDay(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;
  const time=Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?time:null;
}

// Only explicitly linked applications count as submitted; company names are not IDs.
export function deadlineNotices(data,today){
  const base=calendarDay(today);
  if(base===null)return [];
  const submitted=new Set((data.applications||[]).filter(a=>a.jobId&&submittedStatuses.has(a.status)).map(a=>a.jobId));
  return (data.jobs||[]).flatMap(job=>{
    const date=calendarDay(job.deadline);
    if(date===null||date<base||submitted.has(job.id))return [];
    const days=(date-base)/DAY;
    const essays=(data.essays||[]).filter(e=>e.jobId===job.id);
    const written=essays.filter(e=>typeof e.draft==='string'&&e.draft.trim()).length;
    const missing=essays.length-written;
    const needsWriting=written===0||missing>0;
    return [{job,days,written,total:essays.length,missing,urgent:days<=3&&needsWriting,
      status:written===0?'자소서 시작 전':missing>0?`작성 중 · 미작성 ${missing}문항`:'작성 중 · 본문 저장'}];
  }).sort((a,b)=>Number(b.urgent)-Number(a.urgent)||a.days-b.days||a.job.id.localeCompare(b.job.id));
}
