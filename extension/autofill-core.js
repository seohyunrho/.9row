export const allowedPage = raw => {
  try {
    const u=new URL(raw);
    return (u.protocol==='https:'&&['career.hyundai-autoever.com','recruit-apply.hyundai-autoever.com','hshyosung.recruiter.co.kr','s-oil.recruiter.co.kr'].includes(u.hostname)) ||
      (u.protocol==='http:'&&u.hostname==='127.0.0.1'&&['4317','4318'].includes(u.port)&&u.pathname==='/autofill-test.html');
  } catch { return false; }
};

const normalize = s => String(s||'').normalize('NFKC').toLowerCase().replace(/필수|선택입력|\(선택\)|\(필수\)/g,'').replace(/[\s*·_()\-:]/g,'');
const aliases={
  schoolName:['학교명','학교 이름','대학교명','대학명'],location:['소재지','학교 소재지'],
  schoolType:['학교 구분'],degree:['학위','학위구분'],status:['재학 상태','졸업 구분','졸업 여부'],admissionType:['입학 구분'],
  major:['전공','주전공','전공명'],doubleMajor:['복수전공','복수전공명'],minor:['부전공','부전공명'],
  departmentCategory:['학과계열','학과 계열'],
  highSchoolCategory:['고등학교계열'],highSchoolSession:['고등학교주야간'],
  majorCategory:['주전공 계열','전공계열'],majorGpaScale:['전공 평점 만점 기준','전공 만점기준'],
  doubleMajorCategory:['복수전공 계열'],doubleMajorGpa:['복수전공 평점'],doubleMajorGpaScale:['복수전공 평점 만점 기준','복수전공 만점기준'],
  gpa:['학점','평점','전체 평점','평균 학점'],gpaScale:['학점 기준','평점 만점 기준','만점','만점 기준'],majorGpa:['전공 평점','전공 학점 평균'],
  totalCredits:['총 이수 학점','총 취득 학점','이수 학점'],majorCredits:['전공 이수 학점'],
  issuer:['발급기관','발행기관'],grade:['등급·점수','등급','점수'],certificateNo:['자격·등록번호','자격증 번호','등록번호'],
  acquiredAt:['취득일','취득일자'],expiresAt:['유효기간 종료일','만료일'],country:['국가','국가명'],city:['도시·지역','도시'],
  purpose:['체류 목적'],language:['사용 언어'],role:['내 역할','담당 역할'],tools:['사용 기술·도구','사용 기술'],url:['결과물·포트폴리오 링크','포트폴리오 링크'],
  startMonth:['입학일','입학연월'],endMonth:['졸업일','졸업연월'],
};
export function educationFamily(fields){
  const get=key=>fields.find(f=>f.key===key)?.value;
  const type=get('schoolType');
  if(type==='고등학교')return 'highschool';
  if(type==='대학원')return 'graduateSchool';
  if(['대학교','전문대학'].includes(type))return 'college';
  if(type&&type!=='기타')return '';
  if(['석사','박사'].includes(get('degree')))return 'graduateSchool';
  if(['학사','전문학사'].includes(get('degree')))return 'college';
  return '';
}
const canReplaceStatus=c=>c.type==='button-group'&&c.replaceSelection===true&&['졸업구분','고등학교주야간'].includes(normalize(c.label));
export function suggestMappings(controls,fields) {
  const candidates=controls.map(control=>{
    if((control.filled&&!canReplaceStatus(control))||control.unsupported||/^(학교|대학|전공|학과)코드$/.test(normalize(control.label)))return [];
    return fields.filter(f=>f.value && [f.label,...(aliases[f.key]||[])].some(label=>normalize(label)===normalize(control.label)));
  });
  // Repeated labels need a site-specific row context, so don't guess a destination.
  const count=new Map();
  candidates.forEach(xs=>xs.forEach(f=>count.set(f.key,(count.get(f.key)||0)+1)));
  return candidates.map(xs=>xs.length===1&&count.get(xs[0].key)===1?xs[0].key:'');
}

export function automaticPlan(controls,fields){
  const keys=suggestMappings(controls,fields);
  return controls.flatMap((c,i)=>{
    if(/^(학교|대학|전공|학과)코드$/.test(normalize(c.label)))return [];
    const field=fields.find(f=>f.key===keys[i]);
    if(c.filled&&!canReplaceStatus(c))return [{...c,status:'kept',reason:'이미 작성한 내용 유지'}];
    if(c.type==='search')return [{...c,status:'search'}];
    if(c.unsupported)return [{...c,status:'pending',reason:c.unsupportedReason||'사이트 전용 선택 방식 · 자동 입력 연결 보완 필요'}];
    if(!field){
      const matching=fields.filter(f=>[f.label,...(aliases[f.key]||[])].some(label=>normalize(label)===normalize(c.label)));
      return [{...c,status:'pending',reason:matching.some(f=>f.value)?'같은 항목이 여러 곳에 있어 입력 위치 확인 필요':matching.length?'모아에 저장된 값 없음':'항목의 의미를 아직 확인하지 못함'}];
    }
    if(canReplaceStatus(c)){
      if(c.options.filter(v=>normalize(v)===normalize(field.value)).length!==1)return [{...c,status:'pending',reason:'저장된 재학 상태와 일치하는 선택지가 없거나 여러 개예요'}];
      if(normalize(c.selectedValue)===normalize(field.value))return [{...c,status:'kept',reason:'저장된 재학 상태와 같아요'}];
    }
    if(/^\d{4}-\d{2}$/.test(field.value)&&c.type!=='month'&&!['YYYY.MM','YYYY-MM','YYYY/MM','YYYYMM'].includes(c.monthFormat)&&['입학일','졸업일'].includes(normalize(c.label)))return [{...c,status:'pending',reason:'모아에는 연월만 저장돼 있어 날짜칸의 입력 형식 확인 필요'}];
    return [{...c,status:'ready',key:field.key,value:field.value}];
  });
}

// Self-contained: Chrome serializes this function into its isolated content-script world.
export function formAgent(action,payload={}) {
  const url=new URL(location.href);
  const allowed=(url.protocol==='https:'&&['career.hyundai-autoever.com','recruit-apply.hyundai-autoever.com','hshyosung.recruiter.co.kr','s-oil.recruiter.co.kr'].includes(url.hostname)) ||
    (url.protocol==='http:'&&url.hostname==='127.0.0.1'&&['4317','4318'].includes(url.port)&&url.pathname==='/autofill-test.html');
  if(!allowed)return {error:'S-OIL·HS효성·현대오토에버 지원서 또는 모아 자동 입력 시험 페이지에서 열어 주세요.'};
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,140);
  const textOnly=node=>{
    // Ignore nested controls, including textarea default content, even inside a label.
    if(!node)return '';
    const walk=n=>n.nodeType===3?n.textContent:n.nodeType===1&&n.matches('input,textarea,select,button,[contenteditable],script,style')?'':[...n.childNodes].map(walk).join(' ');
    return clean(walk(node));
  };
  const directLabel=e=>clean(e.getAttribute('aria-label')||
    (e.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>textOnly(document.getElementById(id))).join(' ')||
    [...(e.labels||[])].map(textOnly).join(' ')||e.getAttribute('title')||e.getAttribute('placeholder'));
  const norm=s=>clean(s).replace(/[\s*·_():/-]/g,'');
  const hs=url.hostname==='hshyosung.recruiter.co.kr';
  const soil=url.hostname==='s-oil.recruiter.co.kr';
  // Static prompts observed in the user's S-OIL screenshot, never selected values.
  const soilHints={'학교명을검색해주세요':'학교명','학교소재지를선택해주세요':'학교소재지','학과계열을선택해주세요':'학과계열','계열을선택해주세요':'고등학교계열','전공명을검색해주세요':'전공명','전공계열을선택해주세요':'전공계열','만점기준':'만점기준'};
  const soilHint=e=>{
    if(!soil)return '';
    if(e.matches('input')&&['입학일','졸업일'].includes(clean(directLabel(e))))return clean(directLabel(e));
    const lookup=s=>soilHints[clean(s).replace(/[\s*＊]/g,'').replace(/[.。]$/,'')]||'';
    return lookup(directLabel(e))||(e.matches('button,[role=button],[role=combobox]')||e.matches('span,p')&&e.childElementCount===0?lookup(e.textContent):'');
  };
  const named=e=>{
    if(!hs)return null;
    const match=/^(highschool|college\[\d+\]|graduateSchool\[\d+\])\.(.+)$/.exec(e.name||'');
    if(!match)return null;
    const labels={degreeTypeCode:'학위구분',entranceTypeCode:'입학구분',graduationTypeCode:'졸업구분',locationCode:'학교소재지',entranceDate:'입학일',graduationDate:'졸업일',score:'평점',perfectScore:'만점 기준',academyCode:'학교 코드'};
    const suffix=match[2];
    return {scope:match[1],family:match[1].replace(/\[\d+\]/,''),label:labels[suffix]||(/\.majorCode$/.test(suffix)?'전공 코드':/\.majorCategoryCode$/.test(suffix)?'전공 계열':''),suffix};
  };
  // Only short, known academic headings are considered. Never read a whole form/row.
  const academic=/^(학교명|학교이름|학교소재지|소재지|학위구분|학위|입학구분|졸업구분|졸업여부|평점|학점|만점기준|전공|주전공|복수전공|부전공|입학일|졸업일|총이수학점)$/;
  const heading=n=>n&&n.childElementCount<=2&&academic.test(norm(textOnly(n)))?textOnly(n):'';
  const nearby=e=>{
    let node=e;
    for(let depth=0;node&&depth<4;depth++,node=node.parentElement){
      if(node.matches('form,body,html'))break;
      let p=node.previousElementSibling;
      for(let i=0;p&&i<2;i++,p=p.previousElementSibling){const h=heading(p);if(h)return h;}
      const legend=node.matches('fieldset')?node.querySelector(':scope > legend'):null;
      if(heading(legend))return heading(legend);
    }
    return '';
  };
  const soilMajorGrade=e=>soil&&/^collegeGroupAnswers\.\d+\.collegeMajorList\.\d+\.majorGrade\.score$/.test(e?.name||'');
  const labelOf=e=>soilMajorGrade(e)?(supportedMajorRow(e)?.kind==='복수전공'?'복수전공 평점':'전공 평점'):named(e)?.label||soilHint(e)||directLabel(e)||nearby(e);
  const sensitive=e=>/비밀번호|password|주민|여권|계좌|자기소개|자소서|지원동기|성장과정|이메일|email|연락처|휴대|전화|성명|gender|성별|생년|보훈|장애/i.test(`${labelOf(e)} ${e.name} ${e.id}`)||/^(?:한글|영문)?\s*이름\s*\*?$/.test(labelOf(e));
  const internalCode=e=>/^(학교|대학|전공|학과)코드$/.test(norm(labelOf(e)))||/(?:school|university|univ|college|major|department|dept)(?:code|cd|id)(?:\d|\s|$)/i.test(`${e.name||''} ${e.id||''}`.replace(/[_\-.[\]]/g,''));
  const blocked=e=>!['INPUT','SELECT'].includes(e.tagName)||
    (e.tagName==='INPUT'&&!['text','number','date','month','url'].includes(e.type))||sensitive(e)||internalCode(e);
  const visible=e=>e.isConnected&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[inert],[aria-hidden="true"]');
  // Use only the screenshot's static education headings, never school names or
  // the order of repeated fields, to separate high school from university.
  const educationHeading=e=>{
    if(!soil||!e||e.matches('input,select,button,option')||e.closest('[id="dropdown-body"]')||!visible(e))return '';
    const text=String(e.textContent||'').trim();if(text.length>24)return '';
    return ({고등학교:'highschool',대학교:'college',대학원:'graduateSchool'})[norm(text).replace(/^[-−–—]+/,'')]||'';
  };
  const educationHeadings=()=>[...document.querySelectorAll('h1,h2,h3,h4,legend,span,p,strong,div')].filter(e=>educationHeading(e)&&![...e.querySelectorAll('*')].some(child=>educationHeading(child)));
  const educationArea=header=>{
    let area=header.parentElement;
    for(let depth=0;area&&depth<14&&!area.matches('form,body,html');depth++,area=area.parentElement){
      const headings=educationHeadings().filter(h=>area.contains(h));
      if(headings.length!==1)return null;
      const dates=[...area.querySelectorAll('input')].filter(e=>visible(e)&&['입학일','졸업일'].includes(norm(labelOf(e))));
      if(dates.length===2&&new Set(dates.map(e=>norm(labelOf(e)))).size===2)return area;
    }
    return null;
  };
  const inHighSchool=e=>educationHeadings().some(h=>educationHeading(h)==='highschool'&&educationArea(h)?.contains(e));
  const sameEducation=(state,e)=>!state.educationArea||(state.educationArea.isConnected&&state.educationArea.contains(e)&&educationHeading(state.educationHeader)===state.family&&educationArea(state.educationHeader)===state.educationArea);
  const filled=e=>e.tagName==='SELECT' ? Boolean(e.value)&&!e.selectedOptions[0]?.disabled : e.value!=='';
  const unsupported=e=>e.disabled||e.readOnly||e.multiple||(soilMajorGrade(e)&&!supportedMajorRow(e))||e.getAttribute('role')==='combobox'||e.getAttribute('aria-autocomplete')!=null||e.hasAttribute('list')||(e.tagName==='INPUT'&&['학교명','학교소재지','학과계열','고등학교계열','전공명','전공계열'].includes(soilHint(e)));
  const safeButton=e=>e.matches('button,input[type=button],a,[role=button]')&&
    !(e.matches('button')&&e.type==='submit')&&e.getAttribute('aria-disabled')!=='true'&&!e.disabled;
  const buttonText=e=>clean(e.getAttribute('aria-label')||e.textContent||(e.type==='button'?e.value:''));
  const searchKind=e=>({'학교검색':'학교명','전공검색':'전공'}[norm(buttonText(e))]||'');
  const dialogs=()=>[...document.querySelectorAll('dialog,[role=dialog],[aria-modal=true]')].filter(visible);
  const soilChoiceRoot=e=>{
    if(!soil||!e?.matches('button[type=button]')||!['학교소재지','만점기준','학과계열','전공계열','고등학교계열'].includes(soilHint(e)))return null;
    const root=e.parentElement;
    return root?.matches('div.ats-inline-flex.ats-flex-col.ats-relative.ats-group')&&root.querySelectorAll(':scope > button').length===1?root:null;
  };
  const soilGrade=e=>soil&&e?.matches('input[type=number]')&&((/^collegeGroupAnswers\.\d+\.collegeGrade\.score$/.test(e.name)&&norm(labelOf(e))==='평점')||(soilMajorGrade(e)&&Boolean(supportedMajorRow(e))));
  const choiceKey=(value,label)=>{
    if(label==='학교소재지')return regionKey(value);
    // The user confirmed 경영,경제 and 경영·경제 are the same category.
    // Preserve the full category, parentheses and subfields; normalize separators only.
    if(['학과계열','전공계열','복수전공 계열'].includes(label))return String(value||'').normalize('NFC').replace(/\s+/g,'').replace(/,/g,'·');
    const text=String(value||'').trim();
    return /^\d+(?:\.\d+)?$/.test(text)?String(Number(text)):text;
  };
  // Only whole region names/known abbreviations match; never guess a region
  // from a city, campus name or the beginning of an address.
  const regionKey=value=>{
    const text=String(value||'').normalize('NFC').replace(/\s+/g,'').trim();
    const aliases=[['서울','서울시','서울특별시'],['부산','부산시','부산광역시'],['대구','대구시','대구광역시'],['인천','인천시','인천광역시'],['광주','광주광역시'],['대전','대전시','대전광역시'],['울산','울산시','울산광역시'],['세종','세종시','세종특별자치시'],['경기','경기도'],['강원','강원도','강원특별자치도'],['충북','충청북도'],['충남','충청남도'],['전북','전라북도','전북특별자치도'],['전남','전라남도'],['경북','경상북도'],['경남','경상남도'],['제주','제주도','제주특별자치도']];
    return aliases.find(group=>group.includes(text))?.[0]||text;
  };
  // Observed in the 0.2.13 S-OIL diagnostic: input and dropdown are siblings
  // within this component. Never search all result buttons on the page.
  const soilSchool=e=>{
    if(!soil||!e.matches('input[type=text],input:not([type])')||soilHint(e)!=='학교명')return null;
    const root=e.closest('div.ats-inline-flex.ats-flex-col.ats-relative.ats-group');
    if(!root||[...root.querySelectorAll('input')].filter(x=>soilHint(x)==='학교명').length!==1)return null;
    let area=root.parentElement;
    // Layout wrappers may change when a major row is expanded. Scope by the
    // unique school input and dependent location, not a four-wrapper assumption.
    for(let i=0;area&&i<12&&!area.matches('body,html,form');i++,area=area.parentElement){
      const inputs=[...area.querySelectorAll('input')].filter(x=>visible(x)&&soilHint(x)==='학교명');
      if(inputs.length!==1)return null;
      const locations=[...area.querySelectorAll('button[type=button]')].filter(x=>visible(x)&&soilHint(x)==='학교소재지');
      if(locations.length>1)return null;
      if(locations.length===1)return {root,area,location:locations[0]};
    }
    return null;
  };
  // Diagnostic 0.2.19: one major row contains the search, three major-kind
  // buttons, category and a named grade. Match the selected kind, never row order.
  const soilMajor=e=>{
    if(!soil||!e?.matches('input[type=text],input:not([type])')||soilHint(e)!=='전공명')return null;
    const root=e.closest('div.ats-inline-flex.ats-flex-col.ats-relative.ats-group');
    if(!root)return null;
    let area=root.parentElement;
    for(let depth=0;area&&depth<12&&!area.matches('body,html,form');depth++,area=area.parentElement){
      const inputs=[...area.querySelectorAll('input')].filter(x=>soilHint(x)==='전공명');
      if(inputs.length!==1)return null;
      const categories=[...area.querySelectorAll('button[type=button]')].filter(x=>soilHint(x)==='전공계열');
      const grades=[...area.querySelectorAll('input')].filter(soilMajorGrade);
      const kinds=[...area.querySelectorAll('li.ats-list-none > button[type=button]')].filter(x=>['주전공','복수전공','부전공'].includes(clean(x.textContent)));
      if(categories.length!==1||grades.length!==1||kinds.length!==3)continue;
      if(new Set(kinds.map(x=>clean(x.textContent))).size!==3||kinds.some(b=>!visible(b)||b.parentElement.parentElement!==kinds[0].parentElement.parentElement))return null;
      const selected=kinds.filter(b=>['ats-b1-bold','ats-shadow-1','ats-bg-white','ats-text-gray-800'].every(c=>b.classList.contains(c)));
      if(selected.length!==1||!['주전공','복수전공'].includes(clean(selected[0].textContent)))return null;
      if(kinds.some(b=>{
        const on=b===selected[0],explicit=buttonState(b);
        return (['aria-pressed','aria-checked','data-selected','data-checked','data-state'].some(a=>b.hasAttribute(a))&&explicit===null)||(explicit!==null&&explicit!==on)||!on&&!['ats-b1','ats-text-gray-600','ats-bg-gray-80'].every(c=>b.classList.contains(c))||on&&b.classList.contains('ats-bg-gray-80');
      }))return null;
      return {root,nameSlot:root.parentElement,area,location:categories[0],kinds,grade:grades[0],kind:clean(selected[0].textContent),scope:grades[0].name.replace(/\.majorGrade\.score$/,'')};
    }
    return null;
  };
  // Locate a supported major row without depending on the category placeholder:
  // selecting its category changes that text before the grade is filled.
  const supportedMajorRow=e=>{
    if(!soil||!e)return null;
    let area=e.parentElement;
    for(let depth=0;area&&depth<9&&!area.matches('body,html,form');depth++,area=area.parentElement){
      const grades=[...area.querySelectorAll('input')].filter(soilMajorGrade);
      if(grades.length>1)return null;
      if(grades.length!==1)continue;
      const kinds=[...area.querySelectorAll('li.ats-list-none > button[type=button]')].filter(b=>['주전공','복수전공','부전공'].includes(clean(b.textContent)));
      if(kinds.length!==3)continue;
      if(new Set(kinds.map(b=>clean(b.textContent))).size!==3||kinds.some(b=>!visible(b)||b.parentElement.parentElement!==kinds[0].parentElement.parentElement))return null;
      const selected=kinds.filter(b=>['ats-b1-bold','ats-shadow-1','ats-bg-white','ats-text-gray-800'].every(c=>b.classList.contains(c)));
      if(selected.length!==1||!['주전공','복수전공'].includes(clean(selected[0].textContent)))return null;
      if(kinds.some(b=>{
        const on=b===selected[0],explicit=buttonState(b);
        return (['aria-pressed','aria-checked','data-selected','data-checked','data-state'].some(a=>b.hasAttribute(a))&&explicit===null)||(explicit!==null&&explicit!==on)||!on&&!['ats-b1','ats-text-gray-600','ats-bg-gray-80'].every(c=>b.classList.contains(c))||on&&b.classList.contains('ats-bg-gray-80');
      }))return null;
      return {area,grade:grades[0],kinds,kind:clean(selected[0].textContent),scope:grades[0].name.replace(/\.majorGrade\.score$/,'')};
    }
    return null;
  };
  const majorNameKey=value=>{
    const text=String(value||'').normalize('NFC').replace(/\s+/g,' ').trim();
    return /^경영정보\s*(?:\(\s*MIS\s*\))?$/i.test(text)?'경영정보(MIS)':text;
  };
  const majorNameEvidence=row=>{
    if(!row)return null;
    const inputs=[...row.area.querySelectorAll('input[type=text],input:not([type])')].filter(e=>visible(e)&&e.closest('div.ats-inline-flex.ats-flex-col.ats-relative.ats-group')&&!e.closest('[id="dropdown-body"]'));
    // f08dc58d: selecting a major replaces the search with a name + remove icon.
    // Keep this anchored to the observed chip, not arbitrary text in the row.
    const labels=[...row.area.querySelectorAll('div.e1kw1b6c0 > div.erpqz7x0 > p.ats-font-medium')].filter(e=>visible(e)&&e.childElementCount===0&&!e.closest('button,[id="dropdown-body"]')&&e.parentElement.children.length===2&&e.parentElement.children[0]===e&&e.parentElement.children[1].tagName.toLowerCase()==='svg');
    if(inputs.length+labels.length!==1)return null;
    const node=inputs[0]||labels[0],value=inputs.length?node.value:node.textContent;
    if(!value?.trim()||value.length>140)return null;
    return {node,value,slot:inputs.length?node.closest('.ats-inline-flex').parentElement:node.parentElement.parentElement,display:!inputs.length};
  };
  const collegeScope=scope=>scope.split('.collegeMajorList.')[0];
  // With exactly two pristine default rows, preview an explicit top-to-bottom
  // primary/double plan. Only the first can run; rescan after it is confirmed.
  const blankMajorPair=profile=>{
    if(!profile.primaryMajor||!profile.doubleMajor||majorNameKey(profile.primaryMajor)===majorNameKey(profile.doubleMajor))return null;
    const grades=[...document.querySelectorAll('input')].filter(e=>soilMajorGrade(e)&&visible(e));
    if(grades.length!==2)return null;
    const rows=[...document.querySelectorAll('input')].filter(visible).map(element=>({element,major:soilMajor(element)})).filter(r=>r.major);
    if(rows.length!==2||new Set(rows.map(r=>r.major.scope)).size!==2||rows[0].element.form!==rows[1].element.form||collegeScope(rows[0].major.scope)!==collegeScope(rows[1].major.scope))return null;
    if(rows.some(({element,major})=>element.value!==''||element.disabled||element.readOnly||element.closest('fieldset[disabled]')||major.kind!=='주전공'||major.grade.value!==''||!major.location.disabled||!major.grade.disabled||major.kinds.some(b=>!b.disabled)))return null;
    return rows;
  };
  const validBlankPair=(major,activeValue='',selected=false)=>{
    const pair=major.blankPair;if(!pair)return true;
    const grades=[...document.querySelectorAll('input')].filter(e=>soilMajorGrade(e)&&visible(e));
    return grades.length===2&&pair.every(({element,major:saved},i)=>{
      if(selected&&i===0){
        const row=supportedMajorRow(saved.grade),name=majorNameEvidence(row);
        return grades[i]===saved.grade&&row?.area===saved.area&&row.scope===saved.scope&&row.kind==='주전공'&&name?.slot===saved.nameSlot&&name.value===activeValue&&row.kinds.every((b,j)=>b===saved.kinds[j]);
      }
      const now=soilMajor(element),active=element===pair[0].element;
      return grades[i]===saved.grade&&element.form===pair[0].major.grade.form&&now?.area===saved.area&&now.scope===saved.scope&&now.grade===saved.grade&&now.location===saved.location&&now.kind==='주전공'&&now.kinds.every((b,j)=>b===saved.kinds[j])&&visible(element)&&!element.disabled&&!element.readOnly&&!element.closest('fieldset[disabled]')&&element.value===(active?activeValue:'')&&(active||now.location.disabled&&now.grade.disabled&&now.grade.value===''&&now.kinds.every(b=>b.disabled));
    });
  };
  const selectedMajorRows=()=>[...document.querySelectorAll('input')].filter(e=>soilMajorGrade(e)&&visible(e)&&!e.disabled).map(supportedMajorRow).filter(Boolean);
  // New ATS rows lock the default primary-kind buttons until name selection.
  // Promote only beside one confirmed matching primary, within the same college.
  const primaryProof=(major,name)=>{
    if(!name)return null;
    const rows=selectedMajorRows().filter(r=>collegeScope(r.scope)===collegeScope(major.scope)&&r.area!==major.area);
    if(rows.some(r=>r.kind==='복수전공'))return null;
    const primaries=rows.filter(r=>r.kind==='주전공');if(primaries.length!==1)return null;
    const row=primaries[0],evidence=majorNameEvidence(row);
    return evidence&&majorNameKey(evidence.value)===majorNameKey(name)?{input:evidence.node,scope:row.scope,name}:null;
  };
  const validPrimaryProof=major=>{
    const proof=major.primaryProof;if(!proof)return true;
    const now=primaryProof(major,proof.name);
    return now?.input===proof.input&&now.scope===proof.scope;
  };
  const majorContainer=e=>{
    if(!soil)return false;let p=e?.parentElement;
    for(let i=0;p&&i<9&&!p.matches('body,html,form');i++,p=p.parentElement){
      // A college's own score row is not a major row, even though its outer
      // college section also contains majors.
      if(p.querySelector('input[name$=".collegeGrade.score"]'))return false;
      if([...p.querySelectorAll('input')].some(soilMajorGrade))return true;
    }return false;
  };
  const choiceLabel=e=>{
    const hint=soilHint(e),isDouble=supportedMajorRow(e)?.kind==='복수전공';
    if(hint==='전공계열'&&isDouble)return '복수전공 계열';
    return hint==='만점기준'&&majorContainer(e)?(isDouble?'복수전공 만점기준':'전공 만점기준'):hint;
  };
  const sameMajorScope=(saved,e)=>!saved.majorArea||(supportedMajorRow(e)?.area===saved.majorArea&&supportedMajorRow(e)?.scope===saved.gradeScope&&supportedMajorRow(e)?.kind===saved.majorKind);
  const radioOptions=e=>{
    if(!e.name)return [];
    return [...document.querySelectorAll('input[type=radio]')].filter(r=>r.name===e.name&&r.form===e.form);
  };
  const radioVisible=e=>visible(e)||[...(e.labels||[])].some(visible);
  const groupLabel=e=>named(e)?.label||nearby(e.closest('label')||e);
  const choiceNames={학위구분:['전문학사','학사','석사','박사','석박사통합'],입학구분:['입학','신입학','편입','편입학'],졸업구분:['졸업','졸업예정','수료','중퇴','휴학','재학','검정고시'],고등학교주야간:['주간','야간']};
  const academicGroupLabel=e=>{
    const root=e?.parentElement?.parentElement;
    const group=root?[...root.querySelectorAll(':scope > li.ats-list-none > button[type=button]')]:[];
    if(group.length===2&&new Set(group.map(b=>clean(b.textContent))).size===2&&group.every(b=>['주간','야간'].includes(clean(b.textContent)))&&inHighSchool(e))return '고등학교주야간';
    return norm(nearby(e));
  };
  const buttonState=e=>{
    const signals=[];
    for(const attr of ['aria-pressed','aria-checked','data-selected','data-checked']){
      const value=e.getAttribute(attr);if(value!==null){if(!['true','false'].includes(value))return null;signals.push(value==='true');}
    }
    const state=e.getAttribute('data-state');
    if(state!==null){if(['checked','selected','on'].includes(state))signals.push(true);else if(['unchecked','unselected','off'].includes(state))signals.push(false);else return null;}
    // Corroborated by the S-OIL screenshot and 0.2.12 diagnostic: apply only
    // to academic li/button groups, never infer selection from color alone.
    if(soil&&e.matches('li.ats-list-none > button[type=button]')&&choiceNames[academicGroupLabel(e)]?.includes(norm(e.textContent))){
      const selected=['ats-b1-bold','ats-shadow-1','ats-bg-white','ats-text-gray-800'].every(c=>e.classList.contains(c));
      const unselected=['ats-b1','ats-text-gray-600','ats-bg-gray-80'].every(c=>e.classList.contains(c));
      if(selected&&unselected)return null;
      if(selected||unselected)signals.push(selected);
    }
    return signals.length&&signals.every(s=>s===signals[0])?signals[0]:null;
  };
  const soilGroup=e=>{
    if(!soil||!e.matches('li.ats-list-none > button[type=button]'))return null;
    const root=e.parentElement.parentElement,label=academicGroupLabel(e);if(!choiceNames[label])return null;
    const group=[...root.querySelectorAll(':scope > li.ats-list-none > button[type=button]')];
    if(group.length<2||group.length>8||root.querySelectorAll('button').length!==group.length||group.some(b=>!visible(b)||!choiceNames[label].includes(norm(b.textContent))))return null;
    return {root,label,group};
  };
  const soilMonth=e=>soil&&e?.matches('input[type=text],input:not([type])')&&['입학일','졸업일'].includes(norm(labelOf(e)))&&['입학일','졸업일'].includes(clean(e.getAttribute('placeholder')))&&['ats-outline-none','ats-px-50','ats-shrink','ats-bg-gray-80'].every(c=>e.classList.contains(c))&&Boolean(e.parentElement?.matches('div.ats-radius-75.ats-group.ats-flex'));
  const monthKey=value=>{
    const match=/^(\d{4})(?:[./-](\d{1,2})|(\d{2}))$/.exec(String(value||'').trim());
    if(!match)return '';const month=Number(match[2]||match[3]);return month>=1&&month<=12?match[1]+'-'+String(month).padStart(2,'0'):'';
  };
  const sameInputValue=(e,value)=>soilMonth(e)?Boolean(monthKey(value))&&monthKey(e.value)===monthKey(value):e.value===value;
  const monthFormat=e=>{
    if(!soil||e.tagName!=='INPUT'||e.type!=='text'||!['입학일','졸업일'].includes(norm(labelOf(e))))return '';
    const hint=(e.getAttribute('placeholder')||'').trim().toUpperCase();
    if(['YYYY.MM','YYYY-MM','YYYY/MM','YYYYMM'].includes(hint))return hint;
    // User confirmed these observed S-OIL fields accept year/month, not a day.
    // Use the adapter's dotted representation, then require the site to retain
    // that exact year/month after blur. No calendar dates/codes are fabricated.
    return soilMonth(e)?'YYYY.MM':'';
  };
  const metaToken=s=>/^[a-zA-Z_][a-zA-Z0-9_.[\]-]{0,79}$/.test(s||'')&&!/\d{6,}/.test(s)?s:'';
  const metaShape=e=>({tag:e.tagName.toLowerCase(),id:metaToken(e.id),name:metaToken(e.getAttribute('name')),classes:[...e.classList].map(metaToken).filter(Boolean).slice(0,6),role:metaToken(e.getAttribute('role'))});
  const inlineSearchLabel=e=>{
    const label=norm(directLabel(e));if(['학교검색','전공검색'].includes(label))return label;
    const parent=e.closest('div.search')?.parentElement;if(!parent)return '';
    const codes=[...parent.querySelectorAll('input[name]')].map(named).filter(Boolean);
    if(codes.some(c=>c.label==='학교 코드'))return '학교검색';
    if(codes.some(c=>c.label==='전공 코드'))return '전공검색';
    return '';
  };
  const searchInputs=()=>hs?[...document.querySelectorAll('div.search input[type=search]')].filter(e=>!e.disabled&&visible(e)&&inlineSearchLabel(e)):[];
  const captureSearch=()=>searchInputs().map(input=>{
    const search=input.closest('div.search');const root=search.parentElement?.matches('.middle-set')?search.parentElement:search;
    const linked=(input.getAttribute('aria-controls')||'').split(/\s+/).map(id=>document.getElementById(id)).filter(e=>e&&e.matches('[role=listbox],ul,ol')&&!root.contains(e));
    const nodes=[...new Set([root,...root.querySelectorAll('*'),...linked.flatMap(e=>[e,...e.querySelectorAll('*')])])].filter(e=>!e.matches('input,textarea,script,style,[contenteditable]')&&!e.closest('textarea,[contenteditable]')).slice(0,120);
    return {label:inlineSearchLabel(input),container:metaShape(root),nodes:nodes.map(e=>({...metaShape(e),parent:nodes.indexOf(e.parentElement),children:e.childElementCount,tabIndex:e.tabIndex,visible:visible(e)}))};
  });
  const soilAnchors=()=>soil?[...document.querySelectorAll('input,select,button,[role=button],[role=combobox],span,p')].filter(e=>visible(e)&&soilHint(e)&&!(e.matches('span,p')&&soilHint(e)==='만점기준')).filter(e=>!e.parentElement?.closest('button,[role=button],[role=combobox]')||!soilHint(e.parentElement.closest('button,[role=button],[role=combobox]'))):[];
  const soilSnapshot=(label,root)=>{
    const nodes=[root,...root.querySelectorAll('*')].filter(e=>!e.matches('script,style,textarea,[contenteditable],input[type=hidden],input[type=password],input[type=email],input[type=tel]')&&!e.closest('textarea,[contenteditable]')&&(!e.matches('input,select,button')||!sensitive(e))).slice(0,180);
    const parents=[];for(let p=root.parentElement;p&&parents.length<4&&!p.matches('body,html');p=p.parentElement)parents.push(metaShape(p));
    return {label,container:metaShape(root),parents,nodes:nodes.map(e=>({...metaShape(e),classes:[...e.classList].map(metaToken).filter(Boolean).slice(0,32),parent:nodes.indexOf(e.parentElement),children:e.childElementCount,visible:visible(e),type:metaToken(e.getAttribute('type')),disabled:Boolean(e.disabled),readOnly:Boolean(e.readOnly),selected:buttonState(e),hasPopup:['true','dialog','listbox','menu'].includes(e.getAttribute('aria-haspopup'))?e.getAttribute('aria-haspopup'):'',monthFormat:monthFormat(e)}))};
  };
  const captureSoil=()=>{
    if(!soil)return [];
    const roots=soilAnchors().map(e=>{
      let root=e;for(let i=0;i<4&&root.parentElement&&!root.parentElement.matches('body,html,form');i++)root=root.parentElement;
      return {label:soilHint(e),root};
    });
    for(const root of document.querySelectorAll('dialog,[role=dialog],[aria-modal=true],[role=listbox],[role=menu]'))if(visible(root))roots.push({label:'열린 선택창',root});
    return roots.slice(0,16).map(({label,root})=>soilSnapshot(label,root));
  };
  // Selected names/categories may no longer have their empty-field prompts.
  // Anchor diagnostics to stable grade names, without exporting any values/text.
  const captureMajorRows=()=>{
    if(!soil)return [];
    return [...document.querySelectorAll('input')].filter(e=>soilMajorGrade(e)&&visible(e)).slice(0,8).map(grade=>{
      let root=grade.parentElement;
      for(let depth=0;root?.parentElement&&depth<12&&!root.parentElement.matches('form,body,html');depth++){
        const parent=root.parentElement;
        if([...parent.querySelectorAll('input')].filter(soilMajorGrade).length!==1)break;
        root=parent;
      }
      const row=supportedMajorRow(grade);
      const inputs=row?[...row.area.querySelectorAll('input[type=text],input:not([type])')].filter(e=>visible(e)&&e.closest('div.ats-inline-flex.ats-flex-col.ats-relative.ats-group')&&!e.closest('[id="dropdown-body"]')):[];
      return {grade:metaShape(grade),gradeDisabled:Boolean(grade.disabled),recognized:Boolean(row),kind:row?.kind||'',nameInputCandidates:inputs.length,...soilSnapshot('전공 행',root||grade)};
    });
  };
  if(action==='watch-search'&&soil){
    globalThis.__moaSearchWatch?.stop();
    const cache=new Map(),changes=new Map(),rootIds=new WeakMap();let timer,observer,nextId=0,context='',contextUntil=0;
    globalThis.__moaSoilChanges=[];
    const status={active:true,startedAt:new Date().toISOString(),inputs:soilAnchors().length,captures:0,inputEvents:0,changedRegions:0};globalThis.__moaSearchStatus=status;
    const stop=()=>{clearTimeout(timer);observer?.disconnect();document.removeEventListener('input',onInput,true);document.removeEventListener('pointerdown',onFocus,true);document.removeEventListener('focusin',onFocus,true);status.active=false;globalThis.__moaSearchWatch=null;};
    const capture=(records=[])=>{
      if(location.href!==url.href){stop();return;}
      status.captures++;captureSoil().forEach((item,i)=>{const key=item.label+i,previous=cache.get(key);if(!previous||item.nodes.length>=previous.nodes.length)cache.set(key,item);});globalThis.__moaSoilEvidence=[...cache.values()];
      // Role-less portals and sibling lists were omitted by the old collector.
      // During an academic interaction, retain new/changed subtrees themselves,
      // rather than assuming where the site's dropdown is mounted.
      if(context&&Date.now()<=contextUntil){
        const roots=new Set();for(const record of records){
          for(const node of record.addedNodes||[])if(node.nodeType===1)roots.add(node);
          const target=record.target?.nodeType===1?record.target:record.target?.parentElement;if(target)roots.add(target);
        }
        for(const root of roots){
          if(root.matches('body,html,form,script,style,svg,path,textarea,[contenteditable],input')||root.closest('textarea,[contenteditable]'))continue;
          if(!rootIds.has(root))rootIds.set(root,++nextId);
          const key=rootIds.get(root),item=soilSnapshot(context+' 변화 영역',root),previous=changes.get(key);
          if(!previous||item.nodes.length>=previous.nodes.length)changes.set(key,item);
          while(changes.size>24)changes.delete(changes.keys().next().value);
        }
        status.changedRegions=changes.size;globalThis.__moaSoilChanges=[...changes.values()];
      }
    };
    const onFocus=e=>{
      const label=soilHint(e.target)||soilHint(e.target.closest('button,[role=button],[role=combobox]')||e.target);
      if(label){context=label;contextUntil=Date.now()+12000;}
    };
    const onInput=e=>{onFocus(e);if(soilHint(e.target)||e.target.closest('dialog,[role=dialog],[role=listbox],[role=menu]')){status.inputEvents++;capture();}};
    observer=new MutationObserver(capture);observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden','style','aria-expanded','aria-selected','aria-pressed','aria-checked','data-state']});
    document.addEventListener('input',onInput,true);document.addEventListener('pointerdown',onFocus,true);document.addEventListener('focusin',onFocus,true);capture();timer=setTimeout(stop,60000);globalThis.__moaSearchWatch={stop};return {ok:true,watching:status.inputs};
  }
  if(action==='watch-search'){
    if(!hs)return {error:'HS효성 지원서에서 실행해 주세요.'};
    globalThis.__moaSearchWatch?.stop();
    const cache=new Map();let timer,observer;
    const status={active:true,startedAt:new Date().toISOString(),inputs:searchInputs().length,captures:0,inputEvents:0};globalThis.__moaSearchStatus=status;
    const capture=()=>{status.captures++;captureSearch().forEach((item,index)=>{const key=item.label+index;const previous=cache.get(key);if(!previous||item.nodes.length>=previous.nodes.length)cache.set(key,item);});globalThis.__moaSearchEvidence=[...cache.values()];};
    const onInput=event=>{if(searchInputs().includes(event.target)){status.inputEvents++;capture();}};
    const stop=()=>{clearTimeout(timer);observer?.disconnect();document.removeEventListener('input',onInput,true);status.active=false;globalThis.__moaSearchWatch=null;};
    observer=new MutationObserver(capture);for(const input of searchInputs()){
      const search=input.closest('div.search');observer.observe(search.parentElement?.matches('.middle-set')?search.parentElement:search,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','style','aria-expanded','aria-controls']});
    }
    document.addEventListener('input',onInput,true);capture();timer=setTimeout(stop,60000);globalThis.__moaSearchWatch={stop};
    return {ok:true,watching:searchInputs().length};
  }
  if(action==='diagnose'){
    // Export structural metadata only: no values, option contents, HTML, URLs, or arbitrary text.
    const allowedLabel=/^(학교코드|전공코드|학과코드|학교명|학교이름|학교소재지|소재지|학과계열|고등학교계열|고등학교주야간|학위구분|학위|입학구분|졸업구분|졸업여부|재학기간|평점|학점|만점|만점기준|전공|전공명|전공계열|주전공|복수전공|부전공|입학일|졸업일|총이수학점|학교검색|전공검색|검색|학교검색어|전공검색어|검색어)$/;
    const token=s=>/^[a-zA-Z_][a-zA-Z0-9_.[\]-]{0,79}$/.test(s||'')&&!/\d{6,}/.test(s)?s:'';
    const shape=e=>({tag:e.tagName.toLowerCase(),id:token(e.id),name:token(e.getAttribute('name')),classes:[...e.classList].map(token).filter(Boolean).slice(0,6),role:token(e.getAttribute('role'))});
    const numberRules=e=>{
      if(!e.matches('input[type=number]'))return {};
      const read=attr=>{const value=e.getAttribute(attr);return value===null?null:(attr==='step'&&value==='any')||/^-?\d{1,4}(?:\.\d{1,4})?$/.test(value)?value:'other';};
      return {numberRules:{min:read('min'),max:read('max'),step:read('step')}};
    };
    const fields=[];
    for(const e of new Set([...document.querySelectorAll('input,select,button,a,[role=button],[role=radio],[role=combobox]'),...soilAnchors()])){
      if(!visible(e)||e.matches('input[type=hidden],input[type=password],input[type=email],input[type=tel]')||sensitive(e))continue;
      const candidates=[labelOf(e),nearby(e),groupLabel(e),searchKind(e),buttonText(e),academicGroupLabel(e)];
      const label=candidates.map(norm).find(s=>allowedLabel.test(s));if(!label)continue;
      const parents=[];for(let p=e.parentElement;p&&parents.length<4&&!p.matches('body,html');p=p.parentElement)parents.push(shape(p));
      const publicChoice=choiceNames[label]?.find(v=>v===norm(e.textContent))||'';
      fields.push({...shape(e),label,type:token(e.type),readOnly:Boolean(e.readOnly),disabled:Boolean(e.disabled),autocomplete:Boolean(e.getAttribute('aria-autocomplete')||e.hasAttribute('list')),parents,...numberRules(e),...(soil?{classes:[...e.classList].map(token).filter(Boolean).slice(0,32),choice:publicChoice,selected:buttonState(e),monthFormat:monthFormat(e)}:{})});
      if(fields.length>=100)break;
    }
    return {version:3,collectorVersion:'0.2.36',captureId:crypto.randomUUID(),capturedAt:new Date().toISOString(),host:location.hostname,fields,dialogs:dialogs().map(shape),hasFrames:Boolean(document.querySelector('iframe')),watchStatus:globalThis.__moaSearchStatus||{active:false,startedAt:null,inputs:soil?soilAnchors().length:searchInputs().length,captures:0,inputEvents:0},searchStructures:captureSearch(),recordedSearchStructures:globalThis.__moaSearchEvidence||[],choiceStructures:captureSoil(),majorStructures:captureMajorRows(),educationStructures:educationHeadings().slice(0,6).map(header=>({family:educationHeading(header),recognized:Boolean(educationArea(header)),...soilSnapshot('학력 구역',educationArea(header)||header.parentElement)})),recordedChoiceStructures:globalThis.__moaSoilEvidence||[],recordedChangeStructures:globalThis.__moaSoilChanges||[]};
  }
  if(action==='scan') {
    if(dialogs().length)return {error:'열린 검색창을 닫은 뒤 입력란을 확인해 주세요.'};
    const scanId=crypto.randomUUID();const nodes=new Map();const controls=[];
    let targetScope='',targetArea=null,targetHeader=null;
    if(soil&&payload.education){
      const headings=educationHeadings();
      if(payload.family==='highschool'||headings.length||payload.requireEducationScope){
        // Add buttons and navigation repeat the same words (diagnostic a2bf7cdf).
        // Count only headings connected to a complete, distinct date section.
        const matches=headings.filter(h=>educationHeading(h)===payload.family).map(header=>({header,area:educationArea(header)})).filter(item=>item.area);
        if(matches.length!==1)return {error:'선택한 학력의 제목과 입학·졸업일 구역을 하나로 확인하지 못했어요. 해당 학력 구역을 펼친 뒤 다시 확인해 주세요. 계속되면 진단 파일 저장으로 구조를 확인할 수 있어요.'};
        targetHeader=matches[0].header;targetArea=matches[0].area;
      }
    }
    if(hs&&payload.education){
      if(!['highschool','college','graduateSchool'].includes(payload.family))return {error:'모아 학력 기록의 학교 구분 또는 학위를 먼저 확인해 주세요. 고등학교·대학교·대학원 중 입력 위치를 구분할 수 없어요.'};
      const scopes=new Set([...document.querySelectorAll('input,select')].filter(e=>!e.disabled&&visible(e)&&named(e)?.family===payload.family).map(e=>named(e).scope));
      if(scopes.size!==1)return {error:scopes.size?'같은 종류의 학력 영역이 여러 개 열려 있어요. 입력할 학교 영역 하나만 남긴 뒤 다시 확인해 주세요.':'선택한 학력 종류에 맞는 활성 입력 영역을 찾지 못했어요.'};
      targetScope=[...scopes][0];
    }
    const inScope=e=>(!targetScope||named(e)?.scope===targetScope)&&(!targetArea||targetArea.contains(e));
    const majorPair=soil?blankMajorPair(payload):null;
    for(const e of document.querySelectorAll('input,select')) {
      if(blocked(e)||!visible(e)||!inScope(e))continue;
      const label=labelOf(e);if(!label)continue;
      const major=soilMajor(e);
      if(major&&!e.disabled&&!e.readOnly){
        let key=major.kind==='복수전공'?'doubleMajor':'major';
        const pairIndex=majorPair?.findIndex(r=>r.element===e)??-1;
        if(pairIndex>=0){key=pairIndex===0?'major':'doubleMajor';major.blankPair=majorPair;major.pairIndex=pairIndex;}
        else if(key==='major'&&major.location.disabled){
          const proof=payload.doubleMajor&&primaryProof(major,payload.primaryMajor);
          if(proof){key='doubleMajor';major.primaryProof=proof;}
          else if(selectedMajorRows().some(r=>r.kind==='주전공'&&r.area!==major.area&&collegeScope(r.scope)===collegeScope(major.scope))){
            controls.push({id:crypto.randomUUID(),label:'전공명',type:'custom-choice',unsupported:true,unsupportedReason:'주전공이 이미 있어요. 모아의 주전공명과 복수전공 정보를 확인해 주세요.'});continue;
          }
        }
        const label=key==='doubleMajor'?'복수전공':'주전공';major.targetKind=label;
        const id=crypto.randomUUID();nodes.set(id,{element:e,label,type:'search',inline:true,soilMajor:major});
        controls.push({id,label,type:'search',inline:true,autoMajor:true,majorKey:key,majorScope:major.scope,planNote:pairIndex>=0?(pairIndex===0?'첫 번째 전공 줄 → 주전공':'두 번째 전공 줄 → 복수전공 · 주전공 선택 후 진행'):'',filled:!major.location.disabled,unsupported:true});continue;
      }
      const school=soilSchool(e);
      if(school&&!e.disabled&&!e.readOnly){
        const id=crypto.randomUUID();
        // A populated search box is not a selected school while location is disabled.
        // High-school location/category can be enabled before any school is
        // entered. Preserve existing text, but do not mistake an empty name for
        // a selected school merely because its location button is enabled.
        school.enabledLocationSearch=payload.family==='highschool'&&Boolean(targetArea)&&!school.location.disabled&&!e.value.trim();
        const selected=!school.location.disabled&&!school.enabledLocationSearch;
        nodes.set(id,{element:e,label,type:'search',inline:true,soilSchool:school});
        controls.push({id,label,type:'search',inline:true,filled:selected,unsupported:true});
        continue;
      }
      const majorRow=soilMajorGrade(e)?supportedMajorRow(e):null;
      const id=crypto.randomUUID();nodes.set(id,{element:e,label,type:e.type,scope:named(e)?.scope||'',monthFormat:monthFormat(e),majorArea:majorRow?.area,majorKind:majorRow?.kind,gradeScope:majorRow?.scope||'',fieldName:e.name});
      const unsupportedReason=e.disabled?'현재 사이트에서 비활성화된 항목':e.readOnly?'사이트에서 읽기 전용으로 제공 · 전용 입력 방식 연결 필요':soilMajorGrade(e)&&!majorRow?'주전공 영역을 확인하지 못해 전공 평점 보류':soil&&soilHint(e)==='학교명'?'학교 검색칸은 있지만 연결할 학교소재지 칸을 확인하지 못했어요':soil&&soilHint(e)==='전공명'?'전공 검색칸은 있지만 주전공 구분·계열·평점 영역을 함께 확인하지 못했어요':unsupported(e)?'검색·자동완성 방식 · 자동 입력 연결 보완 필요':'';
      controls.push({id,label,type:e.type,filled:filled(e),unsupported:Boolean(unsupported(e)),unsupportedReason,monthFormat:monthFormat(e),majorScope:majorRow?.scope});
      if(controls.length>=100)break;
    }
    const seen=new Set();
    if(soil){
      for(const e of document.querySelectorAll('li.ats-list-none > button[type=button]')){
        if(seen.has(e)||!visible(e)||!inScope(e))continue;
        const item=soilGroup(e);if(!item)continue;item.group.forEach(b=>seen.add(b));
        const states=item.group.map(buttonState),known=states.every(s=>s!==null)&&states.filter(Boolean).length<=1;
        const options=item.group.map(b=>clean(b.textContent));
        const replaceSelection=known&&['졸업구분','고등학교주야간'].includes(item.label);
        const id=crypto.randomUUID();nodes.set(id,{element:e,label:item.label,type:'button-group',...item,states,options,replaceSelection});
        controls.push({id,label:item.label,type:'button-group',filled:states.some(s=>s===true),replaceSelection,selectedValue:options[states.indexOf(true)]||'',options,unsupported:!known||item.group.every(b=>!safeButton(b)),unsupportedReason:known?'현재 사이트에서 비활성화된 항목':'버튼의 기존 선택 상태를 확인할 수 없어 입력 보류'});
      }
      for(const e of document.querySelectorAll('button[type=button]')){
        if(!visible(e)||seen.has(e)||!inScope(e))continue;const label=norm(nearby(e)||directLabel(e));
        if(!['만점기준','전공'].includes(label)||soilHint(e))continue;
        controls.push({id:crypto.randomUUID(),label,type:'custom-choice',unsupported:true,unsupportedReason:'사이트 전용 선택 목록 · 열린 목록의 구조 확인 필요'});
      }
      for(const e of soilAnchors()){
        if(!inScope(e)||soilHint(e)==='고등학교계열'&&!inHighSchool(e))continue;
        if(e.matches('input,select'))continue;
        const root=soilChoiceRoot(e);
        if(root){
          const label=choiceLabel(e),isMajor=['전공계열','전공 만점기준','복수전공 계열','복수전공 만점기준'].includes(label),majorRow=isMajor?supportedMajorRow(e):null;
          const id=crypto.randomUUID(),disabled=!safeButton(e)||Boolean(e.closest('fieldset[disabled]'));
          nodes.set(id,{element:e,label,type:'custom-choice',soilChoice:root,majorArea:majorRow?.area,majorKind:majorRow?.kind,gradeScope:majorRow?.scope||'',needsMajor:isMajor});
          controls.push({id,label,type:'custom-choice',filled:false,unsupported:disabled||(isMajor&&!majorRow),unsupportedReason:disabled?'현재 사이트에서 비활성화된 항목':isMajor&&!majorRow?'주전공 영역을 확인하지 못해 선택 보류':'',majorScope:majorRow?.scope});
          continue;
        }
        controls.push({id:crypto.randomUUID(),label:soilHint(e),type:'custom-choice',unsupported:true,unsupportedReason:'검색·선택창 방식 · 열린 창의 구조 확인 필요'});
      }
    }
    for(const e of document.querySelectorAll('input[type=radio]')){
      if(seen.has(e)||!radioVisible(e)||!inScope(e))continue;
      const group=radioOptions(e);group.forEach(r=>seen.add(r));const label=groupLabel(e);
      if(!['학위구분','학위','입학구분','졸업구분','졸업여부'].includes(norm(label))||!group.length)continue;
      const id=crypto.randomUUID();nodes.set(id,{element:e,label,type:'radio-group',group,scope:named(e)?.scope||''});
      controls.push({id,label,type:'radio-group',filled:group.some(r=>r.checked),unsupported:group.every(r=>r.disabled),options:group.map(directLabel)});
    }
    for(const e of document.querySelectorAll('button,input[type=button],a,[role=button]')){
      const label=searchKind(e);if(targetScope||!inScope(e)||!label||!visible(e)||!safeButton(e)||e.closest('dialog,[role=dialog],[aria-modal=true]'))continue;
      const id=crypto.randomUUID();nodes.set(id,{element:e,label,type:'search'});
      controls.push({id,label,type:'search',filled:false,unsupported:true});
    }
    for(const e of searchInputs()){
      const root=e.closest('div.search');const codes=[...root.parentElement.querySelectorAll('input[name]')].filter(x=>/^(학교|전공) 코드$/.test(named(x)?.label||''));
      if(codes.length!==1||!inScope(codes[0]))continue;
      const label=inlineSearchLabel(e)==='학교검색'?'학교명':'전공';const id=crypto.randomUUID();
      nodes.set(id,{element:e,label,type:'search',inline:true,code:codes[0]});controls.push({id,label,type:'search',inline:true,filled:Boolean(codes[0].value),unsupported:true});
    }
    globalThis.__moaAutofill={scanId,url:location.href,nodes,educationArea:targetArea,educationHeader:targetHeader,family:payload.family};
    return {scanId,origin:location.origin,controls,scope:targetScope,hasFrames:Boolean(document.querySelector('iframe'))};
  }
  if(action.startsWith('search-')){
    const state=globalThis.__moaAutofill;
    if(!state||state.url!==location.href||state.scanId!==payload.scanId)return {error:'입력란을 다시 확인해 주세요.'};
    if(action==='search-open'){
      const saved=state.nodes.get(payload.id);const e=saved?.element;
      if(saved?.soilSchool||saved?.soilMajor){
        const isMajor=Boolean(saved.soilMajor),entity=isMajor?'전공':'학교',hint=isMajor?'전공명':'학교명';
        const isHighSchool=!isMajor&&state.family==='highschool';
        const original=saved.soilMajor||saved.soilSchool,current=isMajor?soilMajor(e):soilSchool(e);
        if(isMajor&&original.blankPair&&(original.pairIndex!==0||!validBlankPair(original)))return {error:'두 전공 줄이 바뀌었거나 주전공 선택 전이에요. 입력란을 다시 확인해 주세요.'};
        if(!current||!sameEducation(state,e)||current.root!==original.root||current.area!==original.area||current.location!==original.location||!visible(e)||e.disabled||e.readOnly||e.closest('fieldset[disabled]'))return {error:entity+' 검색 영역이 바뀌었어요. 입력란을 다시 확인해 주세요.'};
        if(isMajor&&[...state.nodes.values()].filter(n=>n.soilMajor&&n.soilMajor.targetKind===original.targetKind&&n.soilMajor.location.disabled).length>1)return {error:'빈 '+original.targetKind+' 영역이 여러 개여서 입력 위치를 확인하지 못했어요.'};
        if(isMajor&&(current.kind!==original.kind||!validPrimaryProof(original)))return {error:'주전공 또는 복수전공 구분이 바뀌었어요. 입력란을 다시 확인해 주세요.'};
        if(typeof payload.value!=='string'||!payload.value.trim()||payload.value.length>120)return {error:'모아에 저장한 '+entity+'명을 확인해 주세요.'};
        const exact=v=>String(v||'').normalize('NFC').replace(/\s+/g,' ').trim(),value=payload.value;
        // User-confirmed spelling pair only. Do not drop arbitrary parentheses
        // such as campus, day/night or degree qualifiers on other majors.
        const majorKey=v=>/^경영정보\s*(?:\(\s*MIS\s*\))?$/i.test(exact(v))?'경영정보(MIS)':exact(v);
        if((!original.location.disabled&&!original.enabledLocationSearch)||(original.enabledLocationSearch&&e.value)||(e.value&&exact(e.value)!==exact(value)))return {error:'선택된 '+entity+' 또는 다른 검색어가 있어 기존 내용을 유지했어요. 검색 중이던 글자만 지운 뒤 다시 실행해 주세요.'};
        if(state.inlineSearch)return {error:entity+' 검색을 진행 중이에요. 잠시 기다려 주세요.'};
        const {root,area,location:locationButton}=original,operation={};state.inlineSearch=operation;
        const dropdowns=()=>[...root.querySelectorAll(':scope > div[id="dropdown-body"]')].filter(visible);
        return new Promise(resolve=>{
          let done=false,clicked=false,kindClicked=false,selectedName=value,fresh=exact(e.value)===exact(value),observer,settle,poll,deadline;
          const finish=result=>{if(done)return;done=true;observer?.disconnect();clearTimeout(settle);clearTimeout(poll);clearTimeout(deadline);if(state.inlineSearch===operation)state.inlineSearch=null;resolve(result);};
          const valid=()=>globalThis.__moaAutofill===state&&state.url===location.href&&sameEducation(state,locationButton)&&area.isConnected&&area.contains(locationButton)&&(isMajor&&clicked?supportedMajorRow(original.grade)?.area===area:e.isConnected&&root.isConnected&&area.contains(root)&&root.contains(e)&&soilHint(e)===hint);
          const resultButtons=()=>{
            const lists=dropdowns();
            if(lists.length!==1)return [];
            // Scrollbar spacing and wrappers vary with result count. Keep the
            // observed list/row/button structure within this search's dropdown,
            // but do not require presentation-only ats-mr-200 or a scrollbar.
            const menus=[...lists[0].querySelectorAll('ul.ats-flex.ats-flex-col')].filter(visible);
            if(menus.length!==1)return [];
            return [...menus[0].querySelectorAll(':scope > li.ats-relative.ats-truncate > button[type=button].ats-truncate')].filter(visible);
          };
          const matches=()=>{
            const candidates=resultButtons();
            const literal=candidates.filter(b=>exact(b.textContent)===exact(value));
            return literal.length||!isMajor?literal:candidates.filter(b=>majorKey(b.textContent)===majorKey(value));
          };
          const majorUnchanged=()=>{if(!isMajor)return true;const now=soilMajor(e);return now?.area===area&&now.location===locationButton&&now.grade===original.grade&&now.kind===original.kind&&validPrimaryProof(original)&&validBlankPair(original,value)&&now.kinds.every((b,i)=>b===original.kinds[i]);};
          const unchanged=()=>valid()&&majorUnchanged()&&visible(e)&&!e.disabled&&!e.readOnly&&!e.closest('fieldset[disabled]')&&e.value===value&&(original.enabledLocationSearch?!locationButton.disabled:locationButton.disabled);
          const inspect=()=>{
            if(done)return;
            if(!valid())return finish({error:'검색 중 화면이나 '+entity+' 입력 영역이 바뀌어 중단했어요. 입력란을 다시 확인해 주세요.'});
            if(clicked){
              // Require the exact option click, retained name and closed menu.
              // College/major controls must also unlock; high-school location
              // can already be enabled, so do not require a disabled transition.
              const name=isMajor?majorNameEvidence(supportedMajorRow(original.grade)):null;
              const nameConfirmed=isMajor?name?.slot===original.nameSlot&&(name.display||name.node===e)&&exact(name.value)===exact(selectedName):exact(e.value)===exact(selectedName);
              if(nameConfirmed&&!dropdowns().length&&!locationButton.disabled&&visible(locationButton)){
                if(isMajor){
                  if(!validBlankPair(original,selectedName,true))return finish({error:'두 전공 줄의 배치나 내용이 바뀌어 이어서 입력하지 않았어요. 입력란을 다시 확인해 주세요.'});
                  const row=supportedMajorRow(original.grade);
                  if(row?.area!==area||row.scope!==original.scope||row.kinds.some((b,i)=>b!==original.kinds[i]))return finish({error:'선택 후 전공 영역이 바뀌어 구분을 확인하지 못했어요.'});
                  if(original.primaryProof){
                    if(!validPrimaryProof(original))return finish({error:'기존 주전공이 바뀌어 복수전공 구분 선택을 중단했어요.'});
                    if(row.kind==='주전공'&&!kindClicked){
                      const button=row.kinds.find(b=>clean(b.textContent)==='복수전공');
                      if(!safeButton(button)||button.closest('fieldset[disabled]'))return;
                      kindClicked=true;button.click();return;
                    }
                  }
                  if(row.kind!==original.targetKind)return;
                }
                finish({ok:true,inline:true,selected:true,...(isMajor?{selectedName}: {})});
              }
              return;
            }
            if(!unchanged())return finish({error:'검색 중 작성 내용이 바뀌어 자동 선택을 중단했어요. 기존 내용은 유지했습니다.'});
            if(!fresh||settle||!matches().length)return;
            settle=setTimeout(()=>{
              settle=null;if(done)return;
              if(!unchanged())return finish({error:'검색 중 입력 상태가 바뀌어 자동 선택을 중단했어요.'});
              const found=matches();
              if(found.length>1)return finish({error:isMajor?'같은 이름의 전공이 여러 개예요. 사이트에서 결과를 확인해 주세요.':isHighSchool?'같은 이름의 고등학교가 여러 개예요. 사이트에서 학교 정보를 확인해 선택해 주세요.':'같은 이름의 학교가 여러 개예요. 캠퍼스를 확인해 사이트에서 선택해 주세요.'});
              if(found.length!==1)return;
              if(!safeButton(found[0])||found[0].closest('fieldset[disabled]'))return finish({error:entity+' 검색 결과가 비활성화되어 선택하지 않았어요.'});
              selectedName=isMajor?exact(found[0].textContent):value;clicked=true;
              try{found[0].click();inspect();}catch{finish({error:entity+' 선택 결과를 확인하지 못했어요. 사이트에서 확인해 주세요.'});}
            },250);
          };
          observer=new MutationObserver(records=>{
            if(!clicked&&records.some(r=>r.type!=='attributes'&&(r.target.parentElement?.closest('[id="dropdown-body"]')||r.target.nodeType===1&&r.target.matches('[id="dropdown-body"]')||[...r.addedNodes].some(n=>n.nodeType===1&&n.matches('[id="dropdown-body"]'))))){fresh=true;clearTimeout(settle);settle=null;}
            inspect();
          });
          observer.observe(area,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','hidden','style','class','aria-disabled']});
          deadline=setTimeout(()=>{
            let error;
            if(clicked)error=entity+' 결과를 눌렀지만 선택 완료를 확인하지 못했어요. 사이트의 입력 상태를 확인해 주세요.';
            else if(dropdowns().length&&!resultButtons().length)error=entity+' 결과 목록은 열렸지만 선택 버튼 구조를 확인하지 못했어요.';
            else if(!fresh)error='검색 결과가 갱신됐는지 확인하지 못해 자동 선택을 보류했어요.';
            else if(isMajor)error='전공 결과 버튼 '+resultButtons().length+'개에서 저장한 이름 또는 확인된 별칭과 일치하는 새 결과를 찾지 못했어요.';
            else error='학교 결과 버튼 '+resultButtons().length+'개에서 저장한 학교명과 정확히 일치하는 결과를 찾지 못했어요. 사이트 결과를 확인해 주세요.';
            finish({error});
          },7000);
          const tick=()=>{inspect();if(!done)poll=setTimeout(tick,150);};
          try{
            e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);
            e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
            e.dispatchEvent(new KeyboardEvent('keyup',{key:value.slice(-1),bubbles:true}));tick();
          }catch{finish({error:entity+' 검색을 실행하지 못했어요. 사이트 입력 상태를 확인해 주세요.'});}
        });
      }
      if(saved?.inline){
        if(!e||!visible(e)||e.disabled||e.readOnly||!searchInputs().includes(e)||!saved.code.isConnected)return {error:'검색 입력칸이 바뀌었어요. 다시 확인해 주세요.'};
        if(typeof payload.value!=='string'||!payload.value.trim()||payload.value.length>120)return {error:'검색할 이름을 확인해 주세요.'};
        if(saved.code.value!==''||(e.value!==''&&e.value!==payload.value))return {error:'다른 검색어 또는 선택된 학교·전공이 이미 있어요. 기존 내용은 유지했습니다.'};
        if(saved.label==='학교명'){
          if(state.inlineSearch)return {error:'학교 검색을 진행 중이에요. 잠시 기다려 주세요.'};
          const search=e.closest('div.search'),root=search.parentElement,code=saved.code,codeName=code.name;
          const exact=v=>String(v||'').normalize('NFC').replace(/\s+/g,' ').trim();
          const value=payload.value,selectedName=()=>root.querySelector(':scope > span.searchResultName');
          if(exact(selectedName()?.textContent))return {error:'학교 선택 내용이 이미 있어요. 기존 내용은 유지했습니다.'};
          const operation={};state.inlineSearch=operation;
          // One page-side operation survives popup focus changes. Only the observed
          // result-list buttons are eligible; the site's click handler owns its code.
          return new Promise(resolve=>{
            let done=false,clicked=false,fresh=e.value===value,poll,deadline,settle,observer;
            const finish=result=>{if(done)return;done=true;clearTimeout(poll);clearTimeout(deadline);clearTimeout(settle);observer?.disconnect();if(state.inlineSearch===operation)state.inlineSearch=null;resolve(result);};
            const valid=()=>globalThis.__moaAutofill===state&&state.url===location.href&&e.isConnected&&code.isConnected&&code.name===codeName&&e.closest('div.search')===search&&search.parentElement===root&&root.contains(code)&&named(code)?.label==='학교 코드';
            const buttons=()=>[...search.querySelectorAll(':scope > div.searchResult > ul.searchResultList > li > button.ellipsis')].filter(b=>visible(b)&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'&&exact(b.textContent)===exact(value));
            const inspect=()=>{
              if(done)return;
              if(!valid())return finish({error:'검색 중 화면이나 학력 영역이 바뀌어 중단했어요. 입력란을 다시 확인해 주세요.'});
              if(clicked){
                if(code.value&&exact(selectedName()?.textContent)===exact(value))finish({ok:true,inline:true,selected:true});
                return;
              }
              if(code.value||e.value!==value||!visible(e)||e.disabled||e.readOnly)return finish({error:'검색 중 작성 내용이 바뀌어 자동 선택을 중단했어요. 기존 내용은 유지했습니다.'});
              if(!fresh||settle)return;
              const matches=buttons();if(!matches.length)return;
              settle=setTimeout(()=>{
                settle=null;if(done)return;
                if(!valid()||code.value||e.value!==value||!visible(e)||e.disabled||e.readOnly)return finish({error:'검색 중 입력 상태가 바뀌어 자동 선택을 중단했어요.'});
                const current=buttons();
                if(current.length>1)return finish({error:'같은 이름의 학교가 여러 개예요. 캠퍼스를 확인해 사이트에서 선택해 주세요.'});
                if(current.length!==1)return;
                const button=current[0];
                // A default submit button outside a form cannot submit; inside a
                // form only an explicit type=button is safe to activate.
                if(button.type!=='button'&&!(button.type==='submit'&&!button.form))return finish({error:'학교 결과 버튼이 제출 동작과 구분되지 않아 자동 선택을 멈췄어요. 사이트에서 선택해 주세요.'});
                clicked=true;try{button.click();inspect();}catch{finish({error:'학교 선택 결과를 확인하지 못했어요. 지원서에서 확인해 주세요.'});}
              },250);
            };
            observer=new MutationObserver(records=>{
              if(records.some(r=>r.type!=='attributes'&&(r.target.parentElement?.closest('.searchResult')||r.target.nodeType===1&&r.target.matches('.searchResult')||[...r.addedNodes].some(n=>n.nodeType===1&&n.matches('.searchResult'))))){fresh=true;clearTimeout(settle);settle=null;}
              inspect();
            });
            observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','style','class','disabled','aria-disabled']});
            deadline=setTimeout(()=>finish({error:clicked?'학교 선택은 요청했지만 반영 여부를 확인하지 못했어요. 사이트에서 학교명을 확인해 주세요.':'이름이 정확히 일치하는 새 검색 결과를 찾지 못했어요. 검색어는 입력했으며, 사이트 결과에서 학교명·캠퍼스를 확인해 주세요.'}),7000);
            // Property-only changes (including the hidden code) may not emit DOM mutations.
            const tick=()=>{inspect();if(!done)poll=setTimeout(tick,150);};
            try{
              e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);
              e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
              e.dispatchEvent(new KeyboardEvent('keyup',{key:value.slice(-1),bubbles:true}));tick();
            }catch{finish({error:'학교 검색을 실행하지 못했어요. 지원서에서 입력 상태를 확인해 주세요.'});}
          });
        }
        e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,payload.value);
        e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
        return e.isConnected&&e.value===payload.value?{ok:true,inline:true}:{error:'검색어가 유지되지 않았어요. 사이트 입력 방식을 더 확인해야 합니다.'};
      }
      if(saved?.type!=='search'||!e||!visible(e)||!safeButton(e)||searchKind(e)!==saved.label)return {error:'검색 버튼이 바뀌었어요. 다시 확인해 주세요.'};
      if(typeof payload.value!=='string'||!payload.value.trim()||payload.value.length>120)return {error:'검색할 이름을 확인해 주세요.'};
      if(dialogs().length)return {error:'이미 열린 검색창을 닫고 다시 시도해 주세요.'};
      state.search={label:saved.label,value:payload.value,candidates:new Map()};
      e.click();return {ok:true};
    }
    const s=state.search;if(!s)return {error:'먼저 학교·전공 검색을 열어 주세요.'};
    if(action==='search-query'){
      const ds=dialogs();if(ds.length!==1)return {error:'검색창 구조를 확인하지 못했어요. 열린 창에서 직접 검색해 주세요.'};
      const d=ds[0];const inputs=[...d.querySelectorAll('input')].filter(e=>['text','search'].includes(e.type)&&visible(e)&&!unsupported(e)&&!sensitive(e));
      if(inputs.length!==1||inputs[0].value!=='')return {error:'검색어 입력칸이 여러 개이거나 이미 작성돼 있어요. 사이트에서 직접 검색해 주세요.'};
      const input=inputs[0];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,s.value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
      if(!input.isConnected||input.value!==s.value)return {error:'사이트가 검색어를 유지하지 못했어요. 직접 입력해 주세요.'};
      s.dialog=d;s.input=input;
      const buttons=[...d.querySelectorAll('button,input[type=button],a,[role=button]')].filter(e=>visible(e)&&safeButton(e)&&['검색','학교검색','전공검색'].includes(norm(buttonText(e))));
      if(buttons.length!==1)return {error:'이름은 입력했어요. 사이트에서 검색을 눌러 주세요.'};
      buttons[0].click();return {ok:true};
    }
    if(!s.dialog?.isConnected||!visible(s.dialog))return {error:'검색창이 닫혔어요. 입력란을 다시 확인해 주세요.'};
    if(action==='search-results'){
      s.candidates.clear();const results=[];
      for(const e of s.dialog.querySelectorAll('button,a,[role=option],[role=button]')){
        if(!visible(e)||e.disabled||e.getAttribute('aria-disabled')==='true'||e.matches('button[type=submit]'))continue;
        const label=buttonText(e);if(norm(label)!==norm(s.value))continue;
        if(e.querySelector('button,a,[role=option],[role=button]'))continue;
        const id=crypto.randomUUID();s.candidates.set(id,e);results.push({id,label});
      }
      if(results.length>1){s.candidates.clear();return {results:[],ambiguous:true};}
      return {results};
    }
    if(action==='search-select'){
      const e=s.candidates.get(payload.id);
      if(!e||!visible(e)||!s.dialog.contains(e)||norm(buttonText(e))!==norm(s.value)||e.disabled||e.getAttribute('aria-disabled')==='true')return {error:'검색 결과가 바뀌었어요. 다시 확인해 주세요.'};
      e.click();state.search=null;return {ok:true};
    }
    return {error:'지원하지 않는 검색 요청입니다.'};
  }
  if(action!=='fill')return {error:'지원하지 않는 요청입니다.'};
  const state=globalThis.__moaAutofill;
  if(!state||state.scanId!==payload.scanId||state.url!==location.href)return {error:'화면이 바뀌었어요. 입력란을 다시 확인해 주세요.'};
  const entries=payload.entries;
  if(!Array.isArray(entries)||entries.length>100||new Set(entries.map(e=>e.id)).size!==entries.length)return {error:'입력할 항목을 다시 선택해 주세요.'};
  if(payload.order==='top-down'||entries.some(item=>state.nodes.get(item.id)?.soilChoice||soilGrade(state.nodes.get(item.id)?.element)||soilMonth(state.nodes.get(item.id)?.element))){
    if(state.choiceFill)return {error:'학적 정보 입력을 진행 중이에요. 잠시 기다려 주세요.'};
    const operation={};state.choiceFill=operation;
    const chooseChoice=item=>{
      const saved=state.nodes.get(item.id),e=saved.element,root=saved.soilChoice;
      const result=(ok,reason='')=>({id:item.id,label:saved.label,ok,reason});
      if(typeof item.value!=='string'||!item.value.trim()||item.value.length>120)return Promise.resolve(result(false,'모아에 저장된 '+saved.label+' 값을 확인해 주세요'));
      const key=value=>choiceKey(value,saved.label);
      const valid=()=>globalThis.__moaAutofill===state&&state.url===location.href&&sameEducation(state,e)&&e.isConnected&&root.isConnected&&e.parentElement===root&&sameMajorScope(saved,e)&&(!saved.needsMajor||Boolean(saved.majorArea));
      const editable=()=>valid()&&soilChoiceRoot(e)===root&&choiceLabel(e)===saved.label&&visible(e)&&safeButton(e)&&!e.closest('fieldset[disabled]');
      if(!editable()||dialogs().length)return Promise.resolve(result(false,'기존 선택 또는 변경·비활성화된 항목을 유지했어요'));
      const dropdowns=()=>[...root.querySelectorAll(':scope > div[id="dropdown-body"]')].filter(visible);
      return new Promise(resolve=>{
        let done=false,clicked=false,observer,settle,poll,deadline;
        const finish=(ok,reason)=>{if(done)return;done=true;observer?.disconnect();clearTimeout(settle);clearTimeout(poll);clearTimeout(deadline);resolve(result(ok,reason));};
        const options=()=>{
          const lists=dropdowns();if(lists.length!==1)return [];
          // The school and location triggers share the observed ATS component.
          // Its menu is accepted only when this same nested list structure exists
          // at runtime. Unknown/portal structures stay unselected.
          if(saved.needsMajor){
            const menus=[...lists[0].querySelectorAll('ul')].filter(visible);if(menus.length!==1)return [];
            return [...menus[0].querySelectorAll(':scope > li > button[type=button]')].filter(b=>visible(b)&&key(b.textContent)===key(item.value));
          }
          return [...lists[0].querySelectorAll('[id="design-system-scroll-container"] > div.ats-mr-200 > ul > li > button[type=button]')].filter(b=>visible(b)&&key(b.textContent)===key(item.value));
        };
        const inspect=()=>{
          if(done)return;
          if(!valid())return finish(false,'입력 중 화면이나 선택 영역이 바뀌어 중단했어요');
          if(clicked){
            if(!dropdowns().length&&key(e.textContent)===key(item.value)&&visible(e))finish(true);
            return;
          }
          if(!editable())return finish(false,'기존 선택 또는 입력 상태가 바뀌어 자동 선택을 중단했어요');
          if(settle||!options().length)return;
          settle=setTimeout(()=>{
            settle=null;if(done)return;
            if(!editable())return finish(false,'입력 상태가 바뀌어 자동 선택을 중단했어요');
            const found=options();
            if(found.length>1)return finish(false,'일치하는 선택지가 여러 개라 선택하지 않았어요');
            if(found.length!==1)return;
            if(!safeButton(found[0])||found[0].closest('fieldset[disabled]'))return finish(false,'해당 선택지가 비활성화되어 있어요');
            clicked=true;try{found[0].click();inspect();}catch{finish(false,'선택 결과를 확인하지 못했어요');}
          },200);
        };
        observer=new MutationObserver(()=>{if(!clicked){clearTimeout(settle);settle=null;}inspect();});
        observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','aria-disabled','hidden','style','class']});
        deadline=setTimeout(()=>finish(false,clicked?'선택을 눌렀지만 화면 반영을 확인하지 못했어요':saved.label+' 목록에서 저장된 값을 확인하지 못했어요. 열린 목록의 구조 확인이 필요해요'),5000);
        const tick=()=>{inspect();if(!done)poll=setTimeout(tick,150);};
        try{if(!dropdowns().length)e.click();tick();}catch{finish(false,'선택 목록을 열지 못했어요');}
      });
    };
    return (async()=>{
      const results=[],failedScales=new Set();
      const flowLabels=state.family==='highschool'?['졸업구분','학교소재지','소재지','고등학교계열','고등학교주야간','입학일','졸업일']:['학위구분','학교구분','학교소재지','소재지','입학일','졸업일','졸업구분','입학구분','학과계열','만점기준','평점','학점','총이수학점','전공계열','전공만점기준','전공평점','복수전공계열','복수전공만점기준','복수전공평점'];
      const priority=item=>{
        const saved=state.nodes.get(item.id);
        if(payload.order==='top-down'){const rank=flowLabels.indexOf(norm(saved?.label));return rank<0?flowLabels.length:rank;}
        return ['만점기준','전공 만점기준','복수전공 만점기준'].includes(saved?.label)?0:soilGrade(saved?.element)?2:1;
      };
      try{
        for(const item of [...entries].sort((a,b)=>priority(a)-priority(b))){
          if(globalThis.__moaAutofill!==state||state.url!==location.href){results.push({id:item.id,label:state.nodes.get(item.id)?.label||'입력란',ok:false,reason:'화면이 바뀌어 입력을 중단했어요'});continue;}
          const saved=state.nodes.get(item.id),isGrade=soilGrade(saved?.element),isMonth=soilMonth(saved?.element);
          if(saved?.soilChoice){const result=await chooseChoice(item);results.push(result);if(['만점기준','전공 만점기준','복수전공 만점기준'].includes(saved.label)&&!result.ok)failedScales.add(saved.gradeScope||'college');}
          else{
            if(isGrade&&failedScales.has(saved.gradeScope||'college')){results.push({id:item.id,label:saved.label,ok:false,reason:'만점 기준 선택을 확인하지 못해 평점 입력을 보류했어요'});continue;}
            const response=fillOrdinary([item]);
            if((isGrade||isMonth)&&response.results[0]?.ok){
              // Site validation/controlled rendering may clear a number after the
              // input handler returns. Verify after blur and a settling interval.
              await new Promise(resolve=>setTimeout(resolve,1000));
              const e=saved.element;
              if(globalThis.__moaAutofill!==state||state.url!==location.href||!e.isConnected||!visible(e)||!sameMajorScope(saved,e)||e.name!==saved.fieldName||(isGrade?!soilGrade(e):!soilMonth(e))||!sameInputValue(e,item.value)){
                response.results[0].ok=false;response.results[0].reason=isMonth?'사이트가 연월 입력을 유지하지 않았어요. 날짜 선택창의 입력 방식을 더 확인해야 해요':'사이트가 평점을 비우거나 변경했어요. 만점 기준과 사이트 안내를 확인해 주세요';
              }
            }
            results.push(...response.results);
          }
        }
        return {results};
      }finally{if(state.choiceFill===operation)state.choiceFill=null;}
    })();
  }
  function fillOrdinary(items){
  const results=[];
  for(const item of items) {
    const saved=state.nodes.get(item.id);const e=saved?.element;
    let reason='';let value=item.value;
    if(e&&!sameEducation(state,e)){results.push({id:item.id,label:saved.label,ok:false,reason:'학력 구역이 바뀌어 입력하지 않았어요'});continue;}
    if(saved?.type==='button-group'){
      const current=soilGroup(e),equivalent=v=>norm(v).replace(/^신입학$/,'입학').replace(/^편입학$/,'편입');
      if(!current||current.root!==saved.root||current.label!==saved.label||current.group.length!==saved.group.length||current.group.some((b,i)=>b!==saved.group[i]))reason='선택 항목이 바뀌었어요';
      else{
        const states=current.group.map(buttonState),options=current.group.filter(b=>equivalent(b.textContent)===equivalent(value));
        if(states.some(s=>s===null)||states.filter(Boolean).length>1)reason='기존 선택 상태를 확인할 수 없어요';
        else if(saved.replaceSelection&&(states.some((s,i)=>s!==saved.states[i])||current.group.some((b,i)=>clean(b.textContent)!==saved.options[i])))reason='미리보기 이후 선택이 바뀌었어요. 입력란을 다시 확인해 주세요';
        else if(states.some(s=>s===true)&&!saved.replaceSelection)reason='기존 선택 유지';
        else if(typeof value!=='string'||options.length!==1)reason='일치하는 선택지가 없거나 여러 개예요';
        else if(!safeButton(options[0])||options[0].closest('fieldset[disabled]'))reason='현재 사이트에서 비활성화된 항목';
        else if(buttonState(options[0])===true)reason='저장된 재학 상태와 같아요';
        else{options[0].click();if(!options[0].isConnected||buttonState(options[0])!==true||current.group.filter(b=>buttonState(b)===true).length!==1)reason='선택을 요청했지만 반영 여부는 사이트에서 확인해 주세요';}
      }
      results.push({id:item.id,label:saved.label,ok:!reason,reason});continue;
    }
    if(saved?.type==='radio-group'){
      const group=radioOptions(e);const equivalent=v=>norm(v).replace(/^신입학$/,'입학').replace(/^편입학$/,'편입');
      const options=group.filter(r=>!r.disabled&&radioVisible(r)&&equivalent(directLabel(r))===equivalent(value));
      if(group.length!==saved.group.length||group.some((r,i)=>r!==saved.group[i])||groupLabel(e)!==saved.label||(named(e)?.scope||'')!==saved.scope)reason='선택 항목이 바뀌었어요';
      else if(group.some(r=>r.checked))reason='기존 선택 유지';
      else if(typeof value!=='string'||options.length!==1)reason='일치하는 선택지가 없거나 여러 개예요';
      else {options[0].click();if(!options[0].isConnected||!options[0].checked)reason='선택 결과를 사이트에서 확인해 주세요';}
      results.push({id:item.id,label:saved.label,ok:!reason,reason});continue;
    }
    if(!e||!visible(e)||blocked(e)||unsupported(e)||!sameMajorScope(saved,e)||e.name!==saved.fieldName||labelOf(e)!==saved.label||e.type!==saved.type||(named(e)?.scope||'')!==saved.scope||monthFormat(e)!==saved.monthFormat)reason='입력란이 바뀌었거나 직접 선택이 필요해요';
    else if(filled(e))reason='기존 값 유지';
    else if(typeof value!=='string'||!value||value.length>1000)reason='저장한 값 확인 필요';
    else if(monthFormat(e)&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))reason='저장된 입학·졸업 연월 형식 확인 필요';
    else if(/^\d{4}-\d{2}$/.test(value)&&e.type!=='month'&&!monthFormat(e)&&['입학일','졸업일'].includes(norm(saved.label)))reason='저장된 정보는 연월까지만 있어요. 날짜칸의 입력 형식을 확인해 주세요';
    else if(e.tagName==='SELECT') {
      const norm=v=>v.replace(/\s+/g,'').normalize('NFKC');
      const options=[...e.options].filter(o=>!o.disabled&&!o.closest('optgroup')?.disabled&&o.value&&norm(o.textContent)===norm(value));
      if(options.length!==1)reason='일치하는 선택지가 없거나 여러 개예요';
      else value=options[0].value;
    } else {
      const format=monthFormat(e);
      if(format&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value))value=format.replace('YYYY',value.slice(0,4)).replace('MM',value.slice(5));
      const probe=document.createElement('input');
      for(const attr of ['type','min','max','step','pattern','maxlength'])if(e.hasAttribute(attr))probe.setAttribute(attr,e.getAttribute(attr));
      // Only the observed S-OIL GPA field may use decimals when no explicit
      // step exists. This changes our detached probe, never the site's rules.
      if(soilGrade(e)&&!e.hasAttribute('step'))probe.step='any';
      probe.value=value;
      if(probe.value!==value||!probe.checkValidity()||(soilGrade(e)&&!/^\d+(?:\.\d+)?$/.test(value))||(e.maxLength>=0&&value.length>e.maxLength))reason='날짜·숫자·글자 수 등 입력 형식 확인 필요';
    }
    if(!reason) {
      try {
        const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
        if(soilGrade(e)||soilMonth(e))e.focus();
        Object.getOwnPropertyDescriptor(proto,'value').set.call(e,value);
        e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
        if(soilGrade(e)||soilMonth(e))e.blur();
        if(!e.isConnected||!sameInputValue(e,value))reason='사이트가 입력을 다시 바꿨어요. 화면에서 확인해 주세요';
      }catch {reason='이 입력란은 직접 입력해 주세요';}
    }
    results.push({id:item.id,label:saved?.label||'입력란',ok:!reason,reason});
  }
  return {results};
  }
  return fillOrdinary(entries);
}
