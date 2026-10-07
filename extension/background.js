const endpoint='http://127.0.0.1:4317/api/extension/capture';
const fixture='http://127.0.0.1:4317/extension-test.html';
const secureStorage=chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
const cloudServer='https://9row.vercel.app';
// Runs only in the isolated world of the exact, already signed-in app origin.
async function readCloudTab(operation){
  if(location.origin!=='https://9row.vercel.app'||!['status','profile'].includes(operation))return {error:'온라인 사무실 탭을 확인해 주세요.'};
  try{
    const response=await fetch('/api/autofill/'+operation,{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))return {error:'온라인 사무실에서 로그인과 연결 상태를 확인한 뒤 다시 시도해 주세요.'};
    const data=await response.json();
    if(operation==='status'&&(data.version!==3||data.mode!=='cloud-tab'))return {error:'온라인 사무실을 새로고침해 주세요.'};
    if(operation==='profile'&&(data.workspace!=='personal'||!Array.isArray(data.sections)))return {error:'기본 정보 응답을 확인하지 못했어요.'};
    return {data};
  }catch{return {error:'같은 크롬에서 9row.vercel.app에 로그인하고 탭을 열어 두세요.'};}
}
async function cloudApi(operation){
  const tabs=await chrome.tabs.query({url:cloudServer+'/*'});
  const tab=tabs.find(t=>Number.isInteger(t.id)&&t.url&&new URL(t.url).origin===cloudServer);
  if(!tab)throw Error('같은 크롬에서 9row.vercel.app에 로그인하고 탭을 열어 두세요.');
  let result;
  try{[result]=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',func:readCloudTab,args:[operation]});}
  catch{throw Error('온라인 사무실 탭을 새로고침하고 확장의 사이트 접근 권한을 확인해 주세요.');}
  if(!result?.result?.data)throw Error(result?.result?.error||'온라인 사무실 연결을 확인하지 못했어요.');
  return result.result.data;
}
const servers=['http://127.0.0.1:4317','http://127.0.0.1:4318'];
async function api(server,token,route){
  if(!servers.includes(server))throw Error('모아 사무실 주소를 확인해 주세요.');
  if(!/^[a-f0-9]{64}$/.test(token||''))throw Error('모아 설정에서 연결 코드를 복사해 주세요.');
  let response;
  try{response=await fetch(server+route,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(7000),redirect:'error',cache:'no-store'});}catch{throw Error('모아 사무실에 연결할 수 없어요. 먼저 사무실을 실행해 주세요.');}
  let result;try{result=await response.json();}catch{throw Error('모아 서버를 최신 버전으로 다시 실행해 주세요.');}
  if(response.status===401)throw Error(`선택한 ${new URL(server).port} 사무실과 연결 코드가 맞지 않아요. 코드를 복사한 웹 주소의 끝 숫자를 선택하거나, 해당 사무실에서 코드를 다시 복사해 주세요.`);
  if(!response.ok)throw Error(result.error||'연결하지 못했어요.');return result;
}
async function autofill(message){
  await secureStorage;
  if(message.type==='autofill-connect'){
    if(message.server===cloudServer){
      await cloudApi('status');
      await chrome.storage.session.set({autofillConnection:{server:cloudServer,mode:'cloud-tab'}});
      return {ok:true};
    }
    const status=await api(message.server,message.token,'/api/extension/status');
    if(status.version!==2)throw Error('모아 서버를 최신 버전으로 다시 실행해 주세요.');
    await chrome.storage.session.set({autofillConnection:{server:message.server,token:message.token}});
    return {ok:true};
  }
  if(message.type==='autofill-disconnect'){await chrome.storage.session.remove('autofillConnection');return {ok:true};}
  const {autofillConnection:connection}=await chrome.storage.session.get('autofillConnection');
  if(message.type==='autofill-status')return {ok:true,connected:Boolean(connection),server:connection?.server};
  if(!connection)throw Error('먼저 모아와 연결해 주세요.');
  if(message.type==='autofill-profile'){
    if(connection.server===cloudServer){
      if(message.workspace!=='personal')throw Error('온라인에서는 내 기본 정보만 가져올 수 있어요.');
      return {ok:true,...await cloudApi('profile')};
    }
    if(!['personal','demo'].includes(message.workspace))throw Error('사무실을 선택해 주세요.');
    return {ok:true,...await api(connection.server,connection.token,`/api/extension/profile?workspace=${message.workspace}`)};
  }
  throw Error('지원하지 않는 요청입니다.');
}
let chain=Promise.resolve();
async function deliver(event){
  const {token,pending={}}=await chrome.storage.local.get(['token','pending']);
  if(pending[event.eventId]?.status==='confirmed'&&event.status!=='confirmed')event=pending[event.eventId];
  pending[event.eventId]=event;
  await chrome.storage.local.set({pending});
  if(!token)throw Error('연결 코드를 먼저 저장해 주세요. 기록은 대기 중입니다.');
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(event)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'저장하지 못했습니다.');
  delete pending[event.eventId];
  await chrome.storage.local.set({pending,lastResult:'샘플 사무실에 저장했어요.'});
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message.type?.startsWith('autofill-')){
    if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html')||sender.tab)return false;
    autofill(message).then(reply).catch(e=>reply({ok:false,error:e.message}));return true;
  }
  if(message.type==='capture'){
    if(!sender.url?.startsWith(fixture)||new URL(sender.url).pathname!=='/extension-test.html')return;
    const event=message.event;
    if(!event||Object.keys(event).some(k=>!['eventId','company','role','status','appliedAt'].includes(k)))return;
    chain=chain.then(()=>deliver(event)).then(()=>reply({ok:true})).catch(async e=>{await chrome.storage.local.set({lastResult:e.message});reply({ok:false,error:e.message});});
    return true;
  }
  if(message.type==='retry'&&sender.url===chrome.runtime.getURL('popup.html')){
    chain=chain.then(async()=>{const {pending={}}=await chrome.storage.local.get('pending');for(const event of Object.values(pending))await deliver(event);}).then(()=>reply({ok:true})).catch(e=>reply({ok:false,error:e.message}));
    return true;
  }
});
