import {allowedPage,formAgent,automaticPlan,educationFamily} from './autofill-core.js';
const $=id=>document.getElementById(id);
$('extension-version').textContent='확장 '+(chrome.runtime.getManifest?.().version||'미리보기');
let sections=[],scan=null,targetTab=null,mappings=[],connected=false,working=false;
let activeRecord=null,batchPlans=null;
const ALL_EDUCATIONS='__moa_all_educations__';
const records=()=>sections.find(s=>s.key===$('section').value)?.records||[];
const isBatch=()=>$('section').value==='educations'&&$('record').value===ALL_EDUCATIONS;
const chosen=()=>activeRecord||records().find(r=>r.id===$('record').value);
const orderedEducations=()=>records().map((record,index)=>({record,index,rank:({highschool:0,college:1,graduateSchool:2})[educationFamily(record.fields)]??3})).sort((a,b)=>a.rank-b.rank||a.index-b.index).map(item=>item.record);
const majorLabel=key=>key==='doubleMajor'?'복수전공':'주전공';
function majorSkipReason(key='major'){
  if(!chosen()?.fields.some(f=>f.key===key&&f.value))return '';
  const count=scan?.controls.filter(c=>c.autoMajor&&(c.majorKey||'major')===key&&c.type==='search'&&!c.filled).length||0;
  return count>1?majorLabel(key)+'으로 인식한 미선택 전공 줄이 '+count+'개여서 입력 위치를 정하지 못했어요. 각 전공 한 줄만 자동 입력합니다. 추가로 연 미입력 전공 줄을 정리한 뒤 입력란을 다시 확인해 주세요.':'';
}
const majorWarnings=()=>['major','doubleMajor'].map(majorSkipReason).filter(Boolean).join('\n');
function majorToFill(key='major'){
  const majors=scan?.controls.filter(c=>c.autoMajor&&(c.majorKey||'major')===key&&c.type==='search'&&!c.filled)||[];
  const values=chosen()?.fields.filter(f=>f.key===key&&f.value)||[];
  return majors.length===1&&values.length===1?{id:majors[0].id,value:values[0].value,majorScope:majors[0].majorScope}:null;
}
const majorCount=()=>['major','doubleMajor'].filter(key=>majorToFill(key)).length;
function schoolToFill(){
  const schools=scan?.controls.filter(c=>c.inline&&c.type==='search'&&c.label==='학교명'&&!c.filled)||[];
  const values=chosen()?.fields.filter(f=>f.key==='schoolName'&&f.value)||[];
  return schools.length===1&&values.length===1?{id:schools[0].id,value:values[0].value}:null;
}
const message=(text,error=false)=>{$('result').textContent=text;$('result').dataset.error=String(error);if($('connection').open){$('connection-result').textContent=text;$('connection-result').dataset.error=String(error);$('connection-result').scrollIntoView({block:'nearest'});}};
const option=(value,label)=>{const e=document.createElement('option');e.value=value;e.textContent=label;return e;};
const send=async(type,extra={})=>{const r=await chrome.runtime.sendMessage({type,...extra});if(!r?.ok)throw Error(r?.error||'확장 프로그램을 다시 열어 주세요.');return r;};
function controls(){
  const batch=isBatch()&&!activeRecord;
  $('load').disabled=working||!connected;$('scan').disabled=working||!(batch?records().length:chosen());
  const count=batch?(batchPlans||[]).reduce((sum,p)=>sum+(p.error?0:p.count),0):mappings.filter(m=>m.key).length+(schoolToFill()?1:0)+majorCount();
  $('fill').disabled=working||!(batch?batchPlans:scan)||!count;$('connect').disabled=working;
  $('fill').textContent=count?(batch?'학력 전체 · 연결된 ':'자동으로 연결된 ')+count+'개 입력':'자동 입력할 항목 없음';
  $('diagnose').disabled=working;
  $('watch-search').disabled=working;
  $('diagnostic-download').disabled=working;
  for(const id of ['section','record','workspace','server','disconnect'])$(id).disabled=working;
}
async function run(task){if(working)return;working=true;controls();message('확인하고 있어요…');try{await task();}catch(e){message(e.message,true);}finally{working=false;controls();}}
function clearScan(){scan=null;targetTab=null;mappings=[];batchPlans=null;$('preview').replaceChildren();$('target').textContent='';$('scan-note').textContent='';$('fill-results').replaceChildren();controls();}
function clearProfile(){sections=[];$('record-picker').hidden=true;clearScan();}
function showRecord(){
  clearScan();const selected=isBatch()?orderedEducations():chosen()?[chosen()]:[];
  $('record-empty').textContent=isBatch()?'저장한 학력을 고등학교 → 대학교 → 대학원 순서로 한 번에 입력합니다. 지원서의 해당 학력 구역을 펼쳐 주세요.':selected.length?'선택한 기록을 입력합니다. 여러 학력은 ‘학력 전체’를 선택해 한 번에 채울 수 있어요.':'이 종류의 기록이 없어요. 모아의 내 정보에서 먼저 저장해 주세요.';
  $('values').replaceChildren();
  for(const record of selected){
  if(isBatch()){const heading=document.createElement('strong');heading.textContent=record.title;$('values').append(heading);}
  for(const f of record?.fields.filter(f=>f.value)||[]){const row=document.createElement('div');row.className='value-row';const label=document.createElement('small');label.textContent=f.label;const value=document.createElement('span');value.textContent=f.value;const copy=document.createElement('button');copy.className='quiet';copy.textContent='값 복사';copy.setAttribute('aria-label',f.label+' 값 복사');copy.onclick=async()=>{try{await navigator.clipboard.writeText(f.value);message(f.label+'을 복사했어요.');}catch{message('복사하지 못했어요. 표시된 값을 직접 복사해 주세요.',true);}};row.append(label,value,copy);$('values').append(row);}
  }
  controls();
}
function showSection(){const items=records();$('record').replaceChildren(...($('section').value==='educations'&&items.length>1?[option(ALL_EDUCATIONS,'학력 전체 · '+items.length+'개 학교')]:[]),...items.map(r=>option(r.id,r.title)));showRecord();}
async function pageAction(action,extra={}){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!scan||tab?.id!==targetTab?.id||tab?.url!==targetTab?.url)throw Error('페이지가 바뀌었어요. 입력란을 다시 확인해 주세요.');
  const [response]=await chrome.scripting.executeScript({target:{tabId:targetTab.id,frameIds:[0]},func:formAgent,args:[action,{scanId:scan.scanId,...extra}]});
  if(!response?.result||response.result.error)throw Error(response?.result?.error||'검색창 응답을 확인하지 못했어요.');
  return response.result;
}
function searchRow(row,c,fields){
  if(c.autoMajor){
    const key=c.majorKey||'major',major=majorToFill(key),value=document.createElement('div'),note=document.createElement('small');value.className='mapped-value';value.textContent=fields.find(f=>f.key===key)?.value||'모아에 저장한 '+majorLabel(key)+'명이 없어요.';
    note.textContent=major?(c.planNote?c.planNote+'. ':'')+'아래 자동 입력 버튼에 포함됩니다. 저장된 '+majorLabel(key)+'명을 검색하고 '+majorLabel(key)+' 구분을 확인한 뒤 계열·평점·만점도 이어서 채웁니다.':majorSkipReason(key)||'저장된 '+majorLabel(key)+'이나 입력할 영역을 하나로 확인하지 못해 자동 입력에서 제외합니다.';row.append(value,note);return;
  }
  if(c.inline&&c.label==='학교명'){
    const school=schoolToFill();const value=document.createElement('div');value.className='mapped-value';value.textContent=fields.find(f=>f.key==='schoolName')?.value||'모아에 저장한 학교명이 없어요.';
    const note=document.createElement('small');note.textContent=school?'아래 자동 입력 버튼에 포함됩니다. 학교를 검색·선택한 뒤 나머지 학적 정보를 이어서 채웁니다. 이름·캠퍼스가 정확히 일치하는 결과가 하나일 때 선택합니다.':'저장된 학교명이나 입력할 학교 영역을 하나로 확인하지 못해 자동 입력에서 제외합니다.';
    row.append(value,note);return;
  }
  const picker=document.createElement('select');picker.setAttribute('aria-label',c.label+' 검색에 사용할 정보');
  const candidates=fields.filter(f=>c.label==='학교명'?f.key==='schoolName':['major','doubleMajor','minor'].includes(f.key));
  picker.append(...candidates.map(f=>option(f.key,f.label+' · '+f.value)));
  const begin=document.createElement('button');begin.className='secondary';begin.textContent=c.label+' 검색 시작';begin.disabled=!candidates.length;
  const note=document.createElement('small');note.textContent='저장한 이름으로 검색한 뒤 결과를 확인하고 선택합니다. 이미 등록한 학교·전공을 변경할 때는 사이트에서 직접 확인해 주세요.';
  const results=document.createElement('div');const refresh=document.createElement('button');refresh.textContent='검색 결과 확인';refresh.className='quiet';refresh.hidden=true;
  const retry=document.createElement('button');retry.textContent='열린 검색창에 이름 넣기';retry.className='quiet';retry.hidden=true;
  const query=async()=>{await pageAction('search-query');retry.hidden=true;refresh.hidden=false;message('검색했어요. 결과가 나타나면 검색 결과 확인을 눌러 주세요.');};
  if(c.inline){begin.textContent=c.label+' 검색어 자동 입력';note.textContent='저장한 전공명을 검색칸에 넣습니다. 전공 결과는 사이트에서 직접 선택해 주세요.';}
  begin.onclick=()=>run(async()=>{
    results.replaceChildren();refresh.hidden=true;
    const r=await pageAction('search-open',{id:c.id,value:candidates.find(f=>f.key===picker.value)?.value});
    if(r.inline){message('전공 검색어를 넣었어요. 전공 결과는 사이트에서 선택해 주세요.');return;}
    retry.hidden=false;await new Promise(resolve=>setTimeout(resolve,400));await query();
  });
  retry.onclick=()=>run(query);
  refresh.onclick=()=>run(async()=>{
    const r=await pageAction('search-results');results.replaceChildren();
    if(!r.results.length){message('이름이 정확히 일치하는 선택 버튼을 찾지 못했어요. 사이트의 검색 결과에서 학교·전공을 직접 골라 주세요.');return;}
    for(const candidate of r.results){const b=document.createElement('button');b.className='secondary';b.textContent=candidate.label+' 선택';b.onclick=()=>run(async()=>{await pageAction('search-select',{id:candidate.id});clearScan();message('선택을 요청했어요. 사이트에서 반영된 내용을 확인한 뒤 입력란을 다시 확인해 주세요.');});results.append(b);}
    message('학교명과 캠퍼스가 맞는지 사이트에서 확인한 뒤 선택해 주세요.');
  });
  if(candidates.length>1)row.append(picker);
  else {const value=document.createElement('div');value.className='mapped-value';value.textContent=candidates[0]?.value||'모아에 저장한 이름이 없어요.';row.append(value);}
  row.append(note,begin,retry,refresh,results);
}
function renderPreview(){
  $('preview').replaceChildren();const fields=chosen()?.fields||[];
  const plan=automaticPlan(scan.controls,fields);const ready=plan.filter(c=>c.status==='ready');
  mappings=ready.map(c=>({id:c.id,key:c.key}));
  const count=ready.length+(schoolToFill()?1:0)+majorCount();
  const heading=document.createElement('p');heading.className='plan-summary';heading.textContent=count?'자동 연결 '+count+'개 · 아래 내용으로 채웁니다':'현재 화면에서 자동 입력할 수 있는 항목을 찾지 못했어요.';$('preview').append(heading);
  const makeRow=c=>{const row=document.createElement('div');row.className='mapping';const title=document.createElement('strong');title.className='field-name';title.textContent=c.label;row.append(title);return row;};
  for(const c of ready){const row=makeRow(c);const value=document.createElement('div');value.className='mapped-value';value.textContent=c.replaceSelection&&c.selectedValue?`${c.selectedValue} → ${c.value}`:c.value;row.append(value);$('preview').append(row);}
  for(const c of plan.filter(c=>c.status==='search')){const row=makeRow(c);searchRow(row,c,fields.filter(f=>f.value));$('preview').append(row);}
  for(const [status,title] of [['pending','아직 자동 입력이 연결되지 않은 항목'],['kept','이미 작성돼 유지하는 항목']]){
    const items=plan.filter(c=>c.status===status);if(!items.length)continue;
    const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=title+' '+items.length+'개';details.append(summary);
    for(const c of items){const row=makeRow(c);const note=document.createElement('small');note.textContent=c.reason;row.append(note);details.append(row);}$('preview').append(details);
  }
  $('scan-note').textContent='저장된 정보는 항목별 선택 없이 자동으로 연결합니다. 연결되지 않은 항목은 이번 입력에 포함하지 않습니다.'+(scan.hasFrames?' 페이지에 별도 프레임이 있습니다. 그 안에 지원서 입력란이 있는지는 아직 확인하지 못했습니다.':'');
}
$('connect').onclick=()=>run(async()=>{if(!/^[a-f0-9]{64}$/.test($('token').value.trim()))throw Error('연결 코드가 비어 있거나 형식이 달라요. 모아 웹의 설정 → 연결 상태 → 연결 코드 복사에서 가져와 주세요.');await send('autofill-connect',{server:$('server').value,token:$('token').value.trim()});$('token').value='';connected=true;clearProfile();$('connection-status').textContent='연결됨';$('disconnect').hidden=false;$('connection-result').textContent='연결했어요.';$('connection-result').dataset.error='false';$('connection').open=false;message('연결했어요. 가져올 자료 공간을 확인해 주세요.');});
$('disconnect').onclick=()=>run(async()=>{await send('autofill-disconnect');connected=false;clearProfile();$('connection-status').textContent='연결 전';$('disconnect').hidden=true;message('연결을 해제했어요.');});
$('server').onchange=()=>run(async()=>{await send('autofill-disconnect');connected=false;clearProfile();$('connection-status').textContent='재연결 필요';message('선택한 사무실에서 복사한 코드로 다시 연결해 주세요.');});
$('workspace').onchange=()=>{clearProfile();message('선택한 공간의 기본 정보를 다시 불러와 주세요.');};
$('load').onclick=()=>run(async()=>{clearProfile();const r=await send('autofill-profile',{workspace:$('workspace').value});sections=r.sections;$('section').replaceChildren(...sections.map(s=>option(s.key,s.label)));$('record-picker').hidden=false;showSection();message('저장한 정보를 불러왔어요. 사이트에는 아직 입력하지 않았습니다.');});
$('section').onchange=showSection;$('record').onchange=showRecord;
async function scanPage(expectedTab){
  clearScan();const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(expectedTab&&(tab?.id!==expectedTab.id||tab?.url!==expectedTab.url))throw Error('페이지가 바뀌었어요. 입력란을 다시 확인해 주세요.');
  if(!tab?.id||!allowedPage(tab.url))throw Error('S-OIL·HS효성·현대오토에버 지원서 또는 모아 자동 입력 시험 페이지에서 확장을 열어 주세요.');
  const [response]=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},func:formAgent,args:['scan',{education:$('section').value==='educations',family:educationFamily(chosen()?.fields||[]),requireEducationScope:isBatch(),primaryMajor:chosen()?.fields.find(f=>f.key==='major')?.value||'',doubleMajor:chosen()?.fields.find(f=>f.key==='doubleMajor')?.value||''}]});
  if(response?.result?.error)throw Error(response.result.error);if(!response?.result)throw Error('페이지를 새로고침한 뒤 다시 확인해 주세요.');
  scan=response.result;targetTab={id:tab.id,url:tab.url};$('target').textContent='입력 대상: '+scan.origin;renderPreview();message(majorWarnings()||(mappings.length||schoolToFill()||majorCount()?'저장된 정보를 자동으로 연결했어요. 내용 확인 후 입력 버튼을 눌러 주세요.':'현재 사이트의 입력 방식에 맞춘 추가 연결이 필요해요. 아래 지원서 구조 복사로 원인을 확인할 수 있습니다.'));
}
async function scanEducations(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});clearScan();
  if(!tab?.id||!allowedPage(tab.url))throw Error('지원서 페이지에서 확장을 열어 주세요.');
  if(!['s-oil.recruiter.co.kr','hshyosung.recruiter.co.kr'].includes(new URL(tab.url).hostname))throw Error('학력 전체 입력은 S-OIL·HS효성에서 먼저 지원합니다. 다른 사이트는 사용할 기록에서 학교 하나를 선택해 주세요.');
  const original={id:tab.id,url:tab.url},items=orderedEducations(),plans=[];
  try{
    for(const record of items){
      const family=educationFamily(record.fields);activeRecord=record;
      const entry={record,family,count:0,rows:[],error:''};plans.push(entry);
      if(!family){entry.error='모아에서 학교 구분을 먼저 저장해 주세요.';continue;}
      if(items.filter(r=>educationFamily(r.fields)===family).length>1){entry.error='같은 학력 종류의 기록이 여러 개여서 자동 배정을 보류했어요. 이 학교는 사용할 기록에서 따로 선택해 주세요.';continue;}
      try{
        await scanPage(original);const plan=automaticPlan(scan.controls,record.fields);
        entry.count=mappings.length+(schoolToFill()?1:0)+majorCount();
        entry.rows=plan.map(p=>({label:p.label,text:p.status==='ready'?(p.replaceSelection&&p.selectedValue?p.selectedValue+' → ':'')+p.value:p.status==='search'?(record.fields.find(f=>f.key===(p.autoMajor?p.majorKey:'schoolName'))?.value||'연결 확인 필요'):p.reason||'확인 필요'}));
      }catch(error){entry.error=error.message;}
    }
  }finally{activeRecord=null;scan=null;mappings=[];}
  batchPlans=plans;targetTab=original;$('preview').replaceChildren();$('fill-results').replaceChildren();
  for(const item of plans){
    const row=document.createElement('div');row.className='mapping';const title=document.createElement('strong');title.className='field-name';title.textContent=item.record.title;row.append(title);
    const note=document.createElement('p');note.textContent=item.error?'확인 필요 · '+item.error:item.count+'개 자동 연결';row.append(note);
    if(!item.error)for(const field of item.rows){const value=document.createElement('div');value.className='mapped-value';value.textContent=field.label+' · '+field.text;row.append(value);}
    $('preview').append(row);
  }
  $('target').textContent='입력 대상: '+new URL(original.url).origin;
  $('scan-note').textContent='연결된 학력만 순서대로 입력하며, 확인이 필요한 학교는 이번 입력에서 제외합니다.';
  const failed=plans.filter(p=>p.error).length;message('학력 '+plans.length+'개 확인 · '+failed+'개 연결 확인 필요'+(failed?'\n학교별 안내를 확인해 주세요.':''));controls();
}
$('scan').onclick=()=>run(()=>isBatch()?scanEducations():scanPage());
$('watch-search').onclick=()=>run(async()=>{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id||!allowedPage(tab.url))throw Error('S-OIL 또는 HS효성 지원서 화면에서 확장을 열어 주세요.');
  const [response]=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},func:formAgent,args:['watch-search']});
  if(!response?.result||response.result.error)throw Error(response?.result?.error||'검색 구조 기록을 시작하지 못했어요.');
  message(response.result.watching?'60초 동안 선택창 구조만 기록합니다. 확장을 닫고 학교·전공 검색 결과나 계열·만점 기준 목록을 열어 본 뒤, 다시 확장에서 진단 파일 저장을 눌러 주세요.':'관찰할 검색·선택 항목을 찾지 못했어요. 학력 화면에서 진단 파일 저장을 눌러 주세요.');
});
async function collectDiagnostic(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id||!allowedPage(tab.url))throw Error('S-OIL·HS효성·현대오토에버 지원서 화면에서 확장을 열어 주세요.');
  const [response]=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},func:formAgent,args:['diagnose']});
  if(!response?.result||response.result.error)throw Error(response?.result?.error||'양식 구조를 확인하지 못했어요.');
  const data=response.result;
  if(data.version!==3||!data.captureId)throw Error('새 진단 코드가 실행되지 않았어요. 확장을 닫았다 다시 열어 주세요. 이전 결과는 복사하지 않았습니다.');
  data.extensionVersion=chrome.runtime.getManifest?.().version||'preview';
  const text=JSON.stringify(data,null,2);$('diagnostic-preview').textContent=text;
  const nodes=[...(data.recordedSearchStructures||[]),...(data.recordedChoiceStructures||[]),...(data.recordedChangeStructures||[])].reduce((sum,s)=>sum+s.nodes.length,0);
  $('diagnostic-status').textContent='방금 수집 · 입력칸 '+data.fields.length+'개 / 관찰 대상 '+data.watchStatus.inputs+'개 / 검색 입력 감지 '+data.watchStatus.inputEvents+'회 / 기록된 구조 '+nodes+'개 / 변화 영역 '+(data.watchStatus.changedRegions||0)+'개';
  return {text,data};
}
$('diagnose').onclick=()=>run(async()=>{
  const {text}=await collectDiagnostic();
  try{await navigator.clipboard.writeText(text);message('새 진단을 복사했어요. 아래 수집 결과도 함께 확인해 주세요.');}
  catch{$('diagnostic-details').open=true;message('수집은 됐지만 복사에 실패했어요. 기존 클립보드는 사용하지 말고 진단 파일 저장을 눌러 주세요.',true);}
});
$('diagnostic-download').onclick=()=>run(async()=>{
  const {text,data}=await collectDiagnostic();const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='moa-form-diagnostic-'+data.captureId+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  message('새 진단 파일의 다운로드를 요청했어요. 다운로드된 JSON 파일을 이 채팅에 첨부해 주세요. 입력값·자소서·연결 코드는 포함하지 않았습니다.');
});
async function fillCurrent(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(tab?.id!==targetTab?.id||tab?.url!==targetTab?.url){clearScan();throw Error('페이지가 바뀌었어요. 입력란을 다시 확인해 주세요.');}
  const results=[];let school=schoolToFill();const originalTab=targetTab;
  const highschool=educationFamily(chosen()?.fields||[])==='highschool';
  const expectedMajors=new Map();let activeMajor='';
  const fieldStage=key=>highschool&&key==='status'?'schoolStatus':['majorCategory','majorGpa','majorGpaScale','majorCredits'].includes(key)?'major':key.startsWith('doubleMajor')?'doubleMajor':'school';
  const fillStage=async stage=>{
    const fields=chosen()?.fields||[];
    const entries=mappings.filter(m=>m.key&&fieldStage(m.key)===stage).map(m=>({id:m.id,value:fields.find(f=>f.key===m.key)?.value}));
    if(!entries.length)return false;
    message((stage==='schoolStatus'?'고등학교 졸업구분':stage==='school'?'학교 정보':majorLabel(stage)+' 정보')+'를 위에서 아래로 입력하고 있어요…');
    const response=await pageAction('fill',{entries,order:'top-down'});
    if(!response.results)throw Error('입력 결과를 확인하지 못했어요. 지원서를 확인해 주세요.');
    results.push(...response.results);
    const attempted=new Set(entries.map(e=>e.id));mappings=mappings.filter(m=>!attempted.has(m.id));
    return true;
  };
  const rememberMajors=()=>{for(const key of ['major','doubleMajor']){const target=majorToFill(key);if(target&&!expectedMajors.has(key))expectedMajors.set(key,target);}};
  rememberMajors();
  try{
    if(highschool&&await fillStage('schoolStatus')){await scanPage(originalTab);school=schoolToFill();}
    if(school){
      message('학교를 검색·선택하고 있어요. 확인되면 나머지 학적 정보도 이어서 채웁니다…');
      const selected=await pageAction('search-open',school);
      if(!selected.selected)throw Error('학교 선택을 확인하지 못해 나머지 입력을 중단했어요.');
      results.push({label:'학교명',ok:true});await scanPage(originalTab);
    }
    rememberMajors();
    if(await fillStage('school')){
      if(expectedMajors.size||mappings.some(m=>['major','doubleMajor'].includes(fieldStage(m.key))))await scanPage(originalTab);
    }
    for(const key of ['major','doubleMajor']){
      let major=majorToFill(key);const expected=expectedMajors.get(key),label=majorLabel(key);
      if(!major&&expected){
        activeMajor=label;
        // A dependent row can temporarily disappear from the plan while the
        // site enables controls. Keep the previewed task instead of dropping it.
        for(let attempt=0;attempt<8&&!major;attempt++){
          message(label+' 검색칸이 준비되는지 다시 확인하고 있어요…');
          await new Promise(resolve=>setTimeout(resolve,250));await scanPage(originalTab);major=majorToFill(key);
        }
        if(!major)throw Error(label+' 검색 전 중단: 미리보기에서 연결한 전공 줄을 다시 확인하지 못했어요. 현재 화면을 유지하고 진단 파일 저장으로 구조를 확인해 주세요.');
      }
      if(major){
        activeMajor=label;
        if(expected?.majorScope&&major.majorScope!==expected.majorScope)throw Error(label+' 검색 전 중단: 미리보기와 다른 전공 줄이어서 입력하지 않았어요. 입력란을 다시 확인해 주세요.');
        message('저장한 '+label+'을 검색·선택하고 있어요…');
        const selected=await pageAction('search-open',major);
        if(!selected.selected)throw Error(label+' 선택을 확인하지 못해 나머지 입력을 중단했어요.');
        results.push({label,ok:true,selectedName:selected.selectedName});activeMajor='';await scanPage(originalTab);
        // Finish this row before descending to the next one, including controls
        // that the site enables a little later than the selected-name display.
        const awaitingFields=()=>automaticPlan(scan.controls.filter(c=>c.majorScope===major.majorScope&&c.unsupportedReason==='현재 사이트에서 비활성화된 항목').map(c=>({...c,unsupported:false})),chosen()?.fields||[]).some(c=>c.status==='ready');
        for(let attempt=0;attempt<8&&awaitingFields();attempt++){
          message(label+'의 나머지 입력칸을 준비하고 있어요…');
          await new Promise(resolve=>setTimeout(resolve,250));await scanPage(originalTab);
        }
      }
      if(await fillStage(key)){
        if(key==='major'&&(expectedMajors.has('doubleMajor')||majorToFill('doubleMajor')||mappings.some(m=>fieldStage(m.key)==='doubleMajor')))await scanPage(originalTab);
      }
    }
    if(!results.length)throw Error('자동 입력할 항목이 없어요. 입력란을 다시 확인해 주세요.');
  }catch(error){
    const showMajorFailure=()=>{if(activeMajor){const li=document.createElement('li');li.textContent=activeMajor+': '+error.message;$('fill-results').append(li);}};
    if(results.some(r=>r.ok)){
      clearScan();for(const r of results.filter(r=>r.ok)){const li=document.createElement('li');li.textContent=r.label+': '+(['학교명','주전공','복수전공'].includes(r.label)?'선택 확인됨':'입력됨');$('fill-results').append(li);}
      showMajorFailure();
      const failure=Error((results.some(r=>['주전공','복수전공'].includes(r.label))?'전공은 선택됐지만':results.some(r=>r.label==='학교명')?'학교는 선택됐지만':'앞선 항목은 입력됐지만')+' 나머지 입력을 끝까지 확인하지 못했어요. '+error.message);failure.fillResults=results;throw failure;
    }
    showMajorFailure();
    throw error;
  }
  for(const key of ['major','doubleMajor']){const reason=majorSkipReason(key);if(reason)results.push({label:majorLabel(key),ok:false,reason});}
  const n=results.filter(r=>r.ok).length;
  $('fill-results').replaceChildren(...results.map(r=>{const li=document.createElement('li');li.textContent=r.label+': '+(r.ok?'입력됨'+(r.selectedName?' · '+r.selectedName:''):r.reason);return li;}));
  scan=null;mappings=[];$('preview').replaceChildren();message(n+'개 입력 · '+(results.length-n)+'개 건너뜀\n지원서에서 값이 유지됐는지 확인해 주세요. 최종 제출은 하지 않았어요.');
  return results;
}
async function fillEducations(){
  const plans=batchPlans,original=targetTab,summary=[];let stopped=false;
  if(!plans)throw Error('학력 입력란을 먼저 확인해 주세요.');
  try{
    for(const item of plans){
      const result={title:item.record.title,results:[],error:item.error};summary.push(result);
      if(result.error)continue;
      if(stopped){result.error='앞선 입력이 중단되어 이번에는 입력하지 않았어요.';continue;}
      if(!item.count){result.note='추가로 입력할 항목 없음';continue;}
      activeRecord=item.record;
      try{
        await scanPage(original);
        if(!mappings.length&&!schoolToFill()&&!majorCount()){result.note='이미 작성된 항목 유지';continue;}
        result.results=await fillCurrent();
      }catch(error){result.error=error.message;result.results=error.fillResults||[];result.partial=[...$('fill-results').children].map(li=>li.textContent);stopped=true;}
    }
  }finally{activeRecord=null;clearScan();}
  let count=0,failed=0;
  for(const item of summary){
    count+=item.results.filter(r=>r.ok).length;
    const li=document.createElement('li');const title=document.createElement('strong');title.textContent=item.title;li.append(title);
    const details=document.createElement('div');
    if(item.error){failed++;details.textContent='확인 필요 · '+item.error;for(const text of item.partial||[]){const p=document.createElement('p');p.textContent=text;details.append(p);}}
    else{details.textContent=item.note||item.results.filter(r=>r.ok).length+'개 입력';for(const r of item.results){const p=document.createElement('p');p.textContent=r.label+': '+(r.ok?'입력됨':r.reason);details.append(p);if(!r.ok)failed++;}}
    li.append(details);$('fill-results').append(li);
  }
  message('학력 전체 입력 결과 · '+count+'개 입력 · '+failed+'건 확인 필요\n학교별 결과와 지원서에 남은 값을 확인해 주세요. 최종 제출은 하지 않았어요.',Boolean(failed));
}
$('fill').onclick=()=>run(()=>isBatch()?fillEducations():fillCurrent());
$('legacy-connect').onclick=()=>run(async()=>{const {autofillConnection:c}=await chrome.storage.session.get('autofillConnection');if(c?.server!=='http://127.0.0.1:4317')throw Error('기존 제출 시험은 4317 사무실 연결이 필요해요.');await chrome.storage.local.set({token:c.token});message('로컬 제출 시험 연결 코드를 저장했어요.');});
$('retry').onclick=()=>run(async()=>{await send('retry');const {pending={},lastResult=''}=await chrome.storage.local.get(['pending','lastResult']);$('legacy-result').textContent=lastResult+' 대기 '+Object.keys(pending).length+'건';message('대기 기록 전송을 확인했어요.');});
run(async()=>{const r=await send('autofill-status');connected=r.connected;if(connected){$('server').value=r.server;$('connection-status').textContent='연결됨';$('connection').open=false;$('disconnect').hidden=false;}message(connected?'가져올 자료 공간을 확인해 주세요.':'모아 설정에서 연결 코드를 복사해 연결해 주세요.');});
