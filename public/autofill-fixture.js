import {formAgent,suggestMappings} from './autofill-preview/autofill-core.js';
const field=(key,label,value,type='text')=>({key,label,value,type});
const sections=[{key:'educations',label:'학력',records:[{id:'demo-school',title:'모아대학교 · 가상',fields:[field('schoolName','학교 이름','모아대학교'),field('location','소재지','서울'),field('major','주전공','경영학'),field('doubleMajor','복수전공','통계학'),field('gpa','전체 평점','3.85','number'),field('gpaScale','평점 만점 기준','4.5','number'),field('totalCredits','총 이수 학점','132','number'),field('startMonth','입학 연월','2020-03','month'),field('degree','학위','학사'),field('minor','부전공','심리학')]}]},
{key:'certifications',label:'자격증',records:[{id:'demo-cert',title:'가상 자격증',fields:[field('name','자격증 이름','가상 자격증'),field('issuer','발급기관','모아 시험기관'),field('acquiredAt','취득일','2025-02-14','date'),field('certificateNo','자격·등록번호','TEST-1234')]}]},
{key:'projects',label:'프로젝트',records:[]},{key:'overseas',label:'해외경험',records:[]}];
window.moaFixture={agent:formAgent,sections};
let submitted=0;const $=id=>document.getElementById(id);const initialEssay=$('essay').value;
$('application').onsubmit=e=>{e.preventDefault();submitted++;$('submission-count').textContent='제출 버튼 실행: '+submitted+'회';};
function reset(){ $('application').reset();globalThis.__moaAutofill=null; }
$('reset').onclick=()=>{reset();$('qa-result').textContent='초기화했어요. 오른쪽에서 입력란을 다시 확인해 주세요.';};
$('qa').onclick=()=>{
  const log=[];const check=(condition,title)=>{log.push((condition?'PASS':'FAIL')+' · '+title);};reset();
  let scan=formAgent('scan');const serialized=JSON.stringify(scan);
  check(!serialized.includes('PRIVATE_ESSAY_TEST_MARKER')&&!serialized.includes('기존에 작성한 전공')&&!serialized.includes('가상 지원자'),'자소서·기존 입력값을 반환하지 않음');
  const fields=sections[0].records[0].fields;const keys=suggestMappings(scan.controls,fields);
  const entries=scan.controls.flatMap((c,i)=>keys[i]?[{id:c.id,value:fields.find(f=>f.key===keys[i]).value}]:[]);
  const result=formAgent('fill',{scanId:scan.scanId,entries});
  check(result.results.filter(r=>r.ok).length===9&&$('school').value==='모아대학교'&&$('gpa').value==='3.85'&&$('degree').value==='bachelor','학력 9개와 선택형·숫자·연월 입력');
  check($('existing').value==='기존에 작성한 전공'&&$('schoolSearch').value==='','기존 값과 검색식 학교 선택 보호');
  check($('essay').value===initialEssay&&!$('consent').checked&&submitted===0,'자기소개서·동의·제출 보호');
  const second=formAgent('fill',{scanId:scan.scanId,entries});check(second.results.every(r=>!r.ok),'반복 입력으로 기존 값 덮어쓰지 않음');
  reset();scan=formAgent('scan');const school=scan.controls.find(c=>c.label==='학교명');$('school').value='직접 입력';
  check(!formAgent('fill',{scanId:scan.scanId,entries:[{id:school.id,value:'모아대학교'}]}).results[0].ok&&$('school').value==='직접 입력','미리보기 이후 바뀐 값 보호');
  reset();scan=formAgent('scan');const gpa=scan.controls.find(c=>c.label==='학점');const date=scan.controls.find(c=>c.label==='취득일');const degree=scan.controls.find(c=>c.label==='학위');
  const invalid=formAgent('fill',{scanId:scan.scanId,entries:[{id:gpa.id,value:'9.9'},{id:date.id,value:'2025-02-31'},{id:degree.id,value:'박사'}]});check(invalid.results.every(r=>!r.ok),'학점 범위·잘못된 날짜·없는 선택지 거부');
  const old=scan.scanId;formAgent('scan');check(Boolean(formAgent('fill',{scanId:old,entries:[]}).error),'새로 읽은 뒤 이전 미리보기 무효화');
  check(suggestMappings([{label:'학교명'},{label:'학교명'}],fields).every(k=>!k),'학교 칸 중복 시 자동 연결하지 않음');
  reset();scan=formAgent('scan');const removed=scan.controls.find(c=>c.label==='학교명');const original=$('school');const replacement=original.cloneNode(true);original.replaceWith(replacement);
  check(!formAgent('fill',{scanId:scan.scanId,entries:[{id:removed.id,value:'모아대학교'}]}).results[0].ok&&replacement.value==='','다시 만들어진 입력란은 재확인');
  reset();scan=formAgent('scan');const cf=sections[1].records[0].fields;const cm=suggestMappings(scan.controls,cf);const cr=formAgent('fill',{scanId:scan.scanId,entries:scan.controls.flatMap((c,i)=>cm[i]?[{id:c.id,value:cf.find(f=>f.key===cm[i]).value}]:[])});
  check(cr.results.filter(r=>r.ok).length===4&&$('acquired').value==='2025-02-14','자격증 4개 입력');
  reset();$('qa-result').textContent=log.join('\n')+'\n가상 양식 초기화 완료';
};
