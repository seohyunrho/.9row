// Local visual harness only. Does not run in the packaged extension or read real profiles.
if(parent===window||parent.location.pathname!=='/autofill-test.html')throw Error('모아 시험 페이지에서 열어 주세요.');
document.querySelector('.eyebrow').textContent='설치 전 화면 미리보기 · 가상 자료';
let connected=true;
globalThis.chrome={
  runtime:{sendMessage:async m=>{
    if(m.type==='autofill-status')return {ok:true,connected,server:location.origin};
    if(m.type==='autofill-profile')return {ok:true,workspace:'demo',sections:parent.moaFixture.sections};
    if(m.type==='autofill-connect'){connected=true;return {ok:true};}
    if(m.type==='autofill-disconnect'){connected=false;return {ok:true};}
    return {ok:false,error:'이 버튼은 Chrome 설치 후 사용할 수 있어요.'};
  }},
  tabs:{query:async()=>[{id:1,url:parent.location.href}]},
  scripting:{executeScript:async({args})=>[{result:await parent.moaFixture.agent(...args)}]},
  storage:{session:{get:async()=>({})}}
};
document.getElementById('workspace').replaceChildren(new Option('미리보기 전용 가상 자료','demo'));
