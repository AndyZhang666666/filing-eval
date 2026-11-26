// Only public presentation preferences are shared between the portfolio and its tools.
(() => {
  const root = document.documentElement;
  const slot = document.querySelector('[data-demo-card]');
  if (!slot || slot.dataset.ready) return;
  slot.dataset.ready = 'true';
  const params = new URLSearchParams(location.search);
  const paletteNames = ['frost', 'copper', 'mist', 'indigo'];
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const save = (key,value) => { try { localStorage.setItem(key,value); } catch {} };
  const validLanguage = value => ['zh','en'].includes(value);
  const lang = () => root.lang.startsWith('en') ? 'en' : 'zh';
  const back = slot.querySelector('a'), toggle = slot.querySelector('button');
  const reason = slot.querySelector('output');
  let latest = [slot.dataset.guideZh,slot.dataset.guideEn];
  function draw() {
    const english = lang() === 'en';
    back.textContent = english ? '← Back to project' : '← 返回作品卡';
    const localPortfolio = ['127.0.0.1','localhost','[::1]'].includes(location.hostname);
    const standalone = location.protocol==='file:' || location.pathname==='/' || location.pathname.startsWith('/demo/');
    const portfolioOrigin = (localPortfolio && !standalone) || location.hostname === 'andyzhang666666.github.io' ? location.origin : 'https://andyzhang666666.github.io';
    const url = new URL('/works/',portfolioOrigin==='null'?'https://andyzhang666666.github.io':portfolioOrigin);
    url.hash = 'project-' + slot.dataset.demoCard;
    url.searchParams.set('lang',lang());
    url.searchParams.set('palette',root.dataset.palette);
    back.href = url.href;
    toggle.textContent = english ? '中文' : 'EN';
    toggle.setAttribute('aria-label',english?'使用中文':'Switch to English');
    reason.textContent = latest[english ? 1 : 0];
  }
  function preferences(language,palette) {
    root.lang = validLanguage(language) && language === 'en' ? 'en' : 'zh-CN';
    root.dataset.palette = paletteNames.includes(palette) ? palette : 'frost';
    draw();
    document.dispatchEvent(new Event('demo-language'));
  }
  const referrer = (() => {
    try {const ref = new URL(document.referrer);return ref.origin===location.origin&&['/','/works/'].includes(ref.pathname)?ref.searchParams:new URLSearchParams();}
    catch {return new URLSearchParams();}
  })();
  function refresh(){
    preferences(validLanguage(params.get('lang'))?params.get('lang'):(read('portfolio-language')||referrer.get('lang')),
      paletteNames.includes(params.get('palette'))?params.get('palette'):(read('palette')||referrer.get('palette')));
  }
  toggle.addEventListener('click',() => {
    const next = lang()==='en'?'zh':'en';
    save('portfolio-language',next);
    const url = new URL(location.href);
    url.searchParams.set('lang',next); params.set('lang',next);
    if(location.protocol!=='file:')history.replaceState(history.state,'',url);preferences(next,root.dataset.palette);
  });
  addEventListener('storage',event=>{
    if(event.key==='portfolio-language'||event.key==='palette'||event.key===null){
      if(event.key==='portfolio-language')params.delete('lang');
      if(event.key==='palette')params.delete('palette');
      refresh();
    }
  });
  addEventListener('pageshow',refresh);
  document.addEventListener('demo-insight',event=>{
    const detail=event.detail;
    if(detail===null){latest=[slot.dataset.guideZh,slot.dataset.guideEn];draw();return;}
    if(Array.isArray(detail)&&detail.length===2&&detail.every(v=>typeof v==='string')){
      latest=detail;draw();
    }
  });
  refresh();
  document.dispatchEvent(new Event('demo-shell-ready'));
})();
