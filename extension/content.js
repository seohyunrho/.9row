// Only this versioned local fixture is supported. Never read forms or document.body text.
if (location.origin === 'http://127.0.0.1:4317' && location.pathname === '/extension-test.html') {
  const status = document.getElementById('application-status');
  let lastSignature = '';
  const capture = () => {
    const current = status?.dataset.state;
    if (!['confirmed', 'failed', 'unknown'].includes(current)) return;
    const event = {
      eventId: document.getElementById('event-id').textContent.trim(),
      company: document.querySelector('[data-moa-company]').textContent.trim(),
      role: document.querySelector('[data-moa-role]').textContent.trim(),
      status: current,
      appliedAt: current === 'confirmed' ? status.dataset.appliedAt : '',
    };
    const signature=JSON.stringify(event);
    if(signature===lastSignature)return;
    lastSignature=signature;
    chrome.runtime.sendMessage({type:'capture',event}).catch(()=>{});
  };
  if (status) { new MutationObserver(capture).observe(status,{attributes:true,attributeFilter:['data-state','data-applied-at']}); capture(); }
}
