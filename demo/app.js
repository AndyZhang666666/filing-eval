/* Public synthetic fixtures only; no API calls, no telemetry. */
const $ = id => document.getElementById(id);
const labels = { supported:'有据', contradicted:'写错', unsupported:'无据', not_checkable:'无法核验' };
const names = { f05:'数字量级 · 1.2 亿变成 12 亿', f11:'无据归因 · 增长原因从哪里来', f01:'干净对照 · 不该报错的摘要', h05:'主体争议 · 子公司还是公司', h06:'重大遗漏 · 没有错句也不能忽略', e04:'注入边界 · 摘要中的指令不应被执行' };
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let dataset, selected, picked=0, reviews={}, drafts={}, storageAvailable=true;
const key = () => `filing-review-${dataset.version}`;
const current = () => dataset.samples.find(s=>s.id===selected);
const claimKey = () => `${selected}:${picked}`;

function quoteLocation(source, quote) {
  if (!quote?.trim()) return null;
  const index = source.indexOf(quote);
  if (index >= 0) return [index,index+quote.length];
  const positions=[], chars=[];
  [...source].forEach((c,i)=>{if(!/\s/.test(c)){chars.push(c);positions.push(i);}});
  const compact=quote.replace(/\s/g,'');
  const start=chars.join('').indexOf(compact);
  return start>=0 ? [positions[start],positions[start+compact.length-1]+1] : null;
}

function renderClaims() {
  const s=current(), claims=s.judge.claims || [], filter=$('filter').value;
  const shown=claims.map((c,i)=>({c,i})).filter(({c})=>filter==='all'||c.label===filter);
  if (!shown.some(v=>v.i===picked)) picked=shown[0]?.i ?? -1;
  $('claims').innerHTML=shown.length ? shown.map(({c,i})=>`<button class="claim" data-claim="${i}" aria-pressed="${i===picked}"><span class="claim-top"><span class="label ${esc(c.label)}">${esc(labels[c.label]||c.label)}</span><span class="reviewed">${reviews[`${selected}:${i}`]?'已留复核':'待复核'}</span></span>${esc(c.text)}</button>`).join('') : `<p class="empty">${claims.length?'这个筛选下没有断言，切回“全部断言”继续。':`历史记录状态：${esc(s.judge.status)}。${esc(s.judge.reason||'没有可展示的核验结果。')}`}</p>`;
  $('claims').querySelectorAll('[data-claim]').forEach(b=>b.addEventListener('click',()=>{picked=Number(b.dataset.claim);renderClaims();renderEvidence();}));
}

function renderEvidence() {
  const s=current(), c=s.judge.claims?.[picked];
  const loc=c&&quoteLocation(s.source,c.source_quote);
  $('source').innerHTML=loc ? `${esc(s.source.slice(0,loc[0]))}<mark>${esc(s.source.slice(...loc))}</mark>${esc(s.source.slice(loc[1]))}` : esc(s.source||'此边界样本未提供原文。');
  $('quote-state').textContent=!c?'选择其他断言或样本后继续核验。':loc?'已在给定原文定位引句；定位成功本身不代表推理成立。':c.source_quote?'引句未能逐字定位。请核对全文，不能将模型引文直接当证据。':'没有直接引句；“无据”表示给定原文未支持，不等于外部世界必然为假。';
  $('reason').innerHTML=c?`<p><strong>历史裁判判断：${esc(labels[c.label]||c.label)}</strong></p><p>${esc(c.reason)}</p>${c.source_quote?`<p class="meta">模型引用：${esc(c.source_quote)}</p>`:''}${s.disputed?'<p class="meta">该样本原标注与裁判存在分歧，已从检出率分母排除。请先明确“合并口径”和“披露主体”的适用范围，再裁决。</p>':''}`:'';
  const r=drafts[claimKey()]||reviews[claimKey()];
  $('review-state').value=r?.decision||'agree'; $('review-note').value=r?.note||'';
  $('review-feedback').textContent=drafts[claimKey()]?'未保存的草稿仍保留在当前会话，点“保存本地复核”才能跨刷新保留。':r?`本机已保存 · ${new Date(r.at).toLocaleString()}`:'';
  $('review-form').querySelector('button').disabled=!c;
}

function renderCase() {
  const s=current(); picked=0; $('filter').value='all';
  history.replaceState(null,'',`#${s.id}`);
  $('summary').textContent=s.summary||'此边界样本摘要为空。';
  $('case-note').textContent=s.note||s.tags.join(' / ');
  const claims=s.judge.claims||[];
  const counts=Object.fromEntries(Object.keys(labels).map(l=>[l,claims.filter(c=>c.label===l).length]));
  $('case-facts').innerHTML=Object.entries(counts).map(([l,n])=>`<div><strong>${n}</strong><span>${labels[l]}</span></div>`).join('');
  $('coverage').innerHTML=(s.judge.key_facts||[]).map(f=>`<div class="coverage-row"><span class="label ${f.covered?'supported':'unsupported'}">${f.covered?'已覆盖':'待补充'} · ${esc(f.importance)}</span><div>${esc(f.text)}<p class="meta">${esc(f.note)}</p></div></div>`).join('')||'<p class="empty">此记录没有关键事实覆盖结果，不能据此判断信息完整。</p>';
  renderClaims(); renderEvidence(); updateStatus();
}

function updateStatus(message='') {
  $('status').textContent=message||`${current().id} · ${dataset.provenance.model} / ${dataset.provenance.prompt} · 原始标签未完成独立人工复核。${Object.keys(reviews).length} 条本地复核${storageAvailable?'，不上传。':'，当前无法持久保存，请及时导出。'}`;
}

function renderReport() {
  const rows=(s)=>`<table class="report-table"><tbody><tr><th>构造样本数</th><td>${s.items}</td></tr><tr><th>错误检出（仅当前构造集）</th><td>${esc(s.detection)}</td></tr><tr><th>干净样本误报</th><td>${esc(s.false_positive)}</td></tr><tr><th>争议样本</th><td>${esc(s.disputed_ids.join(', ')||'无')}</td></tr></tbody></table>`;
  $('report').innerHTML=`<div class="report-grid"><section class="panel"><h2>主集 · 回归基线</h2>${rows(dataset.summaries.main)}</section><section class="panel"><h2>困难集 · 不并入主集</h2>${rows(dataset.summaries.hard)}</section></div><section class="panel"><h2>哪些结论现在还不能下</h2><ul><li>全部公告为模拟材料；上述成绩不是对真实上市公司公告的生产准确率。</li><li>仅一位历史裁判模型；预期标签没有完成独立人工逐条复核。</li><li>固定温度下结果稳定，不代表判断正确；引文能定位也不代表支持断言。</li><li>主体争议 h05 保留，不改标签迁就裁判；遗漏 h06 单独通过覆盖情况检查。</li><li>本机复核不改原始金标或历史统计。当前没有新跑模型，也没有新增已验证效果。</li></ul><h3>下一轮该怎么验证</h3><p>先独立复核标注，再冻结规则，用未参与调参的样本测试。仓库新增了单独的候选留出集，仅供后续复核，尚未调用模型、不得计入成绩。</p><a href="https://github.com/AndyZhang666666/filing-eval/tree/main/results">原始历史结果</a> · <a href="https://github.com/AndyZhang666666/filing-eval/blob/main/docs/REVIEW_PROTOCOL.md">复核协议与候选留出集</a></section>`;
}

$('filter').addEventListener('change',()=>{renderClaims();renderEvidence();});
$('sample').addEventListener('change',()=>{selected=$('sample').value;renderCase();});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('[data-view]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));
  $('desk').hidden=b.dataset.view!=='desk'; $('report').hidden=b.dataset.view!=='report';
}));
$('review-form').addEventListener('submit',e=>{
  e.preventDefault(); const note=$('review-note').value.trim(), decision=$('review-state').value;
  if (decision!=='agree'&&!note){$('review-feedback').textContent='请写明不同意或保留争议的依据，避免只留一个标签。';$('review-note').focus();return;}
  reviews[claimKey()]={ sampleId:selected, claimIndex:picked, decision, note, at:new Date().toISOString() };
  delete drafts[claimKey()];
  try{localStorage.setItem(key(),JSON.stringify(reviews));}catch{storageAvailable=false;}
  renderClaims(); renderEvidence(); updateStatus();
});
$('export').addEventListener('click',()=>{
  const contents={ exportedAt:new Date().toISOString(), datasetVersion:dataset.version, provenance:dataset.provenance,
    notice:'本地访客复核；不是独立人工金标、不是新的模型成绩。',
    reviews:Object.values(reviews).map(r=>({...r,originalClaim:dataset.samples.find(s=>s.id===r.sampleId)?.judge.claims?.[r.claimIndex]})) };
  const url=URL.createObjectURL(new Blob([JSON.stringify(contents,null,2)],{type:'application/json'}));
  const a=document.createElement('a'); a.href=url; a.download='filing-review.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  updateStatus(reviews&&Object.keys(reviews).length?'已导出本地复核及对应历史断言。':'已导出空复核记录；请先选断言保存复核，文件不会伪造已完成审核。');
});
for(const id of ['review-state','review-note']) $(id).addEventListener('input',()=>{
  if(picked<0)return;
  drafts[claimKey()]={decision:$('review-state').value,note:$('review-note').value};
  $('review-feedback').textContent='复核草稿未保存；切换断言仍保留，刷新前请保存。';
});

async function init(){
  try{
    const response=await fetch('./data.json'); if(!response.ok)throw new Error('读取失败'); dataset=await response.json();
    try{const saved=JSON.parse(localStorage.getItem(key())||'{}'); if(saved&&typeof saved==='object'&&!Array.isArray(saved)) reviews=Object.fromEntries(Object.entries(saved).filter(([,r])=>r&&['agree','disagree','needs-review'].includes(r.decision)&&typeof r.note==='string'&&dataset.samples.some(s=>s.id===r.sampleId&&s.judge.claims?.[r.claimIndex])));}catch{storageAvailable=false;}
    const order=['f05','f11','f01','h05','h06','e04'];
    const sorted=[...dataset.samples].sort((a,b)=>(order.includes(a.id)?order.indexOf(a.id):99)-(order.includes(b.id)?order.indexOf(b.id):99));
    $('sample').innerHTML=sorted.map(s=>`<option value="${s.id}">${esc(names[s.id]||`${s.id} · ${s.note||s.tags.join(' / ')}`)}</option>`).join('');
    const initial=location.hash.slice(1); selected=dataset.samples.some(s=>s.id===initial)?initial:'f05'; $('sample').value=selected;
    $('desk').hidden=false; $('export').disabled=false; renderCase(); renderReport();
  }catch{updateLoadError();}
}
function updateLoadError(){ $('status').innerHTML='历史数据未能读取，未丢失本地复核。<button id="retry">重试读取</button> 或<a href="https://github.com/AndyZhang666666/filing-eval/tree/main/results">查看仓库结果</a>。'; $('retry').addEventListener('click',init); }
init();
