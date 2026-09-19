(() => {
  const VERSION = '2026-09-06-p8-pwa-v3-imagefix';
  const CACHE_NAME = 'az104-pwa-20260906-v3-imagefix';
  const scriptUrl = (document.currentScript && document.currentScript.src) || new URL('pwa-manager.js', document.baseURI).href;
  const ROOT = new URL('./', scriptUrl);
  const stateKey = 'az104-offline-progress-' + VERSION;
  const readyKey = 'az104-offline-ready-' + VERSION;
  const byId = id => document.getElementById(id);
  let downloading = false;

  async function registerSW(){
    if (!('serviceWorker' in navigator)) return;
    try { await navigator.serviceWorker.register(new URL('service-worker.js', ROOT).href, {scope: ROOT.pathname}); await navigator.serviceWorker.ready; }
    catch(e){ console.warn('PWA service worker registration failed', e); }
  }

  async function storageText(){
    if (!navigator.storage || !navigator.storage.estimate) return '';
    try {
      const {usage=0, quota=0} = await navigator.storage.estimate();
      const mb = n => (n/1024/1024).toFixed(0);
      return `현재 사이트 저장공간 ${mb(usage)}MB / 사용 가능 한도 약 ${mb(quota)}MB`;
    } catch(e){ return ''; }
  }

  function setStatus(text, pct){
    const s=byId('offline-status'); if(s) s.textContent=text;
    const bar=byId('offline-progress-bar'); if(bar && typeof pct==='number') bar.style.width=Math.max(0,Math.min(100,pct))+'%';
    const n=byId('offline-progress-num'); if(n && typeof pct==='number') n.textContent=Math.round(pct)+'%';
  }

  async function cacheAll(){
    if (downloading) return;
    downloading=true;
    const btn=byId('offline-download-btn'); if(btn) btn.disabled=true;
    try {
      await registerSW();
      const listRes=await fetch(new URL('offline-assets.json', ROOT).href,{cache:'no-store'});
      const info=await listRes.json();
      const assets=info.assets || [];
      const cache=await caches.open(CACHE_NAME);
      let start=parseInt(localStorage.getItem(stateKey)||'0',10);
      if (!Number.isFinite(start) || start<0 || start>=assets.length) start=0;
      const concurrency=6;
      const batchSize=24;
      let failed=[];
      for(let i=start;i<assets.length;i+=batchSize){
        const batch=assets.slice(i,Math.min(i+batchSize,assets.length));
        for(let j=0;j<batch.length;j+=concurrency){
          const group=batch.slice(j,j+concurrency);
          await Promise.all(group.map(async rel=>{
            const url=new URL(rel.split('/').map(encodeURIComponent).join('/'), ROOT).href;
            try {
              const hit=await cache.match(url,{ignoreSearch:true});
              if(!hit){ const r=await fetch(url,{cache:'reload'}); if(!r.ok) throw new Error(String(r.status)); await cache.put(url,r.clone()); }
            } catch(e){ failed.push(rel); }
          }));
        }
        const done=Math.min(i+batch.length,assets.length);
        localStorage.setItem(stateKey,String(done));
        const pct=done/assets.length*100;
        setStatus(`오프라인 파일 저장 중 · ${done.toLocaleString()} / ${assets.length.toLocaleString()}${failed.length?` · 재시도 ${failed.length}`:''}`,pct);
        await new Promise(r=>setTimeout(r,20));
      }
      if(failed.length){
        const retry=[...new Set(failed)]; failed=[];
        setStatus(`누락 파일 ${retry.length}개 재시도 중`,99);
        for(let i=0;i<retry.length;i+=concurrency){
          await Promise.all(retry.slice(i,i+concurrency).map(async rel=>{
            const url=new URL(rel.split('/').map(encodeURIComponent).join('/'), ROOT).href;
            try { const r=await fetch(url,{cache:'reload'}); if(!r.ok) throw new Error(String(r.status)); await cache.put(url,r.clone()); }
            catch(e){ failed.push(rel); }
          }));
        }
      }
      if(failed.length) throw new Error(`저장 실패 ${failed.length}개`);
      localStorage.removeItem(stateKey);
      localStorage.setItem(readyKey,new Date().toISOString());
      const st=await storageText();
      setStatus(`오프라인 준비 완료 ✓${st?' · '+st:''}`,100);
      if(btn){ btn.textContent='오프라인 데이터 다시 확인'; btn.disabled=false; }
    } catch(e){
      setStatus('저장이 중단됐습니다. 같은 버튼을 다시 누르면 이어서 받습니다. ('+e.message+')');
      if(btn) btn.disabled=false;
    } finally { downloading=false; }
  }

  async function refreshState(){
    const btn=byId('offline-download-btn');
    if(!btn) return;
    const ready=localStorage.getItem(readyKey);
    const st=await storageText();
    if(ready){ setStatus(`오프라인 준비 완료 ✓${st?' · '+st:''}`,100); btn.textContent='오프라인 데이터 다시 확인'; }
    else {
      const idx=parseInt(localStorage.getItem(stateKey)||'0',10);
      if(idx>0) setStatus(`이전에 ${idx.toLocaleString()}개까지 저장했습니다. 버튼을 누르면 이어서 진행합니다.`);
      else setStatus('아이패드에서 한 번만 전체 저장하면 이후 인터넷 없이 CBT와 Lab을 사용할 수 있습니다.');
    }
    btn.addEventListener('click', cacheAll);
  }

  registerSW();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',refreshState); else refreshState();
})();
