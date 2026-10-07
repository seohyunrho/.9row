// Input definitions are shared by the editor and the server's validation.
const field = (key, label, type = 'text', extra = {}) => ({key,label,type,...extra});
export const profileSections = [
  {key:'educations',label:'학력',singular:'학교',description:'입학부터 졸업까지, 성적표와 학적 자료를 기준으로 적어두세요.',fields:[
    field('schoolName','학교 이름','text',{required:true,placeholder:'예: 모아대학교'}),
    field('location','소재지','text',{placeholder:'예: 대한민국 · 서울'}),
    field('schoolType','학교 구분','select',{options:['고등학교','전문대학','대학교','대학원','기타']}),
    field('degree','학위','select',{options:['해당 없음','전문학사','학사','석사','박사','기타']}),
    field('status','재학 상태','select',{options:['재학','휴학','졸업 예정','졸업','수료','중퇴']}),
    field('admissionType','입학 구분','select',{options:['신입학','편입학','재입학','기타']}),
    field('startMonth','입학 연월','month'),field('endMonth','졸업·졸업 예정 연월','month'),
    field('departmentCategory','학과계열','text',{placeholder:'예: 공학계열',hint:'지원서 선택 목록에 표시된 계열을 적어 주세요. 전공명으로 자동 추측하지 않습니다.'}),
    field('highSchoolCategory','고등학교 계열','text',{hint:'고등학교 지원서의 계열 목록에 표시된 이름을 적어 주세요.'}),
    field('highSchoolSession','고등학교 주간·야간','select',{options:['주간','야간']}),
    field('gpa','전체 평점','number',{placeholder:'예: 3.80'}),
    field('gpaScale','전체 평점 만점 기준','number',{placeholder:'예: 4.5'}),
    field('totalCredits','총 이수 학점','number',{placeholder:'예: 130'}),
    field('major','주전공'),
    field('majorCategory','주전공 계열','text',{placeholder:'지원서의 전공계열 목록에 표시된 이름'}),
    field('majorGpa','주전공 평점','number',{placeholder:'예: 4.10'}),
    field('majorGpaScale','주전공 평점 만점 기준','number',{placeholder:'예: 4.5'}),
    field('majorCredits','주전공 이수 학점','number',{placeholder:'예: 60'}),
    field('doubleMajor','복수전공'),
    field('doubleMajorCategory','복수전공 계열','text',{placeholder:'지원서의 전공계열 목록에 표시된 이름'}),
    field('doubleMajorGpa','복수전공 평점','number',{placeholder:'예: 3.90'}),
    field('doubleMajorGpaScale','복수전공 평점 만점 기준','number',{placeholder:'예: 4.5'}),
    field('doubleMajorCredits','복수전공 이수 학점','number',{placeholder:'예: 36'}),
    field('notes','학력 관련 메모','textarea',{placeholder:'예: 졸업 예정 시기, 학점 표기 방식 등'})],
    groups:[
      {key:'school',label:'학교·학적 정보',fields:['schoolName','location','schoolType','degree','status','admissionType','startMonth','endMonth','departmentCategory']},
      {key:'highschool',label:'고등학교 추가 정보',fields:['highSchoolCategory','highSchoolSession']},
      {key:'grades',label:'학교 전체 성적',fields:['gpa','gpaScale','totalCredits']},
      {key:'major',label:'주전공',fields:['major','majorCategory','majorGpa','majorGpaScale','majorCredits']},
      {key:'doubleMajor',label:'복수전공',description:'복수전공이 없다면 비워두세요.',fields:['doubleMajor','doubleMajorCategory','doubleMajorGpa','doubleMajorGpaScale','doubleMajorCredits']},
      {key:'notes',label:'추가 메모',fields:['notes']}
    ]},
  {key:'certifications',label:'자격증',singular:'자격증',description:'발급기관의 증서에 적힌 이름과 날짜를 그대로 보관하세요.',fields:[
    field('name','자격증 이름','text',{required:true}),field('issuer','발급기관'),
    field('grade','등급·점수'),field('certificateNo','자격·등록번호'),
    field('acquiredAt','취득일','date'),field('expiresAt','유효기간 종료일','date',{hint:'유효기간이 없거나 모르면 비워두세요.'}),
    field('notes','자격증 관련 메모','textarea')]},
  {key:'projects',label:'프로젝트',singular:'프로젝트',description:'무엇을 만들었는지와 그 안에서 내가 맡은 일을 구분해 정리하세요.',fields:[
    field('name','프로젝트 이름','text',{required:true}),field('organization','소속·주관기관'),
    field('type','프로젝트 구분','select',{options:['개인','팀','수업','동아리','대외활동','업무','기타']}),field('role','내 역할'),
    field('startMonth','시작 연월','month'),field('endMonth','종료 연월','month',{hint:'진행 중이면 비워두세요.'}),
    field('summary','목표·프로젝트 소개','textarea'),field('contribution','내가 직접 수행한 내용','textarea'),
    field('result','성과·배운 점','textarea',{hint:'측정하지 않은 수치나 확인되지 않은 성과는 쓰지 않아도 됩니다.'}),
    field('tools','사용 기술·도구'),field('url','결과물·포트폴리오 링크','url',{placeholder:'https://…'})]},
  {key:'overseas',label:'해외경험',singular:'해외경험',description:'어디에서, 어떤 목적으로, 어떤 활동을 했는지 기록하세요.',fields:[
    field('name','해외경험 이름','text',{required:true,placeholder:'예: 일본 교환학생'}),field('country','국가'),
    field('city','도시·지역'),field('purpose','체류 목적','select',{options:['교환학생','어학연수','유학','인턴·근무','봉사','여행','기타']}),
    field('organization','학교·기관'),field('language','사용 언어'),
    field('startMonth','시작 연월','month'),field('endMonth','종료 연월','month',{hint:'체류 중이면 비워두세요.'}),
    field('activities','주요 활동','textarea'),field('learnings','배운 점·활용한 역량','textarea')]}
];

export function blankProfileRecord(sectionKey,id) {
  const section=profileSections.find(s=>s.key===sectionKey);
  return {id,...Object.fromEntries(section.fields.map(f=>[f.key,'']))};
}

export function normalizeProfile(profile) {
  const next={...profile};
  for(const section of profileSections)if(next[section.key]===undefined)next[section.key]=[];
  // Preserve older single-school input once; do not guess any missing details.
  if(profile.educations===undefined&&(profile.school||profile.major)){
    next.educations=[{...blankProfileRecord('educations','legacy-school'),schoolName:profile.school||'',major:profile.major||''}];
  }
  // An optional field added after existing profiles were saved. Preserve all
  // recorded values and reject malformed ones rather than silently replacing them.
  if(Array.isArray(next.educations))next.educations=next.educations.map(record=>record&&typeof record==='object'&&!Array.isArray(record)&&record.departmentCategory===undefined?{...record,departmentCategory:''}:record);
  if(Array.isArray(next.educations))next.educations=next.educations.map(record=>record&&typeof record==='object'&&!Array.isArray(record)?{...record,...Object.fromEntries(['highSchoolCategory','highSchoolSession'].map(key=>[key,record[key]===undefined?'':record[key]]))}:record);
  if(Array.isArray(next.educations))next.educations=next.educations.map(record=>record&&typeof record==='object'&&!Array.isArray(record)&&record.majorCategory===undefined?{...record,majorCategory:''}:record);
  // Old profiles used one common scale for both overall and primary-major GPA.
  // Copy it once for old records; explicit blanks and separately entered values stay as-is.
  // The removed minor input remains in older records so this UI change loses no data.
  if(Array.isArray(next.educations))next.educations=next.educations.map(record=>{
    if(!record||typeof record!=='object'||Array.isArray(record))return record;
    return {...record,
      majorGpaScale:record.majorGpaScale===undefined?(record.gpaScale??''):record.majorGpaScale,
      ...Object.fromEntries(['doubleMajorCategory','doubleMajorGpa','doubleMajorGpaScale','doubleMajorCredits'].map(key=>[key,record[key]===undefined?'':record[key]]))};
  });
  return next;
}

const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export function profileErrors(profile) {
  const errors={};
  const put=(key,message)=>{errors[key]=message;};
  for(const section of profileSections){
    const records=profile[section.key];
    if(!Array.isArray(records)||records.length>100){put(section.key,`${section.label} 목록 형식을 확인해 주세요.`);continue;}
    const ids=new Set();
    for(const record of records){
      if(!record||typeof record.id!=='string'||!record.id||record.id.length>150||ids.has(record.id)){put(section.key,`${section.label} 기록 번호가 없거나 중복됐어요.`);continue;}
      ids.add(record.id);
      const key=fieldKey=>`${section.key}.${record.id}.${fieldKey}`;
      for(const f of section.fields){
        const v=record[f.key];
        if(typeof v!=='string'||v.length>(f.type==='textarea'?20000:1000)){put(key(f.key),`${f.label}의 입력 형식을 확인해 주세요.`);continue;}
        if(f.required&&!v.trim())put(key(f.key),`${f.label}을 입력해 주세요.`);
        if(!v)continue;
        if(f.type==='number'&&(!/^\d+(\.\d+)?$/.test(v)||!Number.isFinite(Number(v))))put(key(f.key),'0 이상의 숫자를 입력해 주세요.');
        if(f.type==='month'&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(v))put(key(f.key),'올바른 연월을 입력해 주세요.');
        if(f.type==='date'&&!validDate(v))put(key(f.key),'실제로 있는 날짜를 입력해 주세요.');
        if(f.type==='select'&&!f.options.includes(v))put(key(f.key),'목록에서 항목을 선택해 주세요.');
        if(f.type==='url'){try{const url=new URL(v);if(!['http:','https:'].includes(url.protocol))throw Error();}catch{put(key(f.key),'http 또는 https 주소를 입력해 주세요.');}}
      }
      if(record.startMonth&&record.endMonth&&record.startMonth>record.endMonth)put(key('endMonth'),'종료 시점은 시작 시점보다 빠를 수 없어요.');
      if(record.acquiredAt&&record.expiresAt&&record.acquiredAt>record.expiresAt)put(key('expiresAt'),'유효기간은 취득일보다 빠를 수 없어요.');
      if(section.key==='educations'){
        for(const [score,scale] of [['gpa','gpaScale'],['majorGpa','majorGpaScale'],['doubleMajorGpa','doubleMajorGpaScale']]){
          if(record[score]&&!record[scale])put(key(scale),'평점을 입력했다면 해당 평점의 만점 기준도 적어 주세요.');
          if(record[scale]&&Number(record[scale])<=0)put(key(scale),'만점 기준은 0보다 커야 해요.');
          if(record[score]&&record[scale]&&Number(record[score])>Number(record[scale]))put(key(score),'평점이 해당 만점 기준보다 높아요.');
        }
        for(const credits of ['majorCredits','doubleMajorCredits'])if(record.totalCredits&&record[credits]&&Number(record[credits])>Number(record.totalCredits))put(key(credits),'전공 이수 학점이 총 이수 학점보다 많아요.');
      }
    }
  }
  return errors;
}
