import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,validateState} from '../lib/domain.mjs';
import {openStore} from '../lib/store.mjs';
import {blankProfileRecord,normalizeProfile,profileErrors,profileSections} from '../lib/profile.mjs';
import {extensionProfile} from '../lib/extension-profile.mjs';
import {automaticPlan} from '../extension/autofill-core.js';

test('고등학교 계열·주야간은 별도로 저장·전달하고 기존 학교 기록을 보존한다',()=>{
  const record={...blankProfileRecord('educations','high'),schoolType:'고등학교',schoolName:'가상고'};delete record.highSchoolCategory;delete record.highSchoolSession;
  const profile=normalizeProfile({...initialState().profile,educations:[record]});assert.equal(profile.educations[0].highSchoolCategory,'');assert.equal(profile.educations[0].highSchoolSession,'');assert.equal(record.highSchoolCategory,undefined);
  Object.assign(profile.educations[0],{highSchoolCategory:'인문계열',highSchoolSession:'야간'});assert.deepEqual(profileErrors(profile),{});
  const store=openStore(':memory:');try{const current=store.read('demo');current.data.profile=profile;store.write('demo',current.data,current.revision);const saved=store.read('demo').data.profile;const fields=extensionProfile(saved).find(s=>s.key==='educations').records[0].fields;assert.equal(fields.find(f=>f.key==='highSchoolCategory').value,'인문계열');assert.equal(fields.find(f=>f.key==='highSchoolSession').value,'야간');}finally{store.close();}
  profile.educations[0].highSchoolSession='주야간';assert.ok(profileErrors(profile)['educations.high.highSchoolSession']);
  profile.educations[0].highSchoolCategory=null;assert.ok(profileErrors(normalizeProfile(profile))['educations.high.highSchoolCategory']);
});

test('이전 주전공 계열과 평점을 보존하고 기존 공통 만점을 주전공 만점으로 한 번만 옮긴다',()=>{
  const record={...blankProfileRecord('educations','major'),schoolName:'가상대',departmentCategory:'공학계열',major:'가상전공',gpa:'3.6',majorGpa:'4.19',gpaScale:'4.5'};delete record.majorCategory;
  delete record.majorGpaScale;record.minor='이전 부전공';
  const old={...normalizeProfile(initialState().profile),educations:[record]},next=normalizeProfile(old);
  assert.equal(next.educations[0].majorCategory,'');assert.equal(record.majorCategory,undefined);assert.deepEqual(normalizeProfile(next),next);
  next.educations[0].majorCategory='상경계열';assert.deepEqual(profileErrors(next),{});
  const store=openStore(':memory:');try{
    const current=store.read('demo');current.data.profile=next;store.write('demo',current.data,current.revision);
    const saved=store.read('demo').data.profile,fields=extensionProfile(saved).find(s=>s.key==='educations').records[0].fields;
    assert.equal(saved.educations[0].majorCategory,'상경계열');
    assert.equal(fields.find(f=>f.key==='majorCategory').value,'상경계열');assert.equal(fields.find(f=>f.key==='departmentCategory').value,'공학계열');
    assert.equal(fields.find(f=>f.key==='majorGpaScale').value,'4.5');assert.equal(fields.find(f=>f.key==='gpaScale').value,'4.5');assert.equal(fields.find(f=>f.key==='majorGpa').value,'4.19');
    assert.equal(saved.educations[0].majorGpaScale,'4.5');assert.equal(saved.educations[0].minor,'이전 부전공');
    assert.equal(fields.some(f=>f.key==='minor'),false);assert.equal(fields.filter(f=>f.key==='majorGpaScale').length,1);
  }finally{store.close();}
  next.educations[0].majorCategory=123;assert.ok(profileErrors(normalizeProfile(next))['educations.major.majorCategory']);
});

test('각 전공의 성적과 계열을 별도로 저장하고 전체·주전공 자동 입력에 정확히 전달한다',()=>{
  const profile=normalizeProfile(initialState().profile);
  profile.educations=[{...blankProfileRecord('educations','separate'),schoolName:'시험대',departmentCategory:'학교 계열',
    major:'주전공명',majorCategory:'주전공 계열명',majorGpa:'4.1',majorGpaScale:'4.3',majorCredits:'65',
    doubleMajor:'복수전공명',doubleMajorCategory:'복수전공 계열명',doubleMajorGpa:'3.8',doubleMajorGpaScale:'4',doubleMajorCredits:'42',
    gpa:'4.2',gpaScale:'4.5',totalCredits:'140'}];
  assert.deepEqual(profileErrors(profile),{});
  const store=openStore(':memory:');try{
    const state=store.read('demo');state.data.profile=profile;store.write('demo',state.data,state.revision);
    const saved=store.read('demo').data.profile;assert.deepEqual(saved.educations,profile.educations);
    const fields=extensionProfile(saved)[0].records[0].fields;
    for(const key of ['majorCategory','majorGpa','majorGpaScale','majorCredits','doubleMajorCategory','doubleMajorGpa','doubleMajorGpaScale','doubleMajorCredits'])assert.equal(fields.find(f=>f.key===key).value,profile.educations[0][key]);
    const plan=automaticPlan(['평점','만점기준','전공 평점','전공 만점기준','전공계열'].map((label,i)=>({id:String(i),label,type:'text'})),fields);
    assert.deepEqual(plan.map(p=>[p.key,p.value]),[['gpa','4.2'],['gpaScale','4.5'],['majorGpa','4.1'],['majorGpaScale','4.3'],['majorCategory','주전공 계열명']]);
  }finally{store.close();}
});

test('각 전공에 맞는 만점과 이수 학점을 검사하며 빈 만점이나 복전 성적은 추측하지 않는다',()=>{
  const profile=normalizeProfile(initialState().profile),record={...blankProfileRecord('educations','a'),schoolName:'시험대',gpaScale:'4.5',majorGpa:'4.1',majorGpaScale:'4',doubleMajorGpa:'3.8',totalCredits:'100',doubleMajorCredits:'101'};profile.educations=[record];
  let errors=profileErrors(profile);assert.ok(errors['educations.a.majorGpa']);assert.ok(errors['educations.a.doubleMajorGpaScale']);assert.ok(errors['educations.a.doubleMajorCredits']);
  record.majorGpaScale='';record.doubleMajorGpaScale='0';errors=profileErrors(profile);assert.ok(errors['educations.a.majorGpaScale']);assert.ok(errors['educations.a.doubleMajorGpaScale']);
  assert.equal(normalizeProfile(profile).educations[0].majorGpaScale,'');
  record.majorGpaScale='4.3';record.doubleMajorGpaScale='4';record.doubleMajorCredits='40';assert.deepEqual(profileErrors(profile),{});
  record.doubleMajorCategory=123;assert.ok(profileErrors(normalizeProfile(profile))['educations.a.doubleMajorCategory']);
  const old={id:'old',schoolName:'시험대',gpaScale:'4.5',majorGpa:'4.1',doubleMajor:'복전'};
  const migrated=normalizeProfile({...profile,educations:[old]}).educations[0];assert.equal(migrated.doubleMajorGpa,'');assert.equal(migrated.doubleMajorGpaScale,'');assert.equal(migrated.doubleMajorCredits,'');
  const education=profileSections.find(s=>s.key==='educations');assert.equal(education.fields.some(f=>f.key==='minor'),false);
  assert.deepEqual(education.groups.flatMap(g=>g.fields).sort(),education.fields.map(f=>f.key).sort());
});

test('이전 학교·전공 자료는 한 번만 옮기고 기존 값도 보존한다',()=>{
  const old={...initialState().profile,school:'기존 학교',major:'기존 전공'};
  const next=normalizeProfile(old);
  assert.equal(next.educations[0].schoolName,old.school);
  assert.equal(next.educations[0].major,old.major);
  assert.equal(next.school,old.school);
  assert.deepEqual(normalizeProfile(next),next);
  assert.equal(old.educations,undefined);
  assert.equal(normalizeProfile({...next,educations:[]}).educations.length,0);
});
test('여러 학력·자격증·프로젝트·해외경험을 함께 저장하고 분리 보관한다',()=>{
  const store=openStore(':memory:');
  try{const {data,revision}=store.read('demo');
    data.profile.educations=[{...blankProfileRecord('educations','one'),schoolName:'가상대',gpa:'3.8',gpaScale:'4.5',major:'기획',doubleMajor:'통계',totalCredits:'130',majorCredits:'60'}, {...blankProfileRecord('educations','two'),schoolName:'가상고'}];
    data.profile.certifications=[{...blankProfileRecord('certifications','cert'),name:'시험 자격',acquiredAt:'2025-06-01'}];
    data.profile.projects=[{...blankProfileRecord('projects','project'),name:'시험 프로젝트',url:'https://example.org'}];
    data.profile.overseas=[{...blankProfileRecord('overseas','trip'),name:'시험 교환학생',country:'일본',startMonth:'2024-03',endMonth:'2024-09'}];
    store.write('demo',data,revision);
    assert.deepEqual(store.read('demo').data.profile,data.profile);
    assert.equal(store.read('personal').data.profile.educations.length,0);
  }finally{store.close();}
});
test('평점의 만점 기준 누락·초과와 학점 역전을 거부한다',()=>{
  const p=normalizeProfile(initialState().profile);const school={...blankProfileRecord('educations','a'),schoolName:'가상대',gpa:'4.3'};p.educations=[school];
  assert.ok(profileErrors(p)['educations.a.gpaScale']);school.gpaScale='4';assert.ok(profileErrors(p)['educations.a.gpa']);
  school.gpa='3';school.totalCredits='100';school.majorCredits='120';assert.ok(profileErrors(p)['educations.a.majorCredits']);
});
test('날짜 역전과 실행 코드 링크 및 손상된 상세 자료는 거부한다',()=>{
  const data=initialState();data.profile=normalizeProfile(data.profile);
  data.profile.projects=[{...blankProfileRecord('projects','a'),name:'가상',startMonth:'2025-12',endMonth:'2025-01'}];
  assert.throws(()=>validateState(data),/시점/);data.profile.projects[0].endMonth='';data.profile.projects[0].url='javascript:alert(1)';assert.throws(()=>validateState(data),/http/);
  data.profile.projects=[];data.profile.certifications={};assert.throws(()=>validateState(data),/목록 형식/);
  data.profile.certifications=[{...blankProfileRecord('certifications','c'),name:'시험',acquiredAt:'2025-02-31'}];assert.throws(()=>validateState(data),/날짜/);
});
test('상세 항목이 없는 예전 백업도 읽을 수 있다',()=>{const old=initialState();assert.doesNotThrow(()=>validateState(old));});

test('새 학과계열은 이전 학력에 빈 값으로만 추가하고 저장·확장 전달에 유지한다',()=>{
  const record={...blankProfileRecord('educations','old'),schoolName:'가상대학교',major:'가상전공',startMonth:'2020-03',endMonth:'2024-02'};delete record.departmentCategory;
  const old={...normalizeProfile(initialState().profile),educations:[record]},next=normalizeProfile(old);
  assert.equal(next.educations[0].departmentCategory,'');assert.equal(old.educations[0].departmentCategory,undefined);assert.equal(next.educations[0].major,record.major);assert.deepEqual(normalizeProfile(next),next);
  next.educations[0].departmentCategory='공학계열';assert.deepEqual(profileErrors(next),{});
  const store=openStore(':memory:');try{
    const current=store.read('demo');current.data.profile=next;store.write('demo',current.data,current.revision);
    const saved=store.read('demo').data.profile;assert.equal(saved.educations[0].departmentCategory,'공학계열');
    const fields=extensionProfile(saved).find(s=>s.key==='educations').records[0].fields;
    assert.equal(fields.find(f=>f.key==='departmentCategory').value,'공학계열');assert.equal(fields.find(f=>f.key==='startMonth').value,'2020-03');assert.equal(fields.find(f=>f.key==='endMonth').value,'2024-02');
  }finally{store.close();}
  next.educations[0].departmentCategory=123;assert.ok(profileErrors(normalizeProfile(next))['educations.old.departmentCategory']);
});
