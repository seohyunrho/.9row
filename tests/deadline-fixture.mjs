// Isolated schedule preview. No production database or external AI requests.
// Run: node tests/deadline-fixture.mjs; open http://127.0.0.1:4318/#home.
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openStore} from '../lib/store.mjs';
import {initialState,today,validateState} from '../lib/domain.mjs';
import {deadlineNotices} from '../lib/deadline-notices.mjs';

const dir=mkdtempSync(path.join(tmpdir(),'moa-deadline-preview-'));
process.env.PORT='4318';process.env.MOA_DATA_DIR=dir;
process.env.GEMINI_API_KEY='';process.env.GEMINI_MODEL='disabled-deadline-preview';
globalThis.fetch=async()=>{throw new Error('일정 시험 화면에서는 외부 연결을 사용하지 않습니다.');};
const now=new Date().toISOString();
const dateAfter=days=>{
  const date=new Date(`${today()}T12:00:00+09:00`);date.setUTCDate(date.getUTCDate()+days);
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(date);
};
const data=initialState(false);
data.jobs=[
  ['preview-onbit','온빛랩 (시험)','서비스 기획',1],
  ['preview-morae','모래스튜디오 (시험)','콘텐츠 마케팅',3],
  ['preview-blue','푸른로그 (시험)','데이터 분석',2],
  ['preview-next','다음상자 (시험)','프로덕트 운영',7],
].map(([id,company,role,days])=>({id,company,role,deadline:dateAfter(days),type:'신입',url:'',body:'[일정 화면 시험용 가상 공고]\n실제 회사나 채용 정보가 아닙니다. 마감 알림 디자인을 확인하기 위한 예시입니다.',requirements:'문제 해결\n협업',stage:'saved',color:'green',createdAt:now}));
const essay=(id,jobId,question,draft)=>({id,jobId,question,draft,outline:'',limit:800,includeSpaces:true,experienceIds:[],versions:[],updatedAt:now});
data.essays=[
  essay('preview-essay-morae-1','preview-morae','협업 경험을 소개해 주세요.','[시험용 본문] 팀 프로젝트에서 자료를 정리하고 역할을 나누었습니다.'),
  essay('preview-essay-morae-2','preview-morae','지원 동기를 소개해 주세요.',''),
  essay('preview-essay-blue','preview-blue','문제를 해결한 경험을 소개해 주세요.','[시험용 본문] 가상 조사 결과를 분류해 개선할 부분을 정리했습니다.'),
];
validateState(data);
const store=openStore(path.join(dir,'moa.sqlite'));
const {revision}=store.read('demo');store.write('demo',data,revision);store.close();
console.log(JSON.stringify({preview:true,port:4318,dataDir:dir,scenarios:deadlineNotices(data,today()).map(n=>({company:n.job.company,days:n.days,status:n.status,urgent:n.urgent}))}));
await import('../server.mjs');
