'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={file:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h6',help:'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',briefcase:'M3 7h18v13H3z M8 7V4h8v3 M3 12c5 3 13 3 18 0 M10 13h4',grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',shield:'M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6z M8 12l3 3 5-6',target:'M21 12a9 9 0 1 1-9-9 M18 12a6 6 0 1 1-6-6 M12 12l9-9 M16 3h5v5',chart:'M4 20h17 M7 16v-5 M12 16V4 M17 16V8',match:'M8 4H4v4 M16 4h4v4 M4 16v4h4 M20 16v4h-4 M8 12l3 3 5-6',chat:'M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z M7 8h10 M7 12h7',edit:'m16 3 5 5-12 12-6 1 1-6z M13 6l5 5',download:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',arrow:'M4 12h16 M14 6l6 6-6 6',back:'M20 12H4 M10 6l-6 6 6 6',spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',upload:'M12 16V4 M7 9l5-5 5 5 M4 16v5h16v-5',check:'m5 12 4 4L19 6',bulb:'M9 18h6 M9 21h6 M8 14a7 7 0 1 1 8 0l-1 2H9z',lock:'M6 10h12v11H6z M8 10V7a4 4 0 0 1 8 0v3',info:'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',copy:'M9 9h12v12H9z M15 5V3H3v12h2',refresh:'M20 7V3l-4 4 M20 7a9 9 0 1 0 1 9'};
paths.image='M4 3h16v18H4z M8 8h.01 M4 17l5-5 4 4 3-3 4 4';
paths.settings='M5 7h14M5 17h14M9 4v6M15 14v6';
paths.attach='m8 13 6-6a2.5 2.5 0 0 1 3.5 3.5l-8 8a4 4 0 0 1-5.7-5.7l8-8';
const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.file}"/></svg>`;
const steps=[['会话','chat'],['JD 解析','target'],['简历诊断','chart'],['匹配分析','match'],['经历追问','chat'],['简历优化','edit'],['最终简历','file'],['面试准备','briefcase']];
const state={step:0,input:{role:'',industry:'',company:'',stage:'',focus:'',jd:'',resume:'',extra:'',projects:'',skills:'',results:'',boundaries:'',length:'不限制'},result:null,chatResume:null,appearance:ResumeFormat.appearanceFor(),layout:'',resultModel:'',status:null,answers:[],bullets:[],style:'original',error:'',exporting:false,busy:false,busyType:'',controller:null,importBusy:false,editing:false,manualResume:null,completed:new Set()};
let toastTimer;
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4200);}
function hydrateIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});}
function heading(title, sub = '', action = '') {
  return `<div class="page-heading"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${action}</div>`;
}
function hasResume() {
  return Boolean(state.result?.resume || state.chatResume);
}
function renderNav() {
  document.body.classList.toggle('chat-page', state.step === 0);
  document.body.classList.toggle('resume-only', !state.result);
  $('chatTitle').textContent = ResumeChat.title();
  $('stepNav').innerHTML = steps.map(([name], n) => {
    if (!state.result && n !== 0 && n !== 6) return '';
    return `<button class="step-item ${n === state.step ? 'active' : ''}" data-step="${n}" ${n === state.step ? 'aria-current="step"' : ''}>
      <span>${name}</span><span class="step-num" aria-hidden="true">${state.completed.has(n) ? '✓' : String(n+1).padStart(2,'0')}</span>
    </button>`;
  }).join('');
  $('flowCount').textContent = `${state.completed.size} / 8`;
  $('flowBar').style.width = `${state.completed.size/8*100}%`;
  $('stepNav').querySelectorAll('[data-step]').forEach(el => el.onclick = () => go(Number(el.dataset.step)));
}
function go(step) {
  if (state.busy || state.importBusy) { toast('正在处理，请等待完成或先取消。'); return; }
  if (step !== 0 && !state.result && !(step === 6 && hasResume())) step = 0;
  if (state.editing) saveResumeEdits();
  state.step = step;
  state.error = '';
  if (state.result && (step !== 4 || state.bullets.length)) state.completed.add(step);
  render();
  window.scrollTo({top:0,behavior:'instant'});
  $('stepNav').querySelector('.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
}
function invalidate({preserveDraft = false} = {}) {
  if (!hasResume()) return;
  const draft = preserveDraft ? finalResume() : null;
  state.result = null;
  state.chatResume = draft;
  state.answers = [];
  state.bullets = [];
  state.manualResume = null;
  if (!preserveDraft) state.layout = '';
  state.style = 'original';
  state.completed = new Set();
  document.querySelector('.chat-result-actions')?.remove();
  renderNav();
}
function strategyView(){const r=state.result.strategy;return `<section class="strategy-section" aria-label="简历优化策略"><div class="table-title inline-section-title"><h2>简历优化策略</h2></div><div class="result-grid">${resultCard('职业定位',`<p>${esc(r.positioning)}</p>`)}${resultCard('前置哪些经历',list(r.prioritize))}${resultCard('弱化或删除',list(r.reduce))}${resultCard('自然嵌入的关键词',list(r.keywords))}${resultCard('重点代表项目',list(r.representativeProjects))}${resultCard('整体表达风格',`<p>${esc(r.style)}</p>`)}</div></section>`;}
function strengtheningView(){const r=state.result.strengthening;return `<section class="strengthening-section" aria-label="进一步补强建议"><div class="table-title inline-section-title"><h2>进一步补强建议</h2></div><div class="result-grid">${resultCard('建议补充的项目',list(r.projects))}${resultCard('是否需要作品集',`<p>${esc(r.portfolioNeeded)}</p>`)}${resultCard('作品集内容',list(r.portfolioContents))}${resultCard('可以生成的简历版本',list(r.versions))}${resultCard('针对不同岗位的版本策略',`<p>${esc(r.tailoring)}</p>`)}</div></section>`;}
function analysisSource() {
  return `<p class="analysis-source">由 ${esc(state.resultModel || '当前模型')} 生成。分数仅供参考。</p>`;
}

const list=arr=>`<ul class="clean-list">${arr.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
function resultCard(title,content,cls=''){return `<section class="card result-card ${cls}"><h2>${title}</h2>${content}</section>`;}
function footer(nextText=steps[state.step+1]?.[0]){return `<div class="page-bottom"><button class="button" data-go="${Math.max(0,state.step-1)}">${icon('back')}上一步</button>${state.step<7?`<button class="button primary" data-go="${state.step+1}">${nextText}${icon('arrow')}</button>`:`<button class="button primary" data-go="6">查看并导出简历${icon('download')}</button>`}</div>`;}
function jdView(){const r=state.result.jd;const rows=[['岗位核心职责',list(r.responsibilities)],['岗位硬性要求',list(r.hard)],['岗位隐性要求',list(r.implicit)],['高频关键词',`<div class="tags">${r.keywords.map(k=>`<span class="badge">${esc(k)}</span>`).join('')}</div>`],['招聘方真正想找的人',esc(r.ideal)]];return `${heading('JD 解析')}<section class="card table-card"><div class="table-title"><h2>JD 解析表</h2></div><div class="table-scroll"><table class="jd-summary-table"><thead><tr><th style="width:23%">解析维度</th><th>岗位期待</th></tr></thead><tbody>${rows.map(([name,body])=>`<tr><td>${name}</td><td>${body}</td></tr>`).join('')}</tbody></table></div></section><section class="card table-card"><div class="table-title"><h2>岗位最看重的 5 项能力</h2></div><div class="table-scroll"><table><thead><tr><th>核心能力</th><th style="width:18%">重要程度</th><th>期待看到的证据</th></tr></thead><tbody>${r.competencies.map(c=>`<tr><td>${esc(c.name)}</td><td><span class="badge neutral">${esc(c.weight)}</span></td><td>${esc(c.evidence)}</td></tr>`).join('')}</tbody></table></div></section>${footer()}`;}

function diagnosisView() {
  const { score, summary, dimensions, issues } = state.result.diagnosis;
  return `${heading('简历诊断')}
    <section class="card diagnosis-summary">
      <h2>匹配结论</h2>
      <p>${esc(summary)}</p>
    </section>
    <section class="card issues">
      <div class="table-title"><h2>优先修改</h2></div>
      ${issues.map((issue, index) => `<div class="issue">
        <span class="issue-number">${index + 1}</span>
        <div><h3>${esc(issue.title)}</h3><p>${esc(issue.detail)}</p></div>
        <div class="issue-suggestion"><small>怎么改</small><p>${esc(issue.suggestion)}</p></div>
      </div>`).join('')}
    </section>
    <details class="card diagnosis-scores">
      <summary><span>查看评分明细</span><span>匹配度 ${Math.round(score)} / 100</span></summary>
      <div class="dimensions">
        ${dimensions.map(dimension => `<div class="dimension">
          <h3>${esc(dimension.name)} <span>${Math.round(dimension.score)} / 100</span></h3>
          <p>${esc(dimension.explanation)}</p>
        </div>`).join('')}
        ${analysisSource()}
      </div>
    </details>${footer()}`;
}
function matchView(){const r=state.result.matches;return `${heading('匹配分析','查看哪些岗位要求已有经历支撑，哪些需要补充。')}<section class="card table-card"><div class="table-title"><h2>JD 要求 × 简历证据</h2><div class="tags"><span class="badge strong">${r.filter(x=>x.strength==='强').length} 项证据充分</span><span class="badge">${r.filter(x=>x.supplement==='是').length} 项建议补充</span></div></div><div class="table-scroll"><table><thead><tr><th style="width:20%">JD 要求</th><th style="width:27%">简历证据</th><th style="width:12%">证据强度</th><th style="width:12%">是否补充</th><th>优化建议</th></tr></thead><tbody>${r.map(x=>`<tr><td>${esc(x.requirement)}</td><td>${esc(x.evidence)}</td><td><span class="badge ${x.strength === '强' ? 'strong' : ''}">${esc(x.strength)}</span></td><td>${esc(x.supplement)}</td><td>${esc(x.suggestion)}</td></tr>`).join('')}</tbody></table></div></section>${footer()}`;}
function questionView(){const r=state.result.questions,count=state.answers.filter(x=>x?.trim()).length;return `${heading('经历追问','说明你做了什么、交付了什么。未核实的数据可以留空。',`<button class="heading-action" id="generateBullets">${state.bullets.length?'重新生成表达':'生成简历表达'}</button>`)}<div class="question-top"><span id="answerCount">已回答 ${count} / ${r.length}</span><div class="progress-track"><div id="answerBar" style="width:${count/r.length*100}%"></div></div><span>至少回答 1 个问题即可生成</span></div>${state.error?`<div class="error-box" role="alert">${esc(state.error)}</div>`:''}<div class="question-list">${r.map((q,i)=>`<section class="card question-card"><div class="question-head"><span>${String(i+1).padStart(2,'0')}</span><div><h3><label for="answer-${i}">${esc(q.title)}</label></h3><p>${esc(q.context)}</p></div></div><textarea id="answer-${i}" data-answer="${i}" placeholder="${esc(q.hint)}" maxlength="3000">${esc(state.answers[i]||'')}</textarea>${state.bullets.find(b=>b.index===i)?`<div class="bullet-result"><strong>可用于简历的表达</strong><br>${resumeMarkup(state.bullets.find(b=>b.index===i).text,true)}</div>`:''}</section>`).join('')}</div>${state.bullets.length?`<div class="notice" style="margin-top:18px">${icon('check')}已生成 ${state.bullets.length} 条表达，并同步到最终简历。请核对事实和个人职责边界。</div>`:''}${footer('查看简历优化')}`;}
const styleNames={original:'原始优化版',concise:'更简洁',careful:'降低夸张',ai:'AI 产品证据',saas:'ToB SaaS 证据'};
const evidenceTerms={
  ai:/\b(?:AI|LLM|RAG|Dify|Prompt|Agent)\b|大模型|知识库|问答原型|模型评估|提示词/gi,
  saas:/\b(?:ERP|WMS|SaaS|ToB)\b|企业服务|采购|仓储|审批|交付|验收|业务流程/gi
};
function styled(text) {
  if (state.style === 'concise') {
    return text
      .replace(/围绕 ([^\n，。]+) 业务需求开展需求收集/g, '收集 $1 业务需求')
      .replace(/(?:开展|进行)需求收集/g, '收集需求')
      .replace(/负责(?:进行|开展)/g, '负责');
  }
  if (state.style === 'careful') {
    return text.replace(/(^|[\n，。；、：]\s*|•\s*)(?:显著|大幅)(?=提升|改善|降低|缩短|增长)/g, '$1');
  }
  return text;
}
function orderedRewrites(rewrites) {
  const terms = evidenceTerms[state.style];
  if (!terms) return rewrites;
  return rewrites.map(rewrite => ({ rewrite, matches: new Set(rewrite.after.toLowerCase().match(terms) || []).size }))
    .sort((a, b) => b.matches - a.matches)
    .map(({ rewrite }) => rewrite);
}
function styleDescription() {
  if (evidenceTerms[state.style]) return '按对照表中的相关词语排序。需要调整简历顺序时，可编辑最终简历。';
  if (state.manualResume) return '此处预览表达。已手动编辑的内容请在最终简历中核对。';
  return '规则预览，表达调整会同步到最终简历。';
}
function rewriteView(){return `${heading('简历优化','对照原文核对修改、原因和待确认事项。')}${strategyView()}<div class="table-title inline-section-title"><h2>修改前后对照表</h2></div><div class="style-toolbar"><div class="style-options" role="group" aria-label="模拟表达风格">${Object.entries(styleNames).map(([k,v])=>`<button data-style="${k}" class="${state.style===k?'active':''}" aria-pressed="${state.style===k}">${v}</button>`).join('')}</div><span>${styleDescription()}</span></div><section class="card table-card"><div class="table-scroll"><table><thead><tr><th style="width:22%">修改前</th><th style="width:33%">修改后</th><th style="width:23%">修改理由</th><th>风险提示</th></tr></thead><tbody>${orderedRewrites(state.result.rewrites).map(x=>`<tr><td class="rewrite-before">${esc(x.before)}</td><td class="rewrite-after">${resumeMarkup(styled(x.after),true)}</td><td>${esc(x.reason)}</td><td>${esc(x.risk)}</td></tr>`).join('')}${state.bullets.map(b=>`<tr><td>${esc(state.answers[b.index])}</td><td class="rewrite-after">${resumeMarkup(b.text,true)}</td><td>根据本人追问回答整理，保留实际行动与可核实结果。</td><td>请核实数据口径及本人职责边界。</td></tr>`).join('')}</tbody></table></div></section>${!state.bullets.length?`<div class="notice" style="margin-top:18px">${icon('chat')}还可以通过经历追问，补充简历里遗漏的具体证据。<button class="text-button" data-go="4">去回答追问 →</button></div>`:''}${footer('查看最终简历')}`;}
const {sections:resumeSections, entryParts:resumeEntryParts, entryName:resumeEntryName, lineSpans:resumeLineSpans, supplementTitle} = ResumeFormat;
const resumeMarks = {pending:'resume-evidence-pending', example:'resume-fill-example', result:'resume-key-result'};
const draftStorageKey = 'resume-expert.draft.v1';
const draftFields = ['name','contact',...resumeSections.map(([field]) => field)];
let draftStorageIssue = '';

function resumeMarkup(text, highlightResults = false) {
  return String(text ?? '').split(/\r?\n/).map(line => resumeLineSpans(line,highlightResults)
    .map(({text,tone}) => tone ? `<mark class="${resumeMarks[tone]}">${esc(text)}</mark>` : esc(text)).join('')).join('\n');
}

function resumeEntryMarkup(entry, field) {
  const name = resumeEntryName(entry,field);
  if (!name) return resumeMarkup(entry,true);
  return `<strong class="resume-entry-name">${resumeMarkup(name,true)}</strong>${resumeMarkup(entry.slice(name.length),true)}`;
}

function finalResume(includeBullets = true) {
  const resume = { ...(state.manualResume || state.result?.resume || state.chatResume) };
  if (!state.manualResume) {
    for (const section of ['summary', 'experience', 'projects']) resume[section] = styled(resume[section]);
  }
  if (includeBullets && state.bullets.length) {
    resume.projects += `\n\n${supplementTitle}\n${state.bullets.map(b => '• ' + b.text).join('\n')}`;
  }
  return resume;
}
function resumeMaterials(includeBullets = true) {
  const currentResume = hasResume() ? finalResume(includeBullets) : null;
  return {input:currentResume ? {...state.input,resume:''} : state.input,currentResume};
}
function persistResumeDraft() {
  const current = finalResume();
  const resume = Object.fromEntries(draftFields.map(field => [field,current[field] ?? '']));
  try {
    if (Object.values(resume).some(value => value.trim())) {
      localStorage.setItem(draftStorageKey,JSON.stringify({version:1,resume,layout:state.layout || 'classic',appearance:state.appearance}));
    } else localStorage.removeItem(draftStorageKey);
    draftStorageIssue = '';
    return true;
  } catch {
    draftStorageIssue = '浏览器无法自动保存简历，修改已保留在当前页面。';
    toast(draftStorageIssue);
    return false;
  }
}
function restoreResumeDraft() {
  try {
    const raw = localStorage.getItem(draftStorageKey);
    if (raw === null) return false;
    const record = JSON.parse(raw);
    if (record?.version !== 1 || !record.resume || !Object.hasOwn(ResumeFormat.layouts,record.layout)
        || !draftFields.every(field => typeof record.resume[field] === 'string')
        || !draftFields.some(field => record.resume[field].trim())) throw new Error('draft');
    state.chatResume = Object.fromEntries(draftFields.map(field => [field,record.resume[field]]));
    state.layout = record.layout;
    try { state.appearance = ResumeFormat.appearanceFor(record.appearance); } catch { state.appearance = ResumeFormat.appearanceFor(); }
    ResumeChat.restoreDraft();
    return true;
  } catch {
    draftStorageIssue = '无法读取浏览器中的已保存简历。';
    return false;
  }
}
function resumePaper(block = (_key, content) => content) {
  const layout = state.layout ? ' resume-' + esc(state.layout) : '';
  if (state.editing) {
    const draft = finalResume(false);
    const fields = [['contact','个人信息 / 联系方式'],...ResumeFormat.orderedSections(state.appearance)];
    return `<article class="resume-paper${layout} resume-edit">
      <label class="field-label" for="edit-name">姓名</label>
      <input class="input" id="edit-name" data-resume="name" maxlength="100" value="${esc(draft.name)}">
      ${fields.map(([key,label]) => `<label class="field-label" for="edit-${key}">${label}</label>
        <textarea id="edit-${key}" data-resume="${key}" maxlength="16000">${esc(draft[key])}</textarea>`).join('')}
    </article>`;
  }
  const draft = finalResume();
  const template = ResumeFormat.presentationFor(state.layout,state.appearance);
  const baseProjects = state.bullets.length ? finalResume(false).projects || '' : draft.projects;
  const profile = block('profile',`<h2>${esc(draft.name)}</h2><div class="resume-contact">${resumeMarkup(draft.contact)}</div>`);
  const sections = ResumeFormat.orderedSections(state.appearance).filter(([key]) => draft[key]?.trim()).map(([key,label]) => {
    let content;
    if (key === 'experience' || key === 'projects') {
      const entries = key === 'projects' ? baseProjects : draft.experience;
      content = resumeEntryParts(entries,key).map(entry => resumeEntryMarkup(entry,key)).join('\n\n');
      if (key === 'projects' && state.bullets.length) content += resumeMarkup(draft.projects.slice(baseProjects.length),true);
    } else content = resumeMarkup(draft[key],key !== 'intent');
    return {key,html:block(key,`<section class="resume-section"><h3>${label}</h3><p>${content}</p></section>`,draft[key])};
  });
  const body = template.side
    ? `<div class="resume-columns"><div class="resume-main-column">${sections.filter(section => !ResumeFormat.sideFields.includes(section.key)).map(section => section.html).join('')}</div><div class="resume-side-column">${sections.filter(section => ResumeFormat.sideFields.includes(section.key)).map(section => section.html).join('')}</div></div>`
    : sections.map(section => section.html).join('');
  return `<article class="resume-paper resume-template${layout}" data-heading="${template.heading}" data-header="${template.header}" data-side="${template.side || ''}" style="${ResumeEditor.paperStyle()}"><div class="resume-profile">${profile}</div>${body}</article>`;
}
function resumeView(){return `${heading('最终简历','可编辑，支持导出 Word、PDF 和图片。',`<button class="heading-action" id="editResume">${icon('edit')}${state.editing?'保存修改':'编辑简历'}</button>`)}${state.error?`<div class="error-box" role="alert">${esc(state.error)}</div>`:''}${state.result&&state.bullets.length<state.result.questions.length?'<div class="notice">经历追问尚未全部补齐，当前含基于现有材料的保守优化，需要用户确认。</div>':''}<div class="resume-layout">${ResumeEditor.toolbar()}${resumePaper()}<aside class="resume-sidebar"><div><section class="card right-card"><div class="right-title">${icon('download')}导出你的简历</div><div class="export-options">${state.input.role ? `<span class="badge strong">${esc(state.input.role)}</span>` : ''}${ResumeExports.button()}<button class="button" id="copyResume">${icon('copy')}复制简历全文</button><p>导出内容与当前预览一致</p></div></section><div class="export-caption">${state.layout ? ResumeFormat.layouts[state.layout] : state.bullets.length?`已纳入 ${state.bullets.length} 条追问表达`:'可继续回答追问，补充具体经历'}</div></div><div class="tip-card"><div class="tip-head">${icon('shield')}投递前核对</div><p>核实联系方式、任职时间、学历、数据和个人贡献。标注为学习实践的内容，请保留真实边界。</p></div></aside></div>${state.result ? footer('准备面试') : '<div class="page-bottom"><button type="button" class="button" data-go="0">返回会话</button></div>'}`;}
function interviewView(){const r=state.result.interview;return `${heading('面试准备')}<div class="interview-grid"><div><section class="card"><div class="table-title"><h2>10 个可能的面试追问</h2></div>${r.questions.map((q,i)=>`<div class="interview-question"><span>${String(i+1).padStart(2,'0')}</span><div><h3>${esc(q.question)}</h3><p>准备证据：${esc(q.evidence)}</p><p class="interview-advice">回答建议：${esc(q.advice)}</p></div></div>`).join('')}</section>${state.bullets.length?resultCard('你的补充经历，也可能被追问',list(state.bullets.map(b=>`关于“${b.text}”：你的具体贡献、结果依据及可展示材料是什么？`)),'intro'):''}${resultCard('自我介绍 · 参考稿',`<p style="white-space:pre-line">${esc(r.intro)}</p><button class="button small" id="copyIntro" style="margin-top:15px">${icon('copy')}复制自我介绍</button>`,'intro')}</div><aside>${resultCard('可能夸大的表达',list(r.exaggerations))}${resultCard('建议补充的数据',list(r.missingData),'intro')}</aside></div>${strengtheningView()}${footer()}`;}
function loadingView() {
  const refining = state.busyType === 'refine';
  return `<section class="card loading-view" aria-live="polite" aria-busy="true">
    <div class="spinner" aria-hidden="true"></div>
    <h1>${refining ? '正在整理补充经历' : '正在对照 JD 分析简历'}</h1>
    <p>${refining ? '根据你的回答生成可写入简历的句子。' : '正在比对岗位要求和简历中的经历，通常需要几分钟。'}</p>
    <button class="button" id="cancelAnalysis">取消${refining ? '生成' : '分析'}</button>
  </section>`;
}
function render() {
  renderNav();
  const views = [ResumeChat.view,jdView,diagnosisView,matchView,questionView,rewriteView,resumeView,interviewView];
  $('workspace').innerHTML = state.step > 0 && state.busy ? loadingView() : views[state.step]();
  const preview = $('resumePreview');
  const scrollTop = preview.querySelector('.resume-preview-body')?.scrollTop;
  const previousVersion = preview.dataset.version;
  const version = hasResume() ? 'draft' : 'source';
  preview.innerHTML = state.step === 0 ? ResumeChat.previewView() : '';
  preview.hidden = !preview.innerHTML;
  preview.dataset.version = version;
  if (previousVersion === version && !preview.hidden) preview.querySelector('.resume-preview-body').scrollTop = scrollTop || 0;
  document.body.classList.toggle('resume-preview-open', !preview.hidden);
  $('chatMyResume').setAttribute('aria-expanded', String(!preview.hidden));
  bind();
}
async function readChatProgress(response, onProgress) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) throw new Error('模型回复中断，请重试。');
      pending += decoder.decode(value,{stream:true});
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const event = JSON.parse(pending.slice(0,newline));
        pending = pending.slice(newline+1);
        if (event.type === 'result') return event;
        if (event.type === 'error') throw new Error(event.message);
        onProgress(event);
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function api(url,body,{signal,form=false,blob=false,onProgress}={}) {
  const headers = {'X-Resume-Request':'1'};
  if (!form) headers['Content-Type'] = 'application/json';
  if (onProgress) headers.Accept = 'application/x-ndjson';
  const response = await fetch(url,{method:'POST',headers,body:form?body:JSON.stringify(body),signal});
  if (!response.ok) {
    let failure;
    try { failure = (await response.json()).error; } catch {}
    throw Object.assign(new Error(failure?.message || '请求失败，请重试。'),{code:failure?.code});
  }
  if (onProgress && response.headers.get('content-type')?.startsWith('application/x-ndjson')) {
    return readChatProgress(response,onProgress);
  }
  return blob ? response.blob() : response.json();
}
async function runAnalysis(signal) {
  const response = await api('/api/resume/analyze',resumeMaterials(),{signal});
  if (signal.aborted) return;
  const layout = state.layout;
  invalidate();
  state.result = response.result;
  state.layout = layout || 'classic';
  state.resultModel = response.model || state.status?.model || '';
  state.completed = new Set([0,1,2,3]);
  persistResumeDraft();
  ResumeChat.analysisFinished();
}
async function generateBullets(){const entries=state.answers.map((answer,index)=>({answer:answer?.trim(),index,question:state.result.questions[index].title})).filter(x=>x.answer);if(!entries.length){toast('请先回答至少一个问题，再生成优化表达。');$('answer-0').focus();return;}
state.busy=true;state.busyType='refine';state.controller=new AbortController();const controller=state.controller;render();
try{const bullets=(await api('/api/resume/refine',{...resumeMaterials(false),answers:entries.map(({question,answer})=>({question,answer}))},{signal:controller.signal})).result.bullets;if(controller.signal.aborted)return;state.bullets=entries.map((e,i)=>({index:e.index,text:bullets[i]}));state.completed.add(4);state.error='';if(persistResumeDraft())toast(`已生成 ${bullets.length} 条表达，并同步至最终简历。`);}
catch(e){state.error=e.name==='AbortError'?'本次生成已取消，回答已保留。':e.message;}
finally{state.busy=false;state.controller=null;render();}}
function saveResumeEdits(){
  if (!state.editing) return false;
  state.editing = false;
  const fields = document.querySelectorAll('[data-resume]');
  if (!fields.length) return false;
  state.manualResume = Object.fromEntries(Array.from(fields,el => [el.dataset.resume,el.value]));
  return persistResumeDraft();
}
async function exportResume(format) {
  if (state.exporting || state.busy || state.importBusy || !['docx','pdf','png'].includes(format)) return;
  ResumeExports.close();
  if (state.editing) { saveResumeEdits(); render(); }
  state.exporting = true;
  ResumeExports.refreshBusy();
  try {
    const resume = structuredClone(finalResume());
    let blob = await api('/api/resume/export',{format:format==='png'?'pdf':format,resume,layout:state.layout||undefined,appearance:state.appearance},{blob:true});
    if (format === 'png') blob = await ResumeExports.toPNG(blob);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const name = resume.name.replace(/[\\/:*?"<>|]/g,'') || '我的简历';
    const role = state.input.role.replace(/[\\/:*?"<>|]/g,'');
    link.href = url;
    link.download = `${[name,role].filter(Boolean).join('_')}.${format}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url),10000);
    toast(format === 'png' ? '图片简历已导出。' : format === 'pdf' ? 'PDF 简历已导出。' : 'Word 简历已导出。');
  } catch (error) {
    state.error = error.message;
    render();
    toast(error.message);
  } finally {
    state.exporting = false;
    ResumeExports.refreshBusy();
  }
}
async function copyText(text){try{await navigator.clipboard.writeText(text);toast('已复制到剪贴板。');}catch{toast('浏览器未允许复制，请手动选择文本复制。');}}
function bind(){
document.querySelectorAll('[data-go]').forEach(el=>el.onclick=()=>go(Number(el.dataset.go)));
document.querySelectorAll('[data-export]').forEach(el => el.onclick = () => exportResume(el.dataset.export));
ResumeExports.bind();
document.querySelectorAll('[data-open-templates]').forEach(el => el.onclick = () => ResumeTemplates.open(el));
ResumeEditor.bind();
if (state.step === 0) { ResumeChat.bind(); return; }
if(state.busy){$('cancelAnalysis').onclick=()=>state.controller?.abort();return;}
if(state.step===4&&state.result){document.querySelectorAll('[data-answer]').forEach(el=>el.oninput=()=>{state.answers[Number(el.dataset.answer)]=el.value;if(state.bullets.length){state.bullets=[];state.completed.delete(4);document.querySelectorAll('.bullet-result').forEach(x=>x.remove());if(persistResumeDraft())toast('回答已修改，旧表达已失效。请重新生成。');renderNav();}const count=state.answers.filter(x=>x?.trim()).length;$('answerCount').textContent=`已回答 ${count} / ${state.result.questions.length}`;$('answerBar').style.width=`${count/state.result.questions.length*100}%`;});$('generateBullets').onclick=generateBullets;}
if(state.step===5){document.querySelectorAll('[data-style]').forEach(el=>el.onclick=()=>{state.style=el.dataset.style;persistResumeDraft();render();document.querySelector(`[data-style="${state.style}"]`).focus();});}
if(state.step===6&&hasResume()){$('editResume').onclick=()=>{if(state.editing){if(saveResumeEdits())toast('简历修改已保存。');}else {state.manualResume=finalResume(false);state.editing=true;}render();if(state.editing)$('edit-name').focus();};$('copyResume').onclick=()=>{if(state.editing){saveResumeEdits();render();}const r=finalResume();copyText(`${r.name}\n${r.contact}\n\n${ResumeFormat.orderedSections(state.appearance).filter(([k])=>r[k]?.trim()).map(([k,t])=>t+'\n'+r[k]).join('\n\n')}`);};}
if(state.step===7&&state.result)$('copyIntro').onclick=()=>copyText(state.result.interview.intro);
}
const restoredDraft = restoreResumeDraft();
hydrateIcons();render();
ResumeChat.bindRail();
if (restoredDraft) toast('已恢复上次保存的简历。');
document.querySelector('.brand').onclick = event => { event.preventDefault(); go(0); };
$('helpBtn')?.addEventListener('click',()=>$('helpDialog').showModal());$('closeHelp').onclick=()=>$('helpDialog').close();$('helpDone').onclick=()=>$('helpDialog').close();
$('sampleBtn').onclick = () => { $('helpDialog').close(); ResumeChat.useSample(); };
function showSession() {
  let hasSavedDraft = false;
  try {
    hasSavedDraft = localStorage.getItem(draftStorageKey) !== null;
  } catch {
    draftStorageIssue = '无法读取浏览器中的已保存简历。';
  }
  $('clearSavedDraft').disabled = !hasSavedDraft;
  $('draftStorageStatus').textContent = draftStorageIssue || (hasSavedDraft ? '已保存一份简历稿。' : '暂无本地简历稿。');
  $('sessionDialog').showModal();
}
$('sessionBtn')?.addEventListener('click',showSession);
$('sessionFromHelp').onclick=()=>{ $('helpDialog').close(); showSession(); };
$('closeSession').onclick=()=>$('sessionDialog').close();
$('clearSavedDraft').onclick=()=>{
  try {
    localStorage.removeItem(draftStorageKey);
    draftStorageIssue = '';
    $('draftStorageStatus').textContent = '已清除本地保存。';
    $('clearSavedDraft').disabled = true;
    $('closeSession').focus();
  } catch {
    $('draftStorageStatus').textContent = '无法清除本地保存。';
  }
};
fetch('/api/resume/status').then(async r=>{if(!r.ok)throw new Error('status');state.status=await r.json();}).catch(()=>{state.status=null;});
let loadedSettings=null,settingsController=null;
const settingsTabs = ['model','prompt','credits'];
const numberText = value => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('zh-CN',{maximumFractionDigits:8}).format(value) : '—';
function switchSettingsTab(which) {
  settingsTabs.forEach(name => {
    const selected = name === which;
    $(name+'Tab').setAttribute('aria-selected',String(selected));
    $(name+'Tab').tabIndex = selected ? 0 : -1;
    $(name+'Panel').hidden = !selected;
  });
  if (which === 'credits') loadCreditUsage();
}
function updateCreditsFormula() {
  const rate = Number($('creditsRate').value);
  $('creditsFormula').textContent = rate > 0 && Number.isFinite(rate) ? `1,000 Token = ${numberText(rate / 10)} 积分` : '请输入有效的积分比例。';
}
async function loadCreditUsage() {
  $('refreshCreditUsage').disabled = true;
  $('creditUsageError').hidden = true;
  try {
    const response = await fetch('/api/resume/usage');
    const value = await response.json();
    if (!response.ok) throw new Error(value.error?.message || '暂时无法读取积分消耗。');
    if (value.recordingError) {
      $('creditUsageError').textContent = '部分用量未能保存，请检查本机积分记录。';
      $('creditUsageError').hidden = false;
    }
    $('creditUsageSummary').innerHTML = `<span>累计 Token <em>${numberText(value.totalTokens)}</em></span><span>累计消耗 <em>${numberText(value.credits)} 积分</em></span><span>未返回用量 <em>${value.unreportedRequests} 次</em></span>`;
    const operations = {chat:'会话',analyze:'定向分析',refine:'经历补充',test:'连接测试',ocr:'图片识别'};
    $('creditUsageRecords').innerHTML = value.records.length ? value.records.map(record => {
      const time = new Date(record.createdAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
      const outcome = {completed:'完成',failed:'失败',cancelled:'取消'}[record.outcome] || '未知';
      return `<tr><td>${esc(time)}</td><td>${esc(operations[record.operation] || record.operation)}</td><td>${numberText(record.usage?.totalTokens)}</td><td>${numberText(record.credits)}</td><td>${outcome}${record.usage ? '' : ' · 未返回用量'}</td></tr>`;
    }).join('') : '<tr><td colspan="5" class="credit-usage-empty">暂无消耗记录</td></tr>';
  } catch (error) {
    $('creditUsageError').textContent = error.message;
    $('creditUsageError').hidden = false;
  } finally { $('refreshCreditUsage').disabled = false; }
}
$('creditsRate').oninput = updateCreditsFormula;
$('refreshCreditUsage').onclick = loadCreditUsage;
function settingValues(){return {creditsPer10kTokens:Number($('creditsRate').value),baseURL:$('modelAddress').value.trim(),apiKey:$('modelKey').value.trim(),model:$('modelName').value.trim(),clearApiKey:$('clearKey').checked,reasoningEffort:$('modelReasoning').value,timeoutMs:Number($('modelTimeout').value),prompts:{analysis:$('analysisPrompt').value}};}
function settingError(message){$('settingsError').textContent=message;$('settingsError').hidden=!message;}
function settingsBusy(busy){$('saveSettings').disabled=busy;$('testModel').disabled=busy;}
function applySettingsToUI(v){loadedSettings=v;$('creditsRate').value=String(v.creditsPer10kTokens??1);updateCreditsFormula();renderPromptVariables(v.variables||[]);$('promptPreview').hidden=true;$('promptPreviewText').textContent='';$('modelAddress').value=v.baseURL;$('modelName').value=v.model;$('modelReasoning').value=v.reasoningEffort||'auto';$('modelTimeout').value=String(v.timeoutMs||240000);$('modelKey').value='';$('modelKey').placeholder=v.apiKeyConfigured?'已有密钥 · 留空保持不变':'输入你的 API Key';$('keyStatus').textContent=v.apiKeyConfigured?'密钥已配置':'尚未配置密钥';$('keyStatus').className=`badge ${v.apiKeyConfigured ? 'strong' : ''}`;$('clearKey').checked=false;$('analysisPrompt').value=v.prompts.analysis;$('settingsSource').textContent = '模型配置来源：' + v.source;
  $('promptSourceDescription').textContent = v.promptSource === 'project'
    ? '当前分析与追问读取项目 Markdown。这里保存的模板会在设置模式下使用。'
    : v.hasSavedPrompt ? '当前分析与追问使用已保存的主提示词。' : '尚未保存主提示词，当前使用项目模板。';}
async function openSettings(){if(state.busy||state.importBusy){toast('请等待当前任务完成后再修改设置。');return;}$('settingsDialog').showModal();switchSettingsTab('model');settingError('');$('connectionStatus').textContent='正在读取设置…';settingsBusy(true);try{const r=await fetch('/api/resume/settings');if(!r.ok)throw new Error('无法读取本机设置，请确认本地服务正在运行。');applySettingsToUI(await r.json());$('connectionStatus').textContent='';}catch(e){settingError(e.message);$('connectionStatus').textContent='';}finally{settingsBusy(false);}}
$('settingsBtn').onclick=openSettings;
$('closeSettings').onclick=()=>$('settingsDialog').close();
$('settingsDialog').addEventListener('close',()=>{settingsController?.abort();$('modelKey').value='';$('modelKey').type='password';$('toggleKey').textContent='显示';});
settingsTabs.forEach((name,index) => {
  const tab = $(name+'Tab');
  tab.onclick = () => switchSettingsTab(name);
  tab.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? settingsTabs.length-1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + settingsTabs.length) % settingsTabs.length;
    switchSettingsTab(settingsTabs[next]);
    $(settingsTabs[next]+'Tab').focus();
  };
});
$('toggleKey').onclick=()=>{const hidden=$('modelKey').type==='password';$('modelKey').type=hidden?'text':'password';$('toggleKey').textContent=hidden?'隐藏':'显示';$('toggleKey').setAttribute('aria-label',hidden?'隐藏输入的 API Key':'显示输入的 API Key');};
document.querySelectorAll('[data-reset-prompt]').forEach(el=>el.onclick=()=>{if(!loadedSettings)return;$('analysisPrompt').value=loadedSettings.defaults.analysis;$('promptPreview').hidden=true;$('promptPreviewText').textContent='';toast('已载入项目模板，保存后可在设置模式中使用。');});
$('settingsForm').onsubmit=async e=>{e.preventDefault();settingError('');settingsBusy(true);try{const v=await api('/api/resume/settings',settingValues());applySettingsToUI(v);state.status={configured:v.apiKeyConfigured,model:v.model,provider:new URL(v.baseURL).hostname};toast('设置已保存。');}catch(e){settingError(e.message||'设置保存失败，请重试。');}finally{settingsBusy(false);}};
$('testModel').onclick=async()=>{settingError('');settingsBusy(true);settingsController=new AbortController();$('connectionStatus').textContent='正在测试连接…';try{const v=await api('/api/resume/test',settingValues(),{signal:settingsController.signal});$('connectionStatus').textContent=`连接成功 · ${v.model}`;toast('模型连接成功，可以开始 AI 分析。');}catch(e){$('connectionStatus').textContent='';if(e.name!=='AbortError')settingError(e.message||'连接失败，请检查配置。');}finally{settingsController=null;settingsBusy(false);}};
function renderPromptVariables(variables){
  $('promptVariables').innerHTML=variables.map(v=>`<button type="button" class="variable-token" data-variable="${esc(v.token)}" title="${esc(v.label)}">${esc(v.token)}<span>${esc(v.label)}</span></button>`).join('');
  $('promptVariables').querySelectorAll('[data-variable]').forEach(el=>el.onclick=()=>{
    const editor=$('analysisPrompt'),start=editor.selectionStart,end=editor.selectionEnd;
    editor.setRangeText(el.dataset.variable,start,end,'end');editor.focus();editor.dispatchEvent(new Event('input'));toast('已插入变量，保存后用于后续 AI 请求。');
  });
}
$('analysisPrompt').addEventListener('input',()=>{$('promptPreview').hidden=true;$('promptPreviewText').textContent='';});
document.querySelectorAll('[data-preview-prompt]').forEach(el=>el.onclick=async()=>{
  const template=$('analysisPrompt').value;
  settingError('');$('promptPreview').hidden=true;$('promptPreviewText').textContent='';el.disabled=true;const original=el.textContent;el.textContent='正在绑定…';
  try{
    const answers=state.answers.map((answer,index)=>({answer:answer?.trim(),question:state.result?.questions[index]?.title})).filter(x=>x.answer&&x.question);
    const v=await api('/api/resume/prompt-preview',{template,...resumeMaterials(),answers});
    if(!$('settingsDialog').open)return;
    $('promptPreviewText').textContent=v.prompt+(Object.keys(v.additionalContext).length?'\n\n未在模板中引用的其他已提交材料：\n'+JSON.stringify(v.additionalContext,null,2):'');
    $('promptPreview').hidden=false;$('promptPreview').open=true;$('promptPreview').scrollIntoView({block:'nearest',behavior:'smooth'});
  }catch(e){settingError(e.message||'变量绑定预览失败，请检查提示词。');}
  finally{el.disabled=false;el.textContent=original;}
});
$('settingsDialog').addEventListener('close',()=>{$('promptPreviewText').textContent='';$('promptPreview').hidden=true;});
