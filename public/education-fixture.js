import {formAgent,suggestMappings} from './autofill-preview/autofill-core.js';
const main=document.querySelector('main');const original=document.querySelector('#application');
const toggle=document.createElement('button');toggle.type='button';toggle.textContent='학적·학교 검색 시험으로 전환';main.prepend(toggle);
const area=document.createElement('section');area.hidden=true;toggle.after(area);
const radio=(id,name,text)=>`<label style="display:inline-block;margin-right:12px"><input style="width:auto" id="${id}" name="${name}" type="radio">${text}</label>`;
area.innerHTML=`<h2>학적 정보 · 가상 양식</h2><p class="muted">첨부 화면의 항목을 재현한 시험입니다. 실제 HS효성 페이지 구조는 검증 전입니다.</p>
<fieldset><legend>학교 관련</legend><div><span>학교명</span> <button type="button" id="edu-school">학교검색</button><output id="edu-school-value"></output></div><div><span>학교소재지</span><div><select id="edu-location"><option value="">학교소재지</option><option>서울</option><option>경기</option></select></div></div></fieldset>
<fieldset><legend>학위구분</legend>${radio('edu-degree-aa','edu-degree','전문학사')}${radio('edu-degree-ba','edu-degree','학사')}</fieldset>
<fieldset><legend>입학구분</legend>${radio('edu-admit-new','edu-admit','입학')}${radio('edu-admit-transfer','edu-admit','편입')}</fieldset>
<fieldset><legend>졸업구분</legend>${radio('edu-grad-end','edu-grad','졸업')}${radio('edu-grad-future','edu-grad','졸업예정')}${radio('edu-grad-now','edu-grad','재학')}</fieldset>
<fieldset><legend>학과/전공</legend><button type="button" id="edu-major">전공검색</button><output id="edu-major-value"></output></fieldset>
<fieldset><legend>성적</legend><div><span>평점</span><div><input id="edu-gpa" type="number" step="0.01" min="0" max="4.5"></div></div><select title="만점기준" id="edu-scale"><option value="">만점기준</option><option>4.5</option><option>4.3</option></select></fieldset>
<button type="button" id="edu-qa">학적 입력·검색 검사 실행</button><pre id="edu-result"></pre>
<dialog id="edu-dialog" role="dialog" style="position:fixed;inset:15% auto auto 5%;max-width:440px;background:#fffef7;border:2px solid #82704c;z-index:10"><h3 id="edu-title">학교 검색</h3><input id="edu-query" aria-label="학교 검색어"><button type="button" id="edu-find">검색</button><div id="edu-results"></div><button type="button" id="edu-close">닫기</button></dialog>`;
const $=id=>document.getElementById(id);let kind='school';const dialog=$('edu-dialog');
for(const k of ['school','major'])$('edu-'+k).onclick=()=>{kind=k;$('edu-title').textContent=k==='school'?'학교 검색':'전공 검색';$('edu-query').value='';$('edu-results').replaceChildren();dialog.show();};
$('edu-close').onclick=()=>dialog.close();
$('edu-find').onclick=()=>{const expected=kind==='school'?'모아대학교':'경영학';$('edu-results').replaceChildren();if($('edu-query').value!==expected)return;const b=document.createElement('button');b.type='button';b.textContent=expected;b.onclick=()=>{$('edu-'+kind+'-value').value=expected;dialog.close();};$('edu-results').append(b);};
toggle.onclick=()=>{area.hidden=!area.hidden;original.hidden=!area.hidden;dialog.close();globalThis.__moaAutofill=null;toggle.textContent=area.hidden?'학적·학교 검색 시험으로 전환':'기본 입력 시험으로 돌아가기';};
$('edu-qa').onclick=()=>{
  dialog.close();area.querySelectorAll('input').forEach(e=>e.type==='radio'?e.checked=false:e.value='');area.querySelectorAll('select').forEach(e=>e.value='');
  const log=[];const check=(ok,label)=>log.push((ok?'PASS':'FAIL')+' · '+label);
  const fields=[...window.moaFixture.sections[0].records[0].fields,{key:'admissionType',label:'입학 구분',value:'신입학'},{key:'status',label:'재학 상태',value:'졸업 예정'}];
  let s=formAgent('scan');const keys=suggestMappings(s.controls,fields);const r=formAgent('fill',{scanId:s.scanId,entries:s.controls.flatMap((c,i)=>keys[i]?[{id:c.id,value:fields.find(f=>f.key===keys[i]).value}]:[])});
  check(r.results.filter(r=>r.ok).length===6&&$('edu-gpa').value==='3.85'&&$('edu-admit-new').checked&&$('edu-grad-future').checked,'학위·소재지·입학구분·졸업구분·평점·만점 6개 입력');
  s=formAgent('scan');const base={scanId:s.scanId};let result=formAgent('search-open',{...base,id:s.controls.find(c=>c.type==='search'&&c.label==='학교명').id,value:'모아대학교'});check(result.ok,'학교 검색창 열기');
  result=formAgent('search-query',base);check(result.ok&&$('edu-query').value==='모아대학교','저장한 이름으로 검색');result=formAgent('search-results',base);check(result.results?.length===1,'정확히 일치하는 검색 결과 확인');
  result=formAgent('search-select',{...base,id:result.results?.[0]?.id});check(result.ok&&$('edu-school-value').value==='모아대학교'&&!dialog.open,'선택 후 학교명 반영');
  $('edu-result').textContent=log.join('\n');
};
