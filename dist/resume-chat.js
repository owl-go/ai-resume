'use strict';
const ResumeChat = (() => {
  const guides = {
    optimize: { title:'优化我的简历', summary:'梳理结构，改写经历表达', request:'请优化我的简历，重点梳理结构和经历表达。' },
    diagnose: { title:'简历诊断', summary:'判断岗位方向并从招聘视角评分', request:'请以资深 HR 的视角诊断当前简历，判断适合的岗位方向，给出评分、扣分依据和修改建议。' },
    jobs: { title:'帮我找匹配的岗位', summary:'推荐岗位方向和搜索词', request:'请根据我的简历推荐匹配的岗位方向和搜索词。' },
    tailored: { title:'针对职位优化我的简历', summary:'对照目标职位描述逐项优化', request:'请根据我提供的目标岗位和 JD 优化这份简历。' },
    style: { title:'根据简历内容设计样式', summary:'推荐版式，预览后导出', request:'请根据简历内容设计版式，保留原有事实和措辞。' }
  };
  const pages = { jd:1, diagnosis:2, match:3, questions:4, rewrite:5, resume:6, interview:7 };
  const materials = { resume:'简历', jd:'岗位描述' };
  const chat = { history:[], draft:'', choiceDraft:'', pending:'', guide:'', files:{}, pickerKind:null, pendingFile:null, guidesOpen:false, editingMaterial:null, previewOpen:false, previewEditor:null, rewriting:null, startOnImport:false, roleFromJD:false, sampleReady:false, retry:null, waitingForService:false, run:null };
  const serviceBusyMessage = '另一个简历任务正在运行。任务结束后即可重试。';
  const actionLabels = {diagnose:'简历诊断',jobs:'看看匹配岗位',tailored:'按目标岗位定制简历',style:'调整简历版式'};
  const diagnosisAnalysisLabels = {evidence:'简历证据',direction:'岗位方向对比',deductions:'扣分与证据缺口',priority:'修改优先级'};
  const {layouts} = ResumeFormat;
  const suggestions = ['更详细','补充证据','更简洁','突出成果','突出技能'];
  const entrySections = {
    experience:{prefix:'job',title:'工作经历',label:'任职内容',scope:'这段任职经历',preserve:'公司、职位和任职时间'},
    projects:{prefix:'project',title:'项目经历',label:'项目内容',scope:'这个项目',preserve:'项目名'}
  };

  function revealPreview() {
    chat.previewEditor = null;
    if (matchMedia('(min-width: 1000px)').matches) chat.previewOpen = true;
  }

  function entryTarget(key) {
    const match = /^(job|project)-(\d+)$/.exec(key);
    if (!match) return null;
    return {field:match[1] === 'job' ? 'experience' : 'projects',index:Number(match[2])};
  }

  function sectionFields(key) {
    if (key === 'profile') return [['name','姓名'],['contact','个人信息']];
    if (key === 'original') return [['original','简历文本']];
    const target = entryTarget(key);
    if (target) return [[target.field,entrySections[target.field].label]];
    return resumeSections.filter(([field]) => field === key);
  }

  function sectionLabel(key) {
    return key === 'profile' ? '个人信息' : sectionFields(key)[0][1];
  }

  function previewBlock(key, content, value) {
    if (Object.hasOwn(entrySections,key)) {
      const {prefix,title} = entrySections[key];
      const original = finalResume(false)[key] || '';
      const supplement = value.slice(original.length).trim();
      return `<section class="resume-section resume-preview-entries"><h3>${title}</h3>
        ${resumeEntryParts(original,key).map((part,index) => previewBlock(`${prefix}-${index}`,`<p>${resumeEntryMarkup(part,key)}</p>`)).join('')}
        ${supplement ? `<p class="resume-entry-supplement">${resumeMarkup(supplement,true)}</p>` : ''}</section>`;
    }
    const editor = chat.previewEditor;
    const label = sectionLabel(key);
    const busy = state.busy || state.importBusy;
    const disabled = busy ? 'disabled' : '';
    const active = editor?.key === key;
    return `<div class="resume-preview-block ${active ? 'is-editing' : ''}" aria-label="${label}">
      <div class="resume-block-actions">
        ${key === 'original' ? '' : `<button type="button" class="button primary small" id="suggest-section-${key}" data-suggest-section="${key}" ${disabled}>添加改写建议</button>`}
        <button type="button" class="button small" data-edit-section="${key}" ${disabled}>手动编辑</button>
      </div>
      ${content}
      ${active ? `<form id="previewSectionForm" class="${editor.mode === 'suggest' ? 'resume-suggestion' : 'resume-section-editor'}">
        ${editor.mode === 'suggest' ? `<label for="sectionSuggestion" class="sr-only">改写建议</label>
          <div class="resume-suggestion-input"><textarea id="sectionSuggestion" rows="1" maxlength="2000" placeholder="这段想怎么改？" ${disabled}>${esc(editor.draft)}</textarea>
          <button type="submit" id="sendSectionSuggestion" aria-label="发送改写建议" ${busy || !editor.draft.trim() ? 'disabled' : ''}>${icon('arrow')}</button></div>
          <div class="resume-suggestion-chips">${suggestions.map((text,index) => `<button type="button" data-rewrite-chip="${index}" ${disabled}>${text}</button>`).join('')}
          <button type="button" id="closeSectionEditor" ${busy && chat.rewriting !== editor ? 'disabled' : ''}>${chat.rewriting === editor ? '取消生成' : '取消'}</button></div>
          ${chat.rewriting === editor ? '<p role="status">正在改写…</p>' : ''}
          ${editor.error ? `<p role="alert">${esc(editor.error)}</p>` : ''}`
        : `${sectionFields(key).map(([field,title]) => `<label for="preview-${field}">${title}</label><textarea id="preview-${field}" rows="${field === 'name' ? 1 : 4}" data-preview-field="${field}" maxlength="${field === 'name' ? 100 : field === 'original' ? 50000 : 16000}" ${disabled}>${esc(editor.values[field])}</textarea>`).join('')}
          <div class="chat-edit-actions"><button type="button" class="button small" id="closeSectionEditor" ${disabled}>取消</button><button type="submit" class="button primary small" ${disabled}>保存修改</button></div>`}
      </form>` : ''}
    </div>`;
  }

  function applySectionEdit(key, values) {
    const updated = finalResume(false);
    const target = entryTarget(key);
    if (!target) {
      for (const [field] of sectionFields(key)) updated[field] = values[field];
    } else {
      const {field,index} = target;
      const entries = resumeEntryParts(updated[field],field);
      entries[index] = resumeEntryParts(values[field]).join('\n');
      updated[field] = entries.filter(Boolean).join('\n\n');
    }
    state.manualResume = updated;
    return persistResumeDraft();
  }

  function previewView() {
    const generated = hasResume();
    const draft = chat.run?.resume;
    if (!chat.previewOpen || !(draft || generated || state.input.resume)) return '';
    const title = draft ? '简历草稿生成中' : generated ? finalResume().name || '我的简历' : chat.files.resume || '我的简历';
    const disabled = state.busy || state.importBusy ? 'disabled' : '';
    return `<div class="resume-preview-head">
      <div class="resume-preview-title">${icon('file')}<span>${esc(title)}</span></div>
      <button class="icon-button" type="button" id="closeResumePreview" aria-label="关闭简历预览">×</button>
    </div>
    ${generated && !draft ? `<div class="resume-preview-toolbar">
      <span>当前简历稿</span>
      <label for="previewLayout">版式</label><select id="previewLayout" ${disabled}>${Object.entries(layouts).map(([value,label]) => `<option value="${value}" ${(state.layout || 'classic') === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
      <div class="resume-preview-export"><button class="button small" type="button" data-export="docx" ${disabled}>导出 Word</button><button class="button primary small" type="button" data-export="pdf" ${disabled}>${icon('download')}导出 PDF</button></div>
    </div>` : ''}
    <div class="resume-preview-body" tabindex="0" aria-label="简历正文">${draft ? streamingResume(draft) : generated ? resumePaper(previewBlock) : `<article class="resume-paper">${previewBlock('original',`<p class="resume-source-text">${esc(state.input.resume)}</p>`)}</article>`}</div>`;
  }

  function streamingResume(draft) {
    return `<article class="resume-paper">
      <h2 data-stream-field="name" ${draft.name ? '' : 'hidden'}>${esc(draft.name)}</h2>
      <div class="resume-contact" data-stream-field="contact" ${draft.contact ? '' : 'hidden'}>${esc(draft.contact)}</div>
      ${resumeSections.map(([key,title]) => `<section class="resume-section" ${draft[key] ? '' : 'hidden'}>
        <h3>${title}</h3><p data-stream-field="${key}">${esc(draft[key])}</p></section>`).join('')}
    </article>`;
  }

  function missingMaterial() {
    if (!state.input.resume && !hasResume()) return 'resume';
    if (chat.guide === 'tailored' && !state.input.jd) return 'jd';
    return null;
  }

  function materialsReady() {
    return !missingMaterial() && (chat.guide !== 'tailored' || state.input.role);
  }

  function storeMaterial(key, value) {
    if (state.input[key] === value) return false;
    if (['resume','jd','role'].includes(key)) invalidate({preserveDraft:key !== 'resume'});
    state.input[key] = value;
    if (key === 'jd' && chat.roleFromJD) {
      state.input.role = '';
      chat.roleFromJD = false;
    }
    return true;
  }

  function startAfterMaterial(key, changed) {
    if (changed && key === 'jd' && chat.guide === 'tailored') chat.startOnImport = true;
    return chat.startOnImport && !missingMaterial() && !chat.waitingForService;
  }

  function guidance() {
    const missing = missingMaterial();
    if (missing === 'resume') return '先上传 PDF 或 Word 简历，也可以直接粘贴正文。';
    if (missing === 'jd') return '请上传或粘贴完整的岗位描述（JD）。';
    if (chat.guide === 'tailored' && !state.input.role) return '请告诉我目标岗位名称，我会结合已提供的 JD 和简历分析。';
    return '材料已就绪。你可以补充要求，准备好后发送。';
  }

  function quickGuides() {
    return `<div class="chat-quick-guides" role="group" aria-label="快捷指引">
      ${Object.entries(guides).filter(([id]) => id !== 'diagnose').map(([id, guide]) => `<button
        type="button" class="chat-guide-pill" data-guide="${id}" title="${guide.summary}"
        ${state.busy || state.importBusy ? 'disabled' : ''}
      >${guide.title}</button>`).join('')}
    </div>`;
  }

  function choicePanel(title, choices, placeholder = '输入你的需求…') {
    return `<form class="chat-choice-panel" id="chatChoiceForm" aria-labelledby="chatChoiceHeading">
      <div class="chat-choice-head">
        <span class="chat-choice-icon">${icon('chat')}</span>
        <h2 id="chatChoiceHeading" tabindex="-1">${title}</h2>
      </div>
      <div class="chat-choices" role="group" aria-labelledby="chatChoiceHeading">
        ${choices.map(([id, label], index) => `<button type="button" class="chat-guide" data-choice="${id}">
          <span class="chat-choice-number" aria-hidden="true">${index + 1}</span>
          <strong>${label}</strong>
          <span class="chat-guide-arrow" aria-hidden="true">${icon('arrow')}</span>
        </button>`).join('')}
      </div>
      ${placeholder === null ? '' : `<label class="chat-choice-label" for="chatChoiceText">或者，输入你的需求</label>
        <textarea id="chatChoiceText" rows="2" maxlength="50000" placeholder="${placeholder}">${esc(chat.choiceDraft)}</textarea>
        <button type="submit" id="chatChoiceSubmit" class="button primary" ${chat.choiceDraft.trim() && !chat.waitingForService ? '' : 'disabled'}>发送</button>`}
    </form>`;
  }

  function nextSteps() {
    if (chat.pendingFile) return choicePanel(`「${esc(chat.pendingFile.name)}」用作什么？`,[
      ['use-jd','作为岗位描述'], ['use-resume','作为简历'], ['cancel-file','取消上传']
    ],null);
    if (!chat.guide) return state.input.resume && !hasResume() ? choicePanel('想怎么使用这份材料？',[
      ['optimize','优化我的简历'],
      ['tailored','针对职位优化我的简历']
    ]) : '';
    const missing = missingMaterial();
    if (missing === 'resume') return choicePanel('接下来提供简历',[
      ['upload-resume','上传简历'],
      ['paste-resume','粘贴简历正文']
    ],'粘贴简历，或输入其他需求…');
    if (missing === 'jd') return choicePanel('接下来提供岗位描述',[
      ['upload-jd','上传岗位描述'],
      ['paste-jd','粘贴 JD'],
      ['optimize','先优化通用简历']
    ],'粘贴 JD，或输入其他需求…');
    if (chat.guide === 'tailored' && !state.input.role) {
      return choicePanel('请确认目标岗位',[['optimize','先优化通用简历']],'输入目标岗位名称…');
    }
    return chat.sampleReady ? `<div class="chat-result-actions"><button type="button" class="button primary small" id="startSampleAnalysis" ${chat.waitingForService ? 'disabled' : ''}>开始分析示例</button></div>` : '';
  }

  function materialEditor() {
    const key = chat.editingMaterial;
    return `<form class="chat-choice-panel chat-material-edit" id="chatMaterialEdit">
      <label class="chat-choice-label" for="chatMaterialText">${materials[key]}文本</label>
      <textarea id="chatMaterialText" rows="7" maxlength="50000" required>${esc(state.input[key])}</textarea>
      <div class="chat-edit-actions">
        <button type="button" class="button small" id="chatCancelEdit">取消</button>
        <button type="submit" class="button primary">保存文本</button>
      </div>
    </form>`;
  }

  function elapsedTime(run) {
    return ((performance.now()-run.startedAt)/1000).toFixed(1)+' 秒';
  }

  function executionSummary() {
    if (!chat.run) return;
    return {duration:elapsedTime(chat.run),steps:[...chat.run.steps,'已校验结果']};
  }

  function diagnosisSource() {
    return hasResume() ? JSON.stringify(finalResume()) : state.input.resume;
  }

  function activeDiagnosis() {
    return chat.diagnosis?.source === diagnosisSource() ? chat.diagnosis.report : null;
  }

  function analysisSummaryView(summary, live = false) {
    return `<dl class="chat-analysis-summary">${Object.entries(diagnosisAnalysisLabels)
      .filter(([key]) => live || summary[key])
      .map(([key,label]) => `<div data-analysis-step="${key}" ${summary[key] ? '' : 'hidden'}>
        <dt>${label}</dt><dd>${esc(summary[key])}</dd></div>`).join('')}</dl>`;
  }

  function diagnosisView(report, analysisSummary) {
    const current = report === chat.diagnosis?.report && report === activeDiagnosis();
    const labels = {content:'简历内容评分',screening:'初筛邀约评分',fit:'岗位方向匹配评分'};
    return `<section class="chat-diagnosis card" aria-label="简历诊断报告" tabindex="-1" ${current ? 'id="currentDiagnosis"' : ''}>
      <header class="chat-diagnosis-heading"><span class="chat-diagnosis-score" aria-label="综合评分 ${report.score} 分">${report.score}</span>
        <div><h2>简历评分 · ${esc(report.direction)}</h2><p>${esc(report.summary)}</p></div></header>
      <div class="chat-diagnosis-dimensions">
        ${Object.entries(labels).map(([key,label]) => {
          const {score,reason} = report.dimensions[key];
          return `<div class="chat-diagnosis-dimension">
            <div class="chat-score-ring" aria-label="${score} 分"><svg viewBox="0 0 52 52" aria-hidden="true">
              <circle cx="26" cy="26" r="22"></circle><circle cx="26" cy="26" r="22" pathLength="100" stroke-dasharray="${score} 100"></circle>
            </svg><span aria-hidden="true">${score}</span></div>
            <div><h3>${label}</h3><p>${esc(reason)}</p></div>
          </div>`;
        }).join('')}
      </div>
      ${analysisSummary ? `<details class="chat-approach chat-diagnosis-analysis">
        <summary>思考摘要</summary>${analysisSummaryView(analysisSummary)}</details>` : ''}
      <div class="chat-diagnosis-actions">
        ${current ? `<button type="button" class="button primary small" id="diagnosisJobs" ${state.busy || state.importBusy ? 'disabled' : ''}>看看匹配职位</button>` : ''}
        <details class="chat-diagnosis-suggestions">
          <summary class="button small">查看修改建议</summary>
          <ol>${report.suggestions.map(({title,action}) => `<li><strong>${esc(title)}</strong><p>${esc(action)}</p></li>`).join('')}</ol>
        </details>
      </div>
    </section>`;
  }

  function followUpView() {
    if (chat.guide === 'tailored' && !materialsReady()) return '';
    const report = activeDiagnosis();
    if (!report && !hasResume()) return '';
    const actions = report
      ? [['report','查看完整诊断报告'],['weakest','帮我优化简历里最弱的部分'],
        ...(!state.input.jd || state.input.role === report.direction ? [['direction',`按 ${report.direction} 定制简历`]] : [])]
      : [...new Set(['diagnose',...(chat.nextActions || ['jobs','tailored'])])]
        .filter(id => Object.hasOwn(actionLabels,id) && !(id === 'tailored' && state.result))
        .map(id => [id,actionLabels[id]]);
    return `<div class="chat-follow-up" role="group" aria-label="下一步操作">
      ${actions.map(([id,label]) => `<button type="button" class="button small" data-follow-up="${id}">${esc(label)}${icon('arrow')}</button>`).join('')}
    </div>`;
  }

  function focusDiagnosis(expand = false) {
    const card = $('currentDiagnosis');
    if (!card) return;
    if (expand) card.querySelectorAll('details').forEach(details => { details.open = true; });
    card.scrollIntoView({block:'start'});
    card.focus({preventScroll:true});
  }

  function messageView({role, text, approach, execution, diagnosis, analysisSummary}) {
    return `<div class="chat-message chat-message-${role}">
      ${role === 'assistant' ? `<span class="chat-speaker"><span class="chat-avatar">${icon('chat')}</span>简历专家</span>` : '<span class="sr-only">你的消息</span>'}
      ${approach ? `<details class="chat-approach"><summary>分析依据</summary><p>${esc(approach)}</p></details>` : ''}
      ${execution ? `<details class="chat-approach"><summary>执行过程 · 执行时长 ${execution.duration}</summary>
        <ol>${execution.steps.map(step=>`<li>${step}</li>`).join('')}</ol></details>` : ''}
      <p>${esc(text)}</p>
      ${diagnosis ? diagnosisView(diagnosis,analysisSummary) : ''}
    </div>`;
  }

  function progressView() {
    const cancel = '<button type="button" class="text-button" id="cancelAnalysis">取消</button>';
    if (state.importBusy) {
      return `<div class="chat-progress"><span role="status">正在读取文档…</span>${cancel}</div>`;
    }
    const analyzing = state.busyType === 'analyze';
    const run = chat.run;
    const hasAnalysis = Object.keys(run.analysisSummary).length > 0;
    const guide = guides[chat.guide];
    const isPreset = chat.pending === guide?.request;
    const focus = analyzing ? '对照岗位要求与简历证据，整理匹配缺口和改写建议。'
      : isPreset && chat.guide === 'optimize' ? '梳理简历结构，核对个人职责和已有成果，准备改写经历。'
      : isPreset ? guide.summary + '。' : '结合当前消息和已有材料处理你的需求。';
    return `<section class="chat-progress chat-process" aria-label="分析过程">
      <div class="chat-process-head">
        <span>${icon('chat')}分析过程</span>
        <div class="chat-process-tools"><span id="chatElapsed">执行时长 ${elapsedTime(run)}</span>${cancel}</div>
      </div>
      <p id="chatProcessStatus" role="status">${analyzing ? '已确认材料，正在生成定向分析…' : run.status || '正在等待模型回复…'}</p>
      <p id="chatProcessFocus" class="chat-process-focus" ${run.approach || hasAnalysis ? 'hidden' : ''}>处理重点 · ${focus}</p>
      <p id="chatProcessApproach" class="chat-process-approach" ${run.approach ? '' : 'hidden'}>${esc(run.approach)}</p>
      <div id="chatLiveAnalysis" ${hasAnalysis ? '' : 'hidden'}><h3>思考摘要</h3>${analysisSummaryView(run.analysisSummary,true)}</div>
      <div class="chat-execution"><span>执行过程</span><ol id="chatExecutionSteps">${run.steps.map(step=>`<li>${step}</li>`).join('')}</ol></div>
      <p id="chatLiveReply" class="chat-live-reply" ${run.reply ? '' : 'hidden'}>${esc(run.reply)}</p>
    </section>`;
  }

  function recordExecution(step) {
    chat.run.steps.push(step);
    const list = $('chatExecutionSteps');
    if (!list) return;
    const item = document.createElement('li');
    item.textContent = step;
    list.append(item);
  }

  function updateProgressStatus(status) {
    chat.run.status = status;
    const label = $('chatProcessStatus');
    if (label) label.textContent = status;
  }

  function receiveProgress(event) {
    const run = chat.run;
    if (!run) return;
    if (event.type === 'generating') {
      recordExecution('接收模型输出');
      updateProgressStatus('正在接收模型输出…');
      return;
    }
    if (event.type === 'diagnosis') {
      recordExecution('生成诊断报告');
      updateProgressStatus('正在整理评分与修改建议…');
      return;
    }
    if (typeof event.text !== 'string') return;
    if (event.type === 'approach') {
      run.approach += event.text;
      const approach = $('chatProcessApproach');
      if (!approach) return;
      approach.textContent = run.approach;
      approach.hidden = false;
      $('chatProcessFocus').hidden = true;
    } else if (event.type === 'analysis' && Object.hasOwn(diagnosisAnalysisLabels,event.key)) {
      if (!run.analysisSummary[event.key]) updateProgressStatus(`正在输出${diagnosisAnalysisLabels[event.key]}…`);
      run.analysisSummary[event.key] = (run.analysisSummary[event.key] || '') + event.text;
      const step = document.querySelector(`#chatLiveAnalysis [data-analysis-step="${event.key}"]`);
      if (!step) return;
      step.querySelector('dd').textContent = run.analysisSummary[event.key];
      step.hidden = false;
      $('chatLiveAnalysis').hidden = false;
      $('chatProcessFocus').hidden = true;
    } else if (event.type === 'reply') {
      if (!run.reply) {
        recordExecution('生成会话回复');
        updateProgressStatus('正在生成回复…');
      }
      run.reply += event.text;
      const reply = $('chatLiveReply');
      if (!reply) return;
      reply.textContent = run.reply;
      reply.hidden = false;
    } else if (event.type === 'resume' && !chat.rewriting) {
      const keys = ['name','contact',...resumeSections.map(([key])=>key)];
      if (!keys.includes(event.key)) return;
      const first = !run.resume;
      if (first) {
        run.resume = {};
        recordExecution('逐段生成简历草稿');
      }
      run.resume[event.key] = (run.resume[event.key] || '') + event.text;
      if (first) {
        if (matchMedia('(min-width: 1000px)').matches) chat.previewOpen = true;
        render();
        return;
      }
      const field = document.querySelector(`[data-stream-field="${event.key}"]`);
      if (!field) return;
      field.textContent = run.resume[event.key];
      field.hidden = false;
      if (field.parentElement.matches('.resume-section')) field.parentElement.hidden = false;
    }
  }

  function view() {
    const started = chat.history.length > 0 || chat.pending;
    const busy = state.busy || state.importBusy;
    const attachments = Object.entries(chat.files).map(([key, name]) => `<span class="chat-file">
      <button type="button" class="chat-file-label" data-edit-material="${key}" title="查看或修改${materials[key]}文本" ${busy ? 'disabled' : ''}>${icon('file')}<span>${materials[key]} · ${esc(name)}</span></button>
      <button type="button" class="chat-file-remove" aria-label="移除${materials[key]}附件" data-remove-file="${key}" ${busy ? 'disabled' : ''}>×</button>
    </span>`).join('');
    return `<section class="chat-shell ${started ? 'chat-started' : ''}" aria-label="简历会话">
      ${started ? `<div class="chat-thread" role="log" aria-label="会话记录">
        ${chat.history.map(messageView).join('')}
        ${chat.pending ? messageView({role:'user',text:chat.pending}) : ''}
      </div>` : `<header class="chat-welcome">
        <h1>今天想怎么处理你的简历？</h1>
        <p>直接告诉我你的需求，或上传一份简历开始。</p>
      </header>`}
      ${busy ? progressView() : ''}
      ${!started || chat.guidesOpen ? quickGuides() : ''}
      ${(started || chat.pendingFile) && !busy && !chat.guidesOpen ? (chat.editingMaterial ? materialEditor() : nextSteps()) : ''}
      ${!busy && !chat.guidesOpen && !chat.editingMaterial ? followUpView() : ''}
      ${state.result || hasResume() ? `<div class="chat-result-actions" aria-label="本次结果">
        ${state.result ? '<button type="button" class="button small" data-go="1">查看 JD 分析</button><button type="button" class="button small" data-go="4">补充经历</button>' : ''}
        <button type="button" class="button small" id="showChatResume">查看简历${icon('arrow')}</button>
        ${state.result ? '<button type="button" class="button small" data-go="7">面试准备</button>' : ''}
      </div>` : ''}
      ${state.error ? `<div class="error-box" role="alert"><span id="chatErrorText">${esc(state.error)}</span>
        ${chat.retry ? ` <button type="button" class="button small" id="retryChatTask" ${chat.waitingForService ? 'disabled' : ''}>${chat.retry.guide === 'optimize' ? '重试优化' : chat.retry.guide === 'diagnose' ? '重试诊断' : '重试'}</button>` : ''}</div>` : ''}
      <div class="chat-input-area"><form class="chat-composer" id="chatForm">
        <label for="chatMessage" class="sr-only">你的需求</label>
        <textarea id="chatMessage" rows="3" maxlength="50000" placeholder="描述你的需求，或粘贴简历和岗位描述…" ${busy ? 'disabled' : ''}>${esc(chat.draft)}</textarea>
        ${attachments ? `<div class="chat-files" aria-label="已上传文件">${attachments}</div>` : ''}
        <div class="chat-tools">
          <div class="chat-upload-tools">
            <input type="file" id="chatFile" accept=".pdf,.docx" hidden>
            <button type="button" class="chat-upload-button" id="chatUpload" aria-label="上传文件" title="上传文件" ${busy ? 'disabled' : ''}>${icon('attach')}</button>
            ${started ? `<button type="button" class="text-button chat-chip" id="chatToggleGuides" aria-expanded="${chat.guidesOpen}" ${busy ? 'disabled' : ''}>快捷指引</button>` : ''}
          </div>
          <button type="submit" class="button primary chat-send" id="chatSend" aria-label="发送" title="发送" ${busy || chat.waitingForService || !chat.draft.trim() ? 'disabled' : ''}>${icon('arrow')}</button>
        </div>
      </form></div>
    </section>`;
  }

  function finishTurn(target = 'chatMessage') {
    render();
    const control = $(target) || $('chatMessage');
    control?.scrollIntoView({block:'nearest'});
    control?.focus({preventScroll:true});
  }

  function addMessage(role, text, approach, execution, diagnosis, analysisSummary) {
    chat.history.push({role,text,approach,execution,diagnosis,analysisSummary});
  }

  async function waitForService() {
    if (chat.waitingForService) return;
    chat.waitingForService = true;
    let idle = false;
    for (let attempt = 0; attempt < 160; attempt++) {
      await new Promise(resolve => setTimeout(resolve,2000));
      try {
        const status = await fetch('/api/resume/status',{signal:AbortSignal.timeout(3000)});
        if (status.ok && !(await status.json()).busy) { idle = true; break; }
      } catch {}
    }
    chat.waitingForService = false;
    const notice = idle ? '模型任务已结束，可以重试。' : '暂未确认模型任务状态，可以手动重试。';
    if (state.error === serviceBusyMessage) {
      state.error = notice;
      if ($('chatErrorText')) $('chatErrorText').textContent = notice;
    }
    if (chat.previewEditor?.error === serviceBusyMessage) {
      chat.previewEditor.error = notice;
      const alert = $('previewSectionForm')?.querySelector('[role="alert"]');
      if (alert) alert.textContent = notice;
    }
    if ($('retryChatTask')) $('retryChatTask').disabled = false;
    if ($('startSampleAnalysis')) $('startSampleAnalysis').disabled = false;
    if ($('chatSend')) $('chatSend').disabled = state.busy || state.importBusy || !chat.draft.trim();
    if ($('chatChoiceSubmit')) $('chatChoiceSubmit').disabled = !chat.choiceDraft.trim();
  }

  function selectGuide(id, runWhenReady = false) {
    if (chat.waitingForService && runWhenReady) return;
    if (chat.draft === guides[chat.guide]?.request) chat.draft = '';
    chat.guide = id;
    chat.guidesOpen = false;
    chat.sampleReady = false;
    chat.retry = null;
    chat.editingMaterial = null;
    state.error = '';
    const ready = !missingMaterial();
    chat.startOnImport = runWhenReady && !ready;
    if (runWhenReady && ready) {
      send(null);
      return;
    }
    addMessage('user',guides[id].title);
    addMessage('assistant',guidance());
    if (ready && !chat.draft.trim()) chat.draft = guides[id].request;
    finishTurn('chatChoiceHeading');
  }

  function openFilePicker(kind = null) {
    chat.pickerKind = kind;
    $('chatFile').click();
  }

  function defaultFileKind() {
    if (chat.guide === 'tailored') return missingMaterial();
    return state.input.resume || hasResume() ? null : 'resume';
  }

  async function attach(file, kind = defaultFileKind()) {
    if (!file || state.busy || state.importBusy) return;
    if (!/\.(pdf|docx)$/i.test(file.name) || !file.size || file.size > 8 * 1024 * 1024) {
      state.error = '请上传不超过 8 MB 的 PDF 或 Word (.docx) 文件。';
      finishTurn();
      return;
    }
    state.error = '';
    if (!kind) {
      chat.pendingFile = file;
      chat.editingMaterial = null;
      chat.guidesOpen = false;
      finishTurn('chatChoiceHeading');
      return;
    }
    chat.pendingFile = null;
    state.importBusy = true;
    const controller = state.controller = new AbortController();
    render();
    let startTask = false;
    try {
      const form = new FormData();
      form.append('resume',file);
      const {text} = await api('/api/resume/import',form,{form:true,signal:controller.signal});
      if (controller.signal.aborted) return;
      const changed = storeMaterial(kind,text);
      chat.files[kind] = file.name;
      if (kind === 'resume') revealPreview();
      chat.sampleReady = false;
      chat.retry = null;
      chat.editingMaterial = null;
      startTask = startAfterMaterial(kind,changed);
      addMessage('assistant',`${materials[kind]}已识别。${chat.guide && !startTask && !materialsReady() ? guidance() : ''}`);
      if (!startTask && chat.guide && materialsReady() && !chat.draft.trim()) chat.draft = guides[chat.guide].request;
    } catch (error) {
      state.error = error.name === 'AbortError' ? '已取消读取文档。' : error.message;
    } finally {
      state.importBusy = false;
      state.controller = null;
      if (!startTask) finishTurn('chatChoiceHeading');
    }
    if (startTask) await send(null);
  }

  async function send(draftField = 'draft', rewrite = null, preset = null) {
    const target = rewrite ? entryTarget(rewrite.key) : null;
    let rewriteTarget = '';
    if (target) {
      const {scope,preserve} = entrySections[target.field];
      rewriteTarget = `只改写当前简历稿 ${target.field} 中提供的${scope}，保留${preserve}。只将该条经历写入 resume.${target.field}，条目内部使用单换行，不添加其他条目。`;
    } else if (rewrite) {
      rewriteTarget = `请只改写当前简历稿的「${sectionLabel(rewrite.key)}」，保留其他区块，并返回可编辑的简历。`;
    }
    const message = rewrite
      ? `${rewriteTarget}没有证据的数据请标为待补充。\n\n改写建议：${rewrite.draft.trim()}`
      : draftField ? chat[draftField].trim() : preset?.message || guides[chat.guide].request;
    if (!message || state.busy || state.importBusy || chat.waitingForService) return;
    const request = {message,guide:rewrite ? 'optimize' : preset?.guide || chat.guide};
    const startTailored = request.guide === 'tailored' && message === guides.tailored.request;
    const retryTarget = rewrite ? 'sectionSuggestion' : draftField === 'choiceDraft' ? 'chatChoiceText' : draftField ? 'chatMessage' : 'retryChatTask';
    chat.retry = null;
    chat.startOnImport = false;
    chat.sampleReady = false;
    state.error = '';
    if (rewrite) rewrite.error = '';
    if (state.status?.configured === false) {
      const message = '请在设置中配置模型和 API Key，再发送消息。';
      if (rewrite) rewrite.error = message;
      else {
        state.error = message;
        if (!draftField) chat.retry = request;
      }
      finishTurn(retryTarget);
      return;
    }
    chat.rewriting = rewrite;
    chat.pending = message;
    if (draftField) chat[draftField] = '';
    else if (chat.draft === message) chat.draft = '';
    state.busy = true;
    state.busyType = 'chat';
    chat.run = {startedAt:performance.now(),steps:['已提交请求'],approach:'',reply:'',status:'',analysisSummary:{},resume:null};
    const controller = state.controller = new AbortController();
    render();
    const timer = setInterval(() => {
      const elapsed = $('chatElapsed');
      if (elapsed) elapsed.textContent = '执行时长 '+elapsedTime(chat.run);
    },200);
    let pageToOpen = null;
    let diagnosisReady = false;
    try {
      const {input,currentResume} = resumeMaterials(!rewrite);
      if (target) currentResume[target.field] = resumeEntryParts(currentResume[target.field],target.field)[target.index];
      const {result} = await api('/api/resume/chat',{
        ...request,
        history:chat.history.slice(-8).map(({role,text}) => ({role,text:text.slice(0,3000)})),
        input,
        startTailored,
        roleFromJD:chat.roleFromJD,
        hasReport:!!state.result,
        currentResume
      },{signal:controller.signal,onProgress:receiveProgress});
      if (controller.signal.aborted) return;
      if (rewrite) {
        addMessage('user',message);
        addMessage('assistant',result.reply,result.approach,executionSummary());
        const returnedEntries = target ? resumeEntryParts(result.resume?.[target.field],target.field) : [];
        if (result.resume && (!target || returnedEntries.length === 1)) {
          applySectionEdit(rewrite.key,result.resume);
          chat.previewEditor = null;
        } else rewrite.error = returnedEntries.length > 1 ? '模型返回了多条经历，请重试单条改写。' : '本轮没有可应用的改写，请调整建议后重试。';
        return;
      }
      const {role,...otherMaterials} = result.materials;
      for (const [key,value] of Object.entries(otherMaterials)) {
        if (!storeMaterial(key,value)) continue;
        delete chat.files[key];
        if (key === 'resume') revealPreview();
      }
      if (role !== undefined) {
        storeMaterial('role',role);
        chat.roleFromJD = result.roleFromJD === true;
      }
      addMessage('user',message);
      chat.pending = '';
      if (result.diagnosis) {
        chat.diagnosis = {report:result.diagnosis,source:diagnosisSource()};
        diagnosisReady = true;
      }
      addMessage('assistant',result.reply,result.approach,result.analyze ? undefined : executionSummary(),result.diagnosis,result.analysisSummary);
      chat.editingMaterial = null;
      if (guides[result.intent]) chat.guide = result.intent;
      if (result.intent === 'tailored') chat.startOnImport = Boolean(missingMaterial());
      if (result.resume) {
        const layout = state.layout;
        invalidate();
        state.chatResume = result.resume;
        state.layout = layout || 'classic';
        chat.nextActions = result.nextActions;
        revealPreview();
      }
      if (result.layout && hasResume()) state.layout = result.layout;
      if (result.resume || result.layout && hasResume()) persistResumeDraft();
      if (result.open === 'resume' && hasResume()) chat.previewOpen = true;
      else if (result.open) pageToOpen = pages[result.open];
      if (result.analyze) {
        chat.run.approach = '';
        chat.run.reply = '';
        chat.run.analysisSummary = {};
        chat.run.resume = null;
        recordExecution('生成定向分析报告');
        state.busyType = 'analyze';
        render();
        await runAnalysis(controller.signal);
      }
    } catch (error) {
      if (draftField && chat.pending) chat[draftField] = chat.pending;
      const busy = error.code === 'SERVICE_BUSY';
      const message = busy ? serviceBusyMessage : error.name === 'AbortError' ? '本次操作已取消，材料已保留。' : error.message;
      if (busy) void waitForService();
      if (rewrite && chat.previewEditor === rewrite) rewrite.error = message;
      else {
        state.error = message;
        if (!rewrite && (!draftField || !chat.pending)) chat.retry = request;
      }
    } finally {
      clearInterval(timer);
      chat.rewriting = null;
      chat.pending = '';
      chat.run = null;
      state.busy = false;
      state.busyType = '';
      state.controller = null;
      if (pageToOpen && (state.result || pageToOpen === 6 && hasResume())) go(pageToOpen);
      else if (rewrite) finishTurn(chat.previewEditor ? 'sectionSuggestion' : `suggest-section-${rewrite.key}`);
      else if (diagnosisReady) { render(); focusDiagnosis(); }
      else finishTurn(state.error ? retryTarget : 'chatMessage');
    }
  }

  function editMaterial(key) {
    if (state.busy || state.importBusy) return;
    chat.editingMaterial = key;
    chat.guidesOpen = false;
    finishTurn('chatMaterialText');
  }

  function openPreview() {
    chat.previewOpen = true;
    finishTurn('closeResumePreview');
  }

  function bindPreview() {
    if ($('resumePreview').hidden) return;
    $('closeResumePreview').onclick = () => {
      chat.previewOpen = false;
      chat.previewEditor = null;
      finishTurn('chatMyResume');
    };
    if ($('previewLayout')) $('previewLayout').onchange = event => {
      state.layout = event.target.value;
      persistResumeDraft();
      finishTurn('previewLayout');
    };
    const preview = $('resumePreview');
    preview.querySelectorAll('[data-suggest-section]').forEach(button => {
      button.onclick = () => {
        chat.previewEditor = {key:button.dataset.suggestSection,mode:'suggest',draft:''};
        finishTurn('sectionSuggestion');
      };
    });
    preview.querySelectorAll('[data-edit-section]').forEach(button => {
      button.onclick = () => {
        const key = button.dataset.editSection;
        const values = key === 'original' ? {original:state.input.resume} : finalResume(false);
        const target = entryTarget(key);
        if (target) values[target.field] = resumeEntryParts(values[target.field],target.field)[target.index];
        chat.previewEditor = {key,mode:'edit',values};
        finishTurn(`preview-${sectionFields(key)[0][0]}`);
      };
    });
    const form = $('previewSectionForm');
    if (!form) return;
    const editor = chat.previewEditor;
    const focusAction = () => {
      const selector = editor.mode === 'suggest' ? 'data-suggest-section' : 'data-edit-section';
      preview.querySelector(`[${selector}="${editor.key}"]`)?.focus();
    };
    $('closeSectionEditor').onclick = () => {
      if (state.busy) { state.controller?.abort(); return; }
      chat.previewEditor = null;
      render();
      focusAction();
    };
    if (editor.mode === 'suggest') {
      const input = $('sectionSuggestion');
      input.oninput = () => {
        editor.draft = input.value;
        $('sendSectionSuggestion').disabled = !editor.draft.trim();
      };
      form.querySelectorAll('[data-rewrite-chip]').forEach(button => {
        button.onclick = () => {
          const text = suggestions[Number(button.dataset.rewriteChip)];
          input.value = [input.value.trim(),text].filter(Boolean).join('，').slice(0,input.maxLength);
          input.oninput();
          input.focus();
        };
      });
      form.onsubmit = event => {
        event.preventDefault();
        if (editor.draft.trim()) send(null,editor);
      };
      return;
    }
    form.querySelectorAll('[data-preview-field]').forEach(input => {
      input.oninput = () => { editor.values[input.dataset.previewField] = input.value; };
    });
    form.onsubmit = event => {
      event.preventDefault();
      if (state.busy || state.importBusy) return;
      let saved = true;
      if (editor.key === 'original') {
        const text = editor.values.original.trim();
        if (!text) { $('preview-original').focus(); return; }
        if (state.input.resume !== text) invalidate();
        state.input.resume = text;
        chat.sampleReady = false;
        chat.retry = null;
      } else saved = applySectionEdit(editor.key,editor.values);
      chat.previewEditor = null;
      render();
      focusAction();
      if (saved) toast('简历修改已保存。');
    };
  }

  function bindChoices() {
    const form = $('chatChoiceForm');
    if (!form) return;
    const custom = $('chatChoiceText');
    if (custom) custom.oninput = () => {
      chat.choiceDraft = custom.value;
      $('chatChoiceSubmit').disabled = chat.waitingForService || !chat.choiceDraft.trim();
    };
    form.onsubmit = event => {
      event.preventDefault();
      if (custom) send('choiceDraft');
    };
    form.querySelectorAll('[data-choice]').forEach(button => {
      button.onclick = () => {
        const action = button.dataset.choice;
        if (Object.hasOwn(guides,action)) selectGuide(action,true);
        else if (action.startsWith('upload-')) openFilePicker(action === 'upload-jd' ? 'jd' : 'resume');
        else if (action === 'paste-jd') editMaterial('jd');
        else if (action === 'use-jd' || action === 'use-resume') attach(chat.pendingFile,action.slice(4));
        else if (action === 'cancel-file') {
          chat.pendingFile = null;
          finishTurn('chatUpload');
        } else custom?.focus();
      };
    });
  }

  function bindFollowUps() {
    const report = activeDiagnosis();
    $('diagnosisJobs')?.addEventListener('click',() => {
      send(null,null,{guide:'jobs',message:`请根据简历推荐匹配的岗位方向，重点考虑「${report.direction}」，给出匹配依据和搜索词。`});
    });
    document.querySelectorAll('[data-follow-up]').forEach(button => {
      button.onclick = () => {
        const action = button.dataset.followUp;
        if (Object.hasOwn(guides,action)) {
          selectGuide(action,true);
          return;
        }
        if (!report) return;
        if (action === 'report') {
          focusDiagnosis(true);
        } else if (action === 'direction') {
          if (!state.input.jd) state.input.role = report.direction;
          selectGuide('tailored',true);
        } else if (action === 'weakest') {
          const suggestion = report.suggestions[0];
          const guidance = `${suggestion.title}。修改建议：${suggestion.action}`;
          if (suggestion.section && hasResume()) send(null,{key:suggestion.section,draft:guidance});
          else send(null,null,{guide:'optimize',message:`请优先优化简历中以下问题，保留其他内容。\n${guidance}`});
        }
      };
    });
  }

  function bind() {
    bindPreview();
    $('showChatResume')?.addEventListener('click',openPreview);
    $('startSampleAnalysis')?.addEventListener('click',() => send(null));
    $('retryChatTask')?.addEventListener('click',() => send(null,null,chat.retry));
    const composer = $('chatMessage');
    composer.oninput = () => {
      chat.draft = composer.value;
      $('chatSend').disabled = chat.waitingForService || !chat.draft.trim();
    };
    $('chatForm').onsubmit = event => { event.preventDefault(); send(); };
    composer.onkeydown = event => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing) {
        event.preventDefault();
        send();
      }
    };
    $('cancelAnalysis')?.addEventListener('click',() => state.controller?.abort());
    if (state.busy || state.importBusy) return;
    bindChoices();
    bindFollowUps();
    document.querySelectorAll('[data-guide]').forEach(button => {
      button.onclick = () => {
        const id = button.dataset.guide;
        selectGuide(id,true);
      };
    });
    document.querySelectorAll('[data-edit-material]').forEach(button => button.onclick = () => editMaterial(button.dataset.editMaterial));
    if ($('chatMaterialEdit')) {
      $('chatCancelEdit').onclick = () => { chat.editingMaterial = null; finishTurn('chatChoiceHeading'); };
      $('chatMaterialEdit').onsubmit = event => {
        event.preventDefault();
        const key = chat.editingMaterial;
        const value = $('chatMaterialText').value.trim();
        if (!value) { $('chatMaterialText').focus(); return; }
        const changed = storeMaterial(key,value);
        if (key === 'resume') revealPreview();
        chat.editingMaterial = null;
        chat.sampleReady = false;
        chat.retry = null;
        addMessage('assistant',`已更新${materials[key]}。`);
        if (startAfterMaterial(key,changed)) send(null);
        else finishTurn('chatChoiceHeading');
      };
    }
    $('chatToggleGuides')?.addEventListener('click',() => {
      chat.guidesOpen = !chat.guidesOpen;
      render();
      $('chatToggleGuides')?.focus();
    });
    $('chatUpload').onclick = () => openFilePicker();
    $('chatFile').oncancel = () => { chat.pickerKind = null; };
    $('chatFile').onchange = event => {
      const kind = chat.pickerKind;
      chat.pickerKind = null;
      attach(event.target.files[0], kind ?? undefined);
    };
    const form = $('chatForm');
    form.ondragover = event => {
      if (!Array.from(event.dataTransfer.types).includes('Files')) return;
      event.preventDefault();
      form.classList.add('chat-drop-target');
    };
    form.ondragleave = event => {
      if (!form.contains(event.relatedTarget)) form.classList.remove('chat-drop-target');
    };
    form.ondrop = event => {
      const [file] = event.dataTransfer.files;
      if (!file) return;
      event.preventDefault();
      form.classList.remove('chat-drop-target');
      attach(file);
    };
    document.querySelectorAll('[data-remove-file]').forEach(button => button.onclick = () => {
      const key = button.dataset.removeFile;
      delete chat.files[key];
      storeMaterial(key,'');
      if (key === 'resume') chat.previewEditor = null;
      if (chat.editingMaterial === key) chat.editingMaterial = null;
      chat.sampleReady = false;
      chat.retry = null;
      finishTurn();
    });
  }

  function bindRail() {
    const focusComposer = () => {
      $('chatForm')?.scrollIntoView({block:'nearest'});
      $('chatMessage')?.focus({preventScroll:true});
    };
    $('chatHome').onclick = focusComposer;
    $('railConversation').onclick = focusComposer;
    $('railGuides').onclick = () => {
      if (state.busy || state.importBusy) return;
      chat.guidesOpen = true;
      render();
      document.querySelector('.chat-quick-guides')?.scrollIntoView({block:'nearest'});
      document.querySelector('[data-guide]')?.focus({preventScroll:true});
    };
    $('railSettings').onclick = () => $('settingsBtn').click();
    $('chatMyResume').onclick = () => {
      if (state.busy || state.importBusy) return;
      if (hasResume() || state.input.resume) openPreview();
      else selectGuide('optimize');
    };
  }

  function analysisFinished() {
    revealPreview();
    chat.nextActions = undefined;
    addMessage('assistant','分析完成。可以查看 JD 分析、补充经历，或直接打开优化后的简历。',state.result.diagnosis.summary,executionSummary());
  }

  function useSample() {
    if (state.busy || state.importBusy) return;
    if (state.editing) saveResumeEdits();
    invalidate();
    state.step = 0;
    state.input = {...ResumeData.sample};
    revealPreview();
    state.error = '';
    chat.files = {};
    chat.pendingFile = null;
    chat.guide = 'tailored';
    chat.startOnImport = false;
    chat.roleFromJD = false;
    chat.draft = guides.tailored.request;
    chat.choiceDraft = '';
    chat.guidesOpen = false;
    chat.sampleReady = true;
    chat.retry = null;
    chat.editingMaterial = null;
    addMessage('assistant','已载入示例简历和岗位描述。');
    finishTurn('startSampleAnalysis');
  }
  const title = () => guides[chat.guide]?.title || '简历会话';
  return {view,previewView,bind,bindRail,title,analysisFinished,useSample,restoreDraft:revealPreview};
})();
