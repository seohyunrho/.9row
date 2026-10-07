// Isolated UI fixture: separate temporary storage and no external AI requests.
// Run with node tests/ui-fixture.mjs, then visit http://127.0.0.1:4318.
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openStore} from '../lib/store.mjs';
const dir=mkdtempSync(path.join(tmpdir(),'moa-ui-fixture-'));
process.env.PORT='4318';process.env.MOA_DATA_DIR=dir;
process.env.GEMINI_API_KEY='synthetic-ui-test-key-no-real-provider';process.env.GEMINI_MODEL='gemini-ui-fixture';
const store=openStore(path.join(dir,'moa.sqlite'));
const {data,revision}=store.read('demo');
data.essays[0].draft='[화면 검증용 가상 글] 동아리 설문 응답을 정리하고 신청 안내를 개선했습니다. 팀원들과 수정한 안내를 다음 행사에서 사용했습니다.';
data.prompts.push({id:'fixture-prompt',stage:'초안 작성',name:'화면 시험용',content:'선택한 경험으로 가상 초안을 작성해 주세요.',version:1,active:true,createdAt:new Date().toISOString()});
store.write('demo',data,revision);store.close();
globalThis.fetch=async(url,options)=>{
  if(!String(url).startsWith('https://generativelanguage.googleapis.com/'))throw Error('UI fixture blocked unexpected network request');
  const payload=JSON.parse(options.body);const review=payload.systemInstruction.parts[0].text.includes('검토 도우미');
  return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:review?'[화면 검증용 모의 피드백]\n좋은 점: 직접 수행한 행동이 드러납니다.\n보완할 점: 안내를 어떻게 바꿨는지 한 문장을 추가해 보세요.\n확인할 질문: 개선 뒤 변화를 확인했나요?':'[화면 검증용 모의 초안] 설문 응답에서 신청 절차의 어려움을 발견하고, 팀과 함께 안내를 수정했습니다.'}]}}]}));
};
console.log(JSON.stringify({fixture:true,dataDir:dir,port:4318}));
await import('../server.mjs');
