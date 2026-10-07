// Disposable local visual/interaction fixture. Never writes production data.
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openStore} from '../lib/store.mjs';
import {initialState,validateState} from '../lib/domain.mjs';
process.env.PORT='4318';
process.env.MOA_DATA_DIR=mkdtempSync(path.join(tmpdir(),'moa-essay-design-'));
process.env.GEMINI_API_KEY='';
globalThis.fetch=async()=>{throw Error('디자인 시험에서는 외부 AI 요청을 보내지 않습니다.');};
const data=initialState(true);
const stamp=new Date().toISOString();
const draft='저는 사람들이 어려움을 겪는 지점을 관찰하고, 작은 개선으로 연결하는 과정에 관심이 있습니다. 동아리 행사를 준비하며 참여자들이 신청 절차를 이해하기 어려워한다는 의견을 들었습니다. 안내문을 만드는 사람에게 익숙한 설명이 처음 참여하는 사람에게도 명확한 것은 아니라는 점을 알게 되었습니다.\n\n먼저 행사 참여 후 설문을 만들어 의견을 모으고, 응답을 신청 과정과 행사 진행에 관한 내용으로 나누었습니다. 단순히 불편하다는 평가를 모으는 데 그치지 않고, 참여자가 어느 단계에서 망설였는지 확인하려고 했습니다. 저는 설문 설계와 응답 정리를 맡았으며, 정리한 내용을 팀원들과 공유하고 신청 안내를 함께 수정했습니다.\n\n수정한 안내는 다음 행사에 사용했습니다. 만족도의 변화를 수치로 측정하지는 않았기 때문에 개선 효과를 단정할 수는 없습니다. 다만 이용자의 말을 구체적인 행동과 연결해 읽고, 팀이 검토할 수 있는 형태로 정리하는 경험을 쌓았습니다. 이후에는 개선 전후를 비교할 기준도 함께 준비해야겠다고 생각했습니다.\n\n서비스 기획에서도 이 태도를 이어가고 싶습니다. 사용자의 의견을 성급히 해석하기보다 실제 이용 흐름을 살피고, 확인한 사실과 아직 검증하지 못한 가설을 구분하겠습니다. 작은 불편을 함께 논의할 수 있는 문서로 옮기고, 적용한 변화가 도움이 되었는지 다시 확인하는 기획자가 되고 싶습니다.';
data.essays[0].draft=draft;
data.essays[0].versions=[{id:'design-version-1',text:draft,outline:data.essays[0].outline,question:data.essays[0].question,experienceIds:['exp-survey'],createdAt:stamp,source:'시험용 작성본'}];
for(const [id,jobId,question,text] of [
  ['design-motivation','job-onul','지원 동기와 입사 후 이루고 싶은 목표를 소개해 주세요.',''],
  ['design-paper','job-paper','독자를 고려해 콘텐츠를 기획한 경험을 소개해 주세요.','[가상 시험 자료] 전달하고 싶은 내용을 먼저 정리한 뒤, 처음 읽는 사람이 이해할 수 있는 순서로 안내문을 구성했습니다.'],
  ['design-podo','job-podo','협업 과정에서 문제를 해결한 경험을 설명해 주세요.','']
])data.essays.push({id,jobId,question,draft:text,limit:800,includeSpaces:true,experienceIds:[],outline:'',versions:[],updatedAt:stamp});
data.prompts.push({id:'design-prompt',stage:'초안 작성',name:'시험용 초안 지시문',content:'제공한 경험의 사실만 사용해 초안을 작성해 주세요.',createdAt:stamp,version:1,active:true});
validateState(data);
const store=openStore(path.join(process.env.MOA_DATA_DIR,'moa.sqlite'));
const {revision}=store.read('demo');store.write('demo',data,revision);store.close();
console.log('Isolated essay preview: http://127.0.0.1:4318/#essays');
await import('../server.mjs');
