'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { ResumeError } = require('./resume-error');
const {randomUUID} = require('node:crypto');
const {createUsageStore,normalizeUsage} = require('./resume-credits');
const {imageDescriptor} = require('./resume-image');
const {mergeJDText} = require('../dist/resume-materials');
const { RESULT_SHAPE } = require('./resume-contract');
const { sections: resumeSections } = require('../dist/resume-format');
const { renderResumePdf } = require('./resume-pdf');
const { renderResumeDocx } = require('./resume-docx');
const {bindPrompt,readProjectPrompt,activeMainPrompt}=require('./resume-prompts');
const MAX_FILE = 8 * 1024 * 1024;
const {readSettings:settings,publicSettings,validateSettings,saveSettings}=require('./resume-settings');

function text(v, label, max = 50000, required = true) {
  if (typeof v !== 'string' || v.length > max || (required && !v.trim())) throw new ResumeError('INVALID_INPUT', `${label}为空、格式错误或超出 ${max} 字限制。`);
  return v.trim();
}
function validateInput(v, required = true, currentResume) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ResumeError('INVALID_INPUT', '请填写目标岗位、JD 和简历。');
  const currentResumeText = currentResume == null ? undefined : resumeText(resumeData(currentResume));
  if (required && currentResumeText === '') throw new ResumeError('INVALID_INPUT','当前简历稿为空，请先补充内容。');
  const input = Object.fromEntries(['role', 'industry', 'company', 'stage', 'focus', 'jd', 'resume', 'extra','projects','skills','results','boundaries','length'].map(k => {
    if (k === 'resume' && currentResumeText !== undefined) return [k,currentResumeText];
    return [k,text(v[k] ?? '', k, ['jd','resume'].includes(k) ? 50000 : k === 'extra' ? 10000 : ['projects','skills','results','boundaries'].includes(k) ? 5000 : 500, required && ['role','jd','resume'].includes(k))];
  }));
  input.length=input.length||'不限制';
  if(!['一页','两页','不限制'].includes(input.length))throw new ResumeError('INVALID_INPUT','简历目标长度请选择一页、两页或不限制。');
  return input;
}
function validateAnswers(value, required=false){
  if(value===undefined&&!required)return [];
  if(!Array.isArray(value)||value.length>10||(required&&!value.length))throw new ResumeError('INVALID_INPUT','请填写 1–10 条经历回答。');
  return value.map(x=>({question:text(x?.question,'问题',1000),answer:text(x?.answer,'回答',3000)}));
}
function validateShape(value, reference, depth = 0) {
  if (depth > 9) throw new Error('depth');
  if (Array.isArray(reference)) {
    if (!Array.isArray(value) || value.length < 1 || value.length > 30) throw new Error('array');
    value.forEach(x => validateShape(x, reference[0], depth + 1));
  } else if (reference && typeof reference === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object');
    for (const k of Object.keys(reference)) validateShape(value[k], reference[k], depth + 1);
  } else if (typeof reference === 'number') {
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('score');
  } else if (typeof value !== 'string' || value.length > 16000) throw new Error('text');
  return value;
}
function validateResult(v) {
  try {
    validateShape(v, RESULT_SHAPE);
    if (v.questions.length < 5 || v.questions.length > 10 || v.interview.questions.length !== 10 || v.jd.competencies.length!==5 || v.diagnosis.dimensions.length!==10 || v.matches.some(x=>!['强','中','弱','无'].includes(x.strength))) throw new Error('count');
    return v;
  } catch { throw new ResumeError('INVALID_RESULT', '模型结果结构不完整。请检查模型输出后重试。', 502); }
}
function schema(v) {
  if (Array.isArray(v)) return [schema(v[0])];
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k,x]) => [k,schema(x)]));
  return typeof v === 'number' ? 0 : '中文字符串';
}
const CHAT_INTENTS = ['optimize','diagnose','jobs','tailored','style','other'];
const RESUME_NEXT_ACTIONS = ['diagnose','jobs','tailored','style'];
const DIAGNOSIS_SUMMARY_KEYS = ['evidence','direction','deductions','priority'];
const CHAT_PAGES = ['jd','diagnosis','match','questions','rewrite','resume','interview'];
const RESUME_LAYOUTS = Object.keys(require('../dist/resume-format').layouts);

function resumeData(resume) {
  if (!resume || typeof resume !== 'object' || Array.isArray(resume)) throw new ResumeError('INVALID_INPUT','缺少简历内容。');
  return Object.fromEntries(Object.keys(RESULT_SHAPE.resume).map(key => [key, text(resume[key] ?? '',key,key==='name'?100:16000,false)]));
}

function resumeText(resume) {
  const profile = [resume.name,resume.contact].filter(Boolean).join('\n');
  const sections = resumeSections.filter(([key]) => resume[key]).map(([key,title]) => `${title}\n${resume[key]}`);
  return [profile,...sections].filter(Boolean).join('\n\n');
}

function chatInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ResumeError('INVALID_INPUT','会话请求格式不正确。');
  const message = text(body.message, '会话消息', 50000);
  const guide = body.guide ?? '';
  const history = body.history ?? [];
  if ((guide !== '' && !CHAT_INTENTS.includes(guide)) || !Array.isArray(history) || history.length > 8) {
    throw new ResumeError('INVALID_INPUT','会话上下文格式不正确。');
  }
  return {
    message,
    guide,
    input:validateInput(body.input ?? {}, false),
    startTailored:guide === 'tailored' && body.startTailored === true,
    roleFromJD:body.roleFromJD === true,
    currentResume:body.currentResume == null ? null : resumeData(body.currentResume),
    hasReport:body.hasReport === true,
    history:history.map(item => {
      if (!['user','assistant'].includes(item?.role)) throw new ResumeError('INVALID_INPUT','会话角色不正确。');
      return {role:item.role,text:text(item.text,'会话记录',3000)};
    })
  };
}

function validateResumeDiagnosis(value) {
  const score = v => {
    if (!Number.isInteger(v) || v < 0 || v > 100) throw new Error('invalid diagnosis score');
    return v;
  };
  if (!Array.isArray(value.suggestions) || value.suggestions.length < 1 || value.suggestions.length > 5) throw new Error('invalid suggestions');
  const dimensions = Object.fromEntries(['content','screening','fit'].map(key => [key,{
    score:score(value.dimensions[key].score),
    reason:text(value.dimensions[key].reason,'评分依据',900)
  }]));
  const suggestions = value.suggestions.map(item => ({
    title:text(item.title,'修改问题',120),
    action:text(item.action,'修改建议',800),
    section:['intent','summary','coreAbilities','experience','projects','skills','education','additional'].includes(item.section) ? item.section : ''
  }));
  return {
    direction:text(value.direction,'岗位方向',120),
    summary:text(value.summary,'诊断结论',800),
    score:score(value.score),
    dimensions,
    suggestions
  };
}

function validateChat(result, request) {
  try {
    const {intent, materials = {}} = result;
    if (!CHAT_INTENTS.includes(intent) || !materials || typeof materials !== 'object' || Array.isArray(materials)) throw new Error('chat shape');
    let reply = text(result.reply,'会话回复',12000);
    let approach = typeof result.approach === 'string' && result.approach.length <= 600
      ? result.approach.trim() : '';
    const updates = {};
    for (const [key,limit] of Object.entries({jd:50000,resume:50000,focus:500,extra:10000,role:500})) {
      if (intent === 'style' && (key === 'role' || key === 'jd')) continue;
      if (key === 'role' && request.startTailored) continue;
      if (!materials[key]) continue;
      const value = text(materials[key],key,limit);
      const source = key === 'role' && updates.jd ? request.message.replace(updates.jd,'\n') : request.message;
      if (source.includes(value)) updates[key] = value;
    }
    const jd = updates.jd ?? request.input.jd;
    const previousRole = request.roleFromJD && jd !== request.input.jd ? '' : request.input.role;
    let roleFromJD = false;
    if (intent === 'tailored' && !updates.role && !previousRole && materials.role) {
      const title = text(materials.role,'岗位名称',500);
      if (jd.includes(title)) {
        updates.role = title;
        roleFromJD = true;
      }
    }
    if (!previousRole && request.input.role && !updates.role) updates.role = '';
    const input = {...request.input,...updates};
    const existingDraft = request.currentResume && (!updates.resume || updates.resume === request.input.resume);
    const hasMaterial = existingDraft ? Object.values(request.currentResume).some(Boolean) : Boolean(input.resume);
    const ready = !!(input.role && input.jd && hasMaterial);
    if (intent === 'tailored' && !ready) {
      approach = '';
      if (!hasMaterial) reply = '请上传简历或粘贴简历正文。';
      else if (!input.jd) reply = '请补充完整的岗位描述（JD）。';
      else reply = '岗位描述已收到，请确认目标岗位名称。';
    }
    const analyze = intent === 'tailored' && ready && (request.startTailored || result.analyze === true);
    if (analyze && request.startTailored) reply = `目标岗位为「${input.role}」。开始定向分析。`;
    const resume = result.resume && hasMaterial && ['optimize','style'].includes(intent) && !(intent === 'style' && existingDraft)
      ? resumeData(validateShape(result.resume, RESULT_SHAPE.resume))
      : null;
    if (resume && !Object.values(resume).some(Boolean)) throw new Error('empty resume');
    const layout = intent === 'style' && (resume || existingDraft) && RESUME_LAYOUTS.includes(result.layout) ? result.layout : null;
    const open = CHAT_PAGES.includes(result.open) && (request.hasReport || result.open === 'resume' && request.currentResume) ? result.open : null;
    const diagnosis = intent === 'diagnose' && hasMaterial ? validateResumeDiagnosis(result.diagnosis) : null;
    const analysisSummary = diagnosis && DIAGNOSIS_SUMMARY_KEYS.flatMap(key => {
      const value = result.analysisSummary?.[key];
      return typeof value === 'string' && value.trim() && value.length <= 600 ? [[key,value.trim()]] : [];
    });
    const nextActions = resume && Array.isArray(result.nextActions)
      ? [...new Set(result.nextActions.filter(action => RESUME_NEXT_ACTIONS.includes(action)))].slice(0,3) : [];
    return {intent,reply,materials:updates,analyze,resume,layout,open,...(roleFromJD ? {roleFromJD} : {}),...(approach ? {approach} : {}),
      ...(diagnosis ? {diagnosis} : {}),...(analysisSummary?.length ? {analysisSummary:Object.fromEntries(analysisSummary)} : {}),
      ...(nextActions.length ? {nextActions} : {})};
  } catch {
    throw new ResumeError('INVALID_RESULT','模型会话结果不完整，请重试。',502);
  }
}
async function readBody(request, max) {
  if (Number(request.headers['content-length']) > max) throw new ResumeError('BODY_TOO_LARGE', '上传内容超出大小限制。', 413);
  const chunks=[]; let size=0;
  const timer = setTimeout(() => request.destroy(), 30000);
  try { for await (const chunk of request) { size += chunk.length; if (size > max) throw new ResumeError('BODY_TOO_LARGE', '上传内容超出大小限制。', 413); chunks.push(chunk); } return Buffer.concat(chunks); }
  finally { clearTimeout(timer); }
}
async function readJSON(request) {
  if (!/^application\/json\b/i.test(request.headers['content-type'] || '')) throw new ResumeError('INVALID_INPUT', '请使用 JSON 请求。', 415);
  const bytes = await readBody(request, 600000);
  try { return JSON.parse(bytes); } catch { throw new ResumeError('INVALID_INPUT', '请求数据无法读取。'); }
}
async function boundedJSON(response) {
  if (!response.body) throw new ResumeError('UPSTREAM_EMPTY', '模型服务返回空响应。', 502);
  const reader=response.body.getReader(), chunks=[]; let size=0;
  try { while (true) { const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>600000) { await reader.cancel(); throw new ResumeError('UPSTREAM_LARGE', '模型结果过长，请缩短输入。', 502); } chunks.push(value); } return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch(e) { if(e instanceof ResumeError)throw e; throw new ResumeError('UPSTREAM_INVALID','模型服务返回格式错误，请重试。',502); }
  finally { reader.releaseLock(); }
}

async function completionStream(response, onContent, onUsage) {
  const decoder = new TextDecoder();
  let pending = '';
  let content = '';
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > 6000000) throw new ResumeError('UPSTREAM_LARGE','模型结果过长，请缩短输入。',502);
    pending += decoder.decode(chunk,{stream:true});
    let separator;
    while ((separator = /\r?\n\r?\n/.exec(pending))) {
      const data = pending.slice(0,separator.index).split(/\r?\n/)
        .filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      pending = pending.slice(separator.index + separator[0].length);
      if (!data) continue;
      if (data === '[DONE]') return content;
      let event;
      try { event = JSON.parse(data); }
      catch { throw new ResumeError('UPSTREAM_INVALID','模型服务返回格式错误，请重试。',502); }
      if (event?.error) throw new ResumeError('MODEL_ERROR','模型服务中断了生成，请重试。',502);
      if (event?.usage) onUsage?.(event.usage);
      const delta = event?.choices?.[0]?.delta?.content;
      if (typeof delta !== 'string' || !delta) continue;
      content += delta;
      if (content.length > 600000) throw new ResumeError('UPSTREAM_LARGE','模型结果过长，请缩短输入。',502);
      onContent(content);
    }
  }
  return content;
}

const PUBLIC_FIELD = /\s*,?\s*"([a-zA-Z]+)"\s*:\s*/y;
const SCOPE_END = /\s*\}/y;
const STRING_PREFIX = /"((?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*)(")?/y;

function chatProgress(emit) {
  let offset = 0;
  let scope = '';
  let sentLength = 0;
  let reportStarted = false;
  return content => {
    if (reportStarted) return;
    if (!offset) {
      const start = /^\s*\{/.exec(content);
      if (!start) return;
      offset = start[0].length;
    }
    // The prompt places the public strings and resume before optional metadata.
    // Only these allowlisted fields are forwarded, and only the final JSON can be saved.
    while (offset < content.length) {
      if (scope) {
        SCOPE_END.lastIndex = offset;
        if (SCOPE_END.test(content)) {
          scope = '';
          offset = SCOPE_END.lastIndex;
          continue;
        }
      }
      PUBLIC_FIELD.lastIndex = offset;
      const key = PUBLIC_FIELD.exec(content)?.[1];
      if (!key) return;
      STRING_PREFIX.lastIndex = PUBLIC_FIELD.lastIndex;
      if (!scope && key === 'diagnosis' && content[STRING_PREFIX.lastIndex] === '{') {
        reportStarted = true;
        emit({type:'diagnosis'});
        return;
      }
      if (!scope && ['resume','analysisSummary'].includes(key) && content[STRING_PREFIX.lastIndex] === '{') {
        offset = STRING_PREFIX.lastIndex + 1;
        scope = key;
        continue;
      }
      const match = STRING_PREFIX.exec(content);
      if (!match) return;
      let type = '';
      if (scope === 'resume' && Object.hasOwn(RESULT_SHAPE.resume,key)) type = 'resume';
      if (scope === 'analysisSummary' && DIAGNOSIS_SUMMARY_KEYS.includes(key)) type = 'analysis';
      if (!scope && ['approach','reply'].includes(key)) type = key;
      if (type) {
        const limit = {approach:600,analysis:600,reply:12000,resume:key === 'name' ? 100 : 16000}[type];
        const value = JSON.parse(`"${match[1]}"`).slice(0,limit).replace(/[\uD800-\uDBFF]$/,'');
        if (value.length > sentLength) {
          const text = value.slice(sentLength);
          sentLength = value.length;
          emit(type === 'resume' || type === 'analysis' ? {type,key,text} : {type,text});
        }
      }
      if (!match[2]) return;
      offset = STRING_PREFIX.lastIndex;
      sentLength = 0;
    }
  };
}

async function complete(system, payload, signal, fetchFn, c, onContent, onUsage) {
  if (!c.key) throw new ResumeError('NOT_CONFIGURED','尚未配置模型密钥，请先在设置中配置模型 API。',503);
  let response;
  const timeoutSignal=AbortSignal.timeout(c.timeoutMs??240000);
  try {
    response=await fetchFn(c.endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${c.key}`},signal:AbortSignal.any([signal,timeoutSignal]),body:JSON.stringify({model:c.model,store:false,...(onContent ? {stream:true,stream_options:{include_usage:true}} : {}),...(c.reasoningEffort&&c.reasoningEffort!=='auto'?{reasoning_effort:c.reasoningEffort}:{}),response_format:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:Array.isArray(payload)?payload:JSON.stringify(payload)}]})});
    if (!response.ok) {
      await response.body?.cancel();
      const status = response.status;
      if (status >= 500) throw new ResumeError('MODEL_ERROR',`模型服务暂时不可用（${status}），请稍后重试。`,502);
      const hint = status === 429 ? '模型服务繁忙或额度受限，请稍后再试。'
        : status === 401 || status === 403 ? '密钥无效或无权访问此模型，请检查设置。'
        : status === 404 ? '模型或接口地址不可用，请检查模型设置。'
        : c.imageInput ? '模型或接口未能处理图片，请选择支持图片输入的模型，并检查图片是否完整。' : '请求被模型服务拒绝，请检查地址、模型和 JSON 输出兼容性。';
      throw new ResumeError('MODEL_ERROR',`模型请求失败（${status}）。${hint}`,502);
    }
    let content;
    if (onContent && response.body && /^text\/event-stream\b/i.test(response.headers.get('content-type') || '')) {
      content = await completionStream(response,onContent,onUsage);
    } else {
      const data = await boundedJSON(response);
      if (data?.usage) onUsage?.(data.usage);
      content = data?.choices?.[0]?.message?.content;
    }
    if(typeof content!=='string') throw new ResumeError('INVALID_RESULT','模型未返回可用分析，请重试。',502);
    try { return JSON.parse(content); } catch { throw new ResumeError('INVALID_RESULT','模型结果不是有效 JSON，请重试。',502); }
  } catch(e) {
    if(signal.aborted)throw new ResumeError('CANCELLED','分析已取消。',499);
    if(timeoutSignal.aborted)throw new ResumeError('MODEL_TIMEOUT',`模型未在 ${Math.round((c.timeoutMs??240000)/1000)} 秒内完成，请调整高级设置或使用更快的模型。`,504);
    if(e instanceof ResumeError)throw e;
    throw new ResumeError('MODEL_UNAVAILABLE', '模型连接失败或超时，请检查配置后重试。',502);
  }
}
function extract(bytes,type,signal) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(path.join(__dirname,'resume-import-worker.js'),{workerData:{bytes,type},resourceLimits:{maxOldGenerationSizeMb:128}});
    let settled=false;
    const finish=(err,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);void worker.terminate();err?reject(err):resolve(value);};
    const abort=()=>finish(new ResumeError('CANCELLED','识别已取消。',499));
    const timer=setTimeout(()=>finish(new ResumeError('IMPORT_TIMEOUT','文件识别超时，请使用较小文件或粘贴文本。',408)),15000);
    signal.addEventListener('abort',abort,{once:true});
    worker.on('message',v=>v.error?finish(new ResumeError('IMPORT_FAILED','无法识别此文件。请检查是否损坏或加密，或另存为 PDF / DOCX。')):finish(null,v.text));
    worker.on('error',()=>finish(new ResumeError('IMPORT_FAILED','文件解析失败，请粘贴简历文本后继续。')));
    worker.on('exit',()=>{if(!settled)finish(new ResumeError('IMPORT_FAILED','文件解析意外结束，请重试。'));});
    if(signal.aborted)abort();
  });
}
function fontPath(family = 'sans') {
  const bundled = {fangsong:'FandolFang-Regular.otf',kaiti:'FandolKai-Regular.otf',roboto:'Roboto-Regular.ttf',opensans:'OpenSans-Regular.ttf',lato:'Lato-Regular.ttf'};
  if (Object.hasOwn(bundled,family)) {
    const file=path.join(__dirname,'../dist/fonts',bundled[family]);
    if (!fs.existsSync(file)) throw new ResumeError('FONT_UNAVAILABLE','所选字体资源缺失，请重新安装项目字体或更换字体。',503);
    return ['fangsong','kaiti'].includes(family) ? file : {primary:file,fallback:fontPath('sans')};
  }
  if (family === 'arial') {
    const file=[process.env.RESUME_PDF_ARIAL_FONT,'/System/Library/Fonts/Supplemental/Arial.ttf','/usr/share/fonts/truetype/msttcorefonts/Arial.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'].find(value=>value&&fs.existsSync(value));
    if (!file) throw new ResumeError('FONT_UNAVAILABLE','Arial 导出字体未配置，请设置 RESUME_PDF_ARIAL_FONT 或选择项目自带字体。',503);
    return {primary:file,fallback:fontPath('sans')};
  }
  if (family === 'serif') {
    const candidates = [process.env.RESUME_PDF_SERIF_FONT,path.join(__dirname,'../assets/fonts/NotoSerifSC-Regular.ttf'),'/System/Library/Fonts/Supplemental/Songti.ttc'];
    const file = candidates.find(value=>value && fs.existsSync(value));
    if (!file) throw new ResumeError('FONT_UNAVAILABLE','宋体导出字体未配置，请设置 RESUME_PDF_SERIF_FONT 或选择黑体。',503);
    return file.endsWith('.ttc') ? {path:file,family:process.env.RESUME_PDF_SERIF_FACE || 'STSongti-SC-Regular'} : file;
  }
  const candidates=[process.env.RESUME_PDF_FONT,path.join(__dirname,'../assets/fonts/NotoSansSC-Regular.ttf'),'/System/Library/Fonts/Supplemental/Arial Unicode.ttf','/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'];
  const found=candidates.find(p=>p && fs.existsSync(p));
  if(!found)throw new ResumeError('FONT_UNAVAILABLE','PDF 中文字体未配置，请设置 RESUME_PDF_FONT 或先导出 Word。',503);
  return found;
}
async function exportDocument(format, resume, layout, appearance) {
  const v=resumeData(resume);
  let style;
  try { style = require('../dist/resume-format').appearanceFor(appearance); }
  catch (error) { throw new ResumeError('INVALID_INPUT',error.message); }
  if(layout!==undefined&&!RESUME_LAYOUTS.includes(layout))throw new ResumeError('INVALID_INPUT','请选择有效的简历版式。');
  if(format==='docx') return {bytes:await renderResumeDocx(v,layout,style),mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
  if(format!=='pdf')throw new ResumeError('INVALID_INPUT','请选择 PDF 或 Word 格式。');
  return {bytes:await renderResumePdf(v,layout,fontPath(style.font),style),mime:'application/pdf'};
}
function createResumeService({fetchFn=fetch,readPrompt=readProjectPrompt,usageStore=createUsageStore()}={}) {
  let active=false;
  async function metered(operation,config,signal,task) {
    let usage = null, result, failure;
    const id = randomUUID();
    try { result = await task(value => { usage = normalizeUsage(value); }); }
    catch (error) { failure = error; }
    if (failure && ['NOT_CONFIGURED','CONFIG_INVALID','INVALID_INPUT'].includes(failure.code)) throw failure;
    const entryData = {id,operation,model:config.model,usage,creditsPer10kTokens:config.creditsPer10kTokens??1,
      outcome:signal.aborted ? 'cancelled' : failure ? 'failed' : 'completed'};
    if (failure && signal.aborted) {
      // Cancellation must release the model lock without waiting for disk I/O.
      void usageStore.record(entryData).catch(() => {});
      throw failure;
    }
    let consumption;
    try {
      const entry = await usageStore.record(entryData);
      consumption = {id:entry.id,usage:entry.usage,credits:entry.credits,creditUnits:entry.creditUnits,
        creditsPer10kTokens:entry.creditsPer10kTokens,recorded:true};
    } catch {
      consumption = {id,usage,credits:null,recorded:false,message:'本次用量未能保存，请检查本机积分记录。'};
    }
    if (failure) throw failure;
    return {result,consumption};
  }
  const json=(res,status,v)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(v));};
  return {async handle(req,res,url){
    if(url==='/api/resume/settings' && req.method==='GET')return json(res,200,publicSettings());
    if(url==='/api/resume/usage' && req.method==='GET')return json(res,200,await usageStore.summary());
    if(url==='/api/resume/status' && req.method==='GET'){const c=settings();return json(res,200,{configured:!!c.key,model:c.model,provider:c.provider,busy:active});}
    if(!['/api/resume/analyze','/api/resume/refine','/api/resume/chat','/api/resume/import','/api/resume/export','/api/resume/settings','/api/resume/test','/api/resume/prompt-preview'].includes(url))throw new ResumeError('NOT_FOUND','简历接口不存在。',404);
    if(req.method!=='POST')throw new ResumeError('METHOD_NOT_ALLOWED','此接口仅支持 POST。',405);
    if(req.headers['x-resume-request']!=='1')throw new ResumeError('REQUEST_DENIED','请从简历工作台提交。',403);
    const controller=new AbortController(),disconnected=()=>{if(!res.writableEnded)controller.abort();};res.on('close',disconnected);
    try {
      if(url==='/api/resume/import'){
        if(!/^multipart\/form-data;\s*boundary=/i.test(req.headers['content-type']||''))throw new ResumeError('INVALID_INPUT','请上传文档或图片。',415);
        const body=await readBody(req,24*1024*1024+100000);let form;
        try{form=await new Request('http://localhost/upload',{method:'POST',headers:{'content-type':req.headers['content-type']},body}).formData();}catch{throw new ResumeError('INVALID_INPUT','上传表单无法读取。');}
        const files=form.getAll('resume');
        if (!files.length || files.length>10 || files.some(file=>!file || typeof file.arrayBuffer!=='function' || !file.size || file.size>MAX_FILE)) throw new ResumeError('INVALID_FILE','图片每批最多 10 张、每张不超过 8 MB；文档请单独上传。');
        if (files.reduce((sum,file)=>sum+file.size,0)>24*1024*1024) throw new ResumeError('INVALID_FILE','每批图片合计不能超过 24 MB。');
        const file=files[0];
        const bytes=Buffer.from(await file.arrayBuffer()),ext=path.extname(file.name).toLowerCase();
        if (/^\.(png|jpe?g|webp)$/.test(ext)) {
          const images=[];
          for (let index=0;index<files.length;index++) {
            const current=files[index];
            if (!/^\.(png|jpe?g|webp)$/i.test(path.extname(current.name))) throw new ResumeError('INVALID_FILE','多文件识别仅支持图片，请将 PDF / Word 单独上传。');
            const data=index===0?bytes:Buffer.from(await current.arrayBuffer());
            const image=imageDescriptor(data);
            if (!image) throw new ResumeError('INVALID_IMAGE',`第 ${index+1} 张不是有效的 PNG、JPEG 或 WebP 图片。`);
            images.push({...image,bytes:data});
          }
          const hint = form.get('kind');
          if (hint !== null && !['jd','resume'].includes(hint)) throw new ResumeError('INVALID_INPUT','图片用途无效。');
          if (active) throw new ResumeError('SERVICE_BUSY','已有简历任务正在处理，请稍后重试。',409);
          const config = {...settings(),imageInput:true};
          active = true;
          try {
            const {result,consumption} = await metered('ocr',config,controller.signal,async capture=>{
              const output = await complete(readPrompt('recognize'),images.flatMap((image,index)=>[
                {type:'text',text:`第 ${index+1}/${images.length} 张，按此顺序识别。用途提示：${hint || '自动判断'}。请为每一张返回 pages 中对应的文字。`},
                {type:'image_url',image_url:{url:`data:${image.mime};base64,${image.bytes.toString('base64')}`,detail:'high'}}
              ]),controller.signal,fetchFn,config,undefined,capture);
              if (!output || !['jd','resume','unknown'].includes(output.kind)) throw new ResumeError('INVALID_RESULT','图片识别结果格式不完整，请重试。',502);
              const pages=Array.isArray(output.pages)?output.pages:images.length===1&&typeof output.text==='string'?[{text:output.text}]:null;
              if (!pages || pages.length!==images.length || pages.some(page=>typeof page?.text!=='string'||page.text.length>50000)) throw new ResumeError('INVALID_RESULT','部分图片缺少识别结果，原有内容已保留，请重试。',502);
              let text='';
              for (let index=0;index<pages.length;index++) {
                const content=pages[index].text.replace(/\u0000/g,'').trim();
                if (!content) throw new ResumeError('NO_TEXT',`第 ${index+1} 张未识别到文字，原有内容已保留，请使用清晰截图。`);
                try {text=mergeJDText(text,content);} catch(error) {throw new ResumeError('FILE_TOO_LONG',error.message);}
              }
              if (text.length<10) throw new ResumeError('NO_TEXT','图片中未识别到足够文字，请使用清晰截图，或直接粘贴正文。');
              return {text,kind:output.kind};
            });
            if (!controller.signal.aborted && !res.destroyed) json(res,200,{...result,type:'image',mime:images[0].mime,imageCount:images.length,consumption});
          } finally { active = false; }
          return;
        }
        if (files.length>1) throw new ResumeError('INVALID_FILE','多文件识别仅支持图片，请将 PDF / Word 单独上传。');
        const type=ext==='.pdf'&&bytes.subarray(0,5).toString()==='%PDF-'?'pdf':ext==='.docx'&&bytes[0]===80&&bytes[1]===75?'docx':null;
        if(!type)throw new ResumeError('INVALID_FILE','文件内容与扩展名不匹配，支持 PDF、DOCX、PNG、JPEG 和 WebP。');
        const content=(await extract(bytes,type,controller.signal)).replace(/\u0000/g,'').trim();
        if(content.length>50000)throw new ResumeError('FILE_TOO_LONG','简历超过 50000 字，请精简后重新上传。');
        if(content.length<10)throw new ResumeError('NO_TEXT','未识别到足够文本。扫描版 PDF 请截图后粘贴识别，或上传文字版、粘贴正文。');
        if(!res.destroyed)json(res,200,{text:content,type});return;
      }
      const body=await readJSON(req);
      if(url==='/api/resume/prompt-preview'){
        const input=validateInput(body.input||{},false,body.currentResume),answers=validateAnswers(body.answers);
        const template=body.template===undefined ? activeMainPrompt(settings(),readPrompt) : body.template;
        return json(res,200,bindPrompt(template,input,answers));
      }
      if(url==='/api/resume/settings'){if(active)throw new ResumeError('SERVICE_BUSY','请等待当前分析完成后再修改设置。',409);return json(res,200,await saveSettings(body));}
      if(url==='/api/resume/test'){
        if(active)throw new ResumeError('SERVICE_BUSY','请等待当前任务完成后再测试。',409);
        const v=validateSettings(body),c={key:v.apiKey,model:v.model,endpoint:v.baseURL+'/chat/completions',reasoningEffort:v.reasoningEffort,timeoutMs:v.timeoutMs,creditsPer10kTokens:settings().creditsPer10kTokens};
        active=true;try{const {consumption}=await metered('test',c,controller.signal,async capture=>{const result=await complete('仅返回 JSON 对象 {"ok":true}。',{message:'连接测试'},controller.signal,fetchFn,c,undefined,capture);if(!result||typeof result!=='object')throw new ResumeError('INVALID_RESULT','模型未返回 JSON，请检查接口兼容性。',502);return result;});return json(res,200,{ok:true,model:v.model,consumption});}finally{active=false;}
      }
      if(url==='/api/resume/export'){
        const file=await exportDocument(body.format,body.resume,body.layout,body.appearance);
        if(!res.destroyed){res.writeHead(200,{'Content-Type':file.mime,'Content-Disposition':`attachment; filename="resume.${body.format}"`,'Content-Length':file.bytes.length,'Cache-Control':'no-store'});res.end(file.bytes);}return;
      }
      if(active)throw new ResumeError('SERVICE_BUSY','已有简历任务正在处理，请稍后重试。',409);
      active=true;
      try{
        if(url==='/api/resume/chat'){
          const input=chatInput(body);
          const context = input.currentResume ? {...input,input:{...input.input,resume:''}} : input;
          const config=settings();
          const instruction=`${readPrompt('system')}\n\n${readPrompt('chat')}\n\nresume 字段结构：${JSON.stringify(schema(RESULT_SHAPE.resume))}`;
          const streaming = req.headers.accept === 'application/x-ndjson';
          const emit = event => {
            if (controller.signal.aborted || res.destroyed) return;
            if (!res.headersSent) res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});
            res.write(JSON.stringify(event)+'\n');
          };
          const publishProgress = chatProgress(emit);
          const onContent = content => {
            if (!res.headersSent) emit({type:'generating'});
            publishProgress(content);
          };
          try {
            const {result,consumption}=await metered('chat',config,controller.signal,async capture=>
              validateChat(await complete(instruction,context,controller.signal,fetchFn,config,streaming ? onContent : undefined,capture),input));
            if (controller.signal.aborted || res.destroyed) return;
            if (!res.headersSent) return json(res,200,{result,model:config.model,consumption});
            emit({type:'result',result,model:config.model,consumption});
            res.end();
          } catch (error) {
            if (!res.headersSent) throw error;
            if (controller.signal.aborted || res.destroyed) return;
            emit({type:'error',message:error instanceof ResumeError ? error.message : '服务处理失败，请重试。'});
            res.end();
          }
          return;
        }
        const input=validateInput(body.input,true,body.currentResume);
        const config=settings();
        const template=activeMainPrompt(config,readPrompt);
        const system=readPrompt('system');
        const {result,consumption}=await metered(url==='/api/resume/analyze'?'analyze':'refine',config,controller.signal,async capture=>{
          let result;
          if(url==='/api/resume/analyze'){
            const instruction=`${system}\n\n${readPrompt('analyze')}\n\n输出字段结构：${JSON.stringify(schema(RESULT_SHAPE))}`;
            result=validateResult(await complete(instruction,bindPrompt(template,input),controller.signal,fetchFn,config,undefined,capture));
          }else{
            const answers=validateAnswers(body.answers,true);
            const instruction=`${system}\n\n${readPrompt('refine')}\n\n只输出 {"bullets":["表达"]}。`;
            result=await complete(instruction,bindPrompt(template,input,answers),controller.signal,fetchFn,config,undefined,capture);
            if(!Array.isArray(result.bullets)||result.bullets.length!==answers.length||result.bullets.some(x=>typeof x!=='string'||x.length>1500))throw new ResumeError('INVALID_RESULT','优化表达格式不完整，请重试。',502);
          }
          return result;
        });
        if(!controller.signal.aborted&&!res.destroyed)json(res,200,{result,mode:'ai',model:config.model,consumption});
      }finally{active=false;}
    }finally{res.off('close',disconnected);}
  }};
}
module.exports={createResumeService,validateInput,validateResult,exportDocument};
