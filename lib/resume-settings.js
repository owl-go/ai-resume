'use strict';
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const {parseEnv}=require('node:util');
const {randomUUID}=require('node:crypto');
const {ResumeError}=require('./resume-error');
const {readProjectPrompt,PROMPT_VARIABLES,validateTemplate}=require('./resume-prompts');
const {validateCreditRate}=require('./resume-credits');
const configFile=()=>process.env.RESUME_SETTINGS_FILE||path.join(__dirname,'../.local/resume-expert/settings.json');
function readSaved(){try{const v=JSON.parse(fs.readFileSync(configFile(),'utf8'));if(v.version!==1)throw new Error('version');return v;}catch(e){if(e.code==='ENOENT')return {};throw new ResumeError('CONFIG_INVALID','本机简历设置无法读取，请检查设置文件。',503);}}
function validateURL(raw,allowInsecure=false){let url;try{url=new URL(raw);}catch{throw new ResumeError('CONFIG_INVALID','请输入有效的模型 API 地址。');}if(url.username||url.password||url.search||url.hash||url.protocol!=='https:' && !(url.protocol==='http:'&&(allowInsecure||['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new ResumeError('CONFIG_INVALID','请使用 HTTPS 地址，本机调试可使用 localhost HTTP；地址不得包含凭证或查询参数。');url.pathname=url.pathname.replace(/\/+$/,'').replace(/\/chat\/completions$/,'');return url.href.replace(/\/$/,'');}
function readSettings(){let local={};try{local=parseEnv(fs.readFileSync(path.join(__dirname,'../.env.local'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw new ResumeError('CONFIG_INVALID','无法读取本机模型环境配置。',503);}
const env=k=>(process.env[k]??local[k]??'').trim(),saved=readSaved();
const allowInsecure=env('OPENAI_ALLOW_INSECURE_HTTP')==='1';
const baseURL=validateURL(saved.baseURL??(env('OPENAI_BASE_URL')||'https://api.openai.com/v1'),allowInsecure);
const key=saved.apiKey??env('OPENAI_API_KEY'),model=saved.model??(env('OPENAI_TEXT_MODEL')||'gpt-5.4-mini');
if(!/^[\w./:-]{1,100}$/.test(model)||/\s/.test(key))throw new ResumeError('CONFIG_INVALID','模型名称或密钥配置不正确。',503);
const performance=validatePerformance(saved.reasoningEffort??'auto',saved.timeoutMs??240000);
const promptSource=env('RESUME_PROMPT_SOURCE')||(env('NODE_ENV')==='production'?'settings':'project');
if(!['project','settings'].includes(promptSource))throw new ResumeError('CONFIG_INVALID','RESUME_PROMPT_SOURCE 须为 project 或 settings。',503);
return {key,model,baseURL,allowInsecure,...performance,creditsPer10kTokens:validateCreditRate(saved.creditsPer10kTokens??1),endpoint:baseURL+'/chat/completions',provider:new URL(baseURL).hostname,prompts:{analysis:saved.prompts?.analysis},promptSource,source:saved.version?'本机设置':'环境变量 / 默认值'};
}
function publicSettings(c=readSettings(), defaultTemplate=readProjectPrompt('main')) {
  const defaults = { analysis: defaultTemplate };
  return {
    baseURL:c.baseURL,model:c.model,apiKeyConfigured:!!c.key,
    prompts:{analysis:c.prompts.analysis??defaults.analysis},
    reasoningEffort:c.reasoningEffort,timeoutMs:c.timeoutMs,creditsPer10kTokens:c.creditsPer10kTokens??1,defaults,variables:PROMPT_VARIABLES,source:c.source,
    promptSource:c.promptSource,hasSavedPrompt:c.prompts.analysis!=null
  };
}
function validatePerformance(reasoningEffort,timeoutMs){if(!['auto','low','medium','high'].includes(reasoningEffort))throw new ResumeError('INVALID_INPUT','请选择默认、低、中或高推理强度。');if(!Number.isInteger(timeoutMs)||timeoutMs<30000||timeoutMs>300000)throw new ResumeError('INVALID_INPUT','模型等待上限应为 30–300 秒。');return {reasoningEffort,timeoutMs};}
function validateSettings(v){if(!v||typeof v!=='object'||Array.isArray(v))throw new ResumeError('INVALID_INPUT','设置格式不正确。');const previous=readSettings();const baseURL=validateURL(typeof v.baseURL==='string'?v.baseURL.trim():previous.baseURL,previous.allowInsecure),model=typeof v.model==='string'?v.model.trim():previous.model;if(!/^[\w./:-]{1,100}$/.test(model))throw new ResumeError('INVALID_INPUT','模型名称不能为空，且最多 100 个字符。');
let apiKey=previous.key;if(v.apiKey!==undefined){if(typeof v.apiKey!=='string'||v.apiKey.length>2000||/\s/.test(v.apiKey))throw new ResumeError('INVALID_INPUT','API Key 格式不正确。');if(v.apiKey)apiKey=v.apiKey;}
if(v.clearApiKey===true)apiKey='';
const prompts={...previous.prompts};if(v.prompts!==undefined){if(!v.prompts||typeof v.prompts!=='object')throw new ResumeError('INVALID_INPUT','提示词格式不正确。');prompts.analysis=validateTemplate(v.prompts.analysis).trim();}
return {version:1,baseURL,model,apiKey,prompts,creditsPer10kTokens:validateCreditRate(v.creditsPer10kTokens??previous.creditsPer10kTokens),...validatePerformance(v.reasoningEffort??previous.reasoningEffort,v.timeoutMs??previous.timeoutMs)};
}
async function saveSettings(v){const config=validateSettings(v),defaultTemplate=readProjectPrompt('main'),file=configFile(),dir=path.dirname(file),tmp=path.join(dir,`.settings-${randomUUID()}.tmp`);await fsp.mkdir(dir,{recursive:true,mode:0o700});try{await fsp.writeFile(tmp,JSON.stringify(config,null,2),{mode:0o600,flag:'wx'});await fsp.rename(tmp,file);}finally{await fsp.rm(tmp,{force:true});}return publicSettings(readSettings(),defaultTemplate);}
module.exports={readSettings,publicSettings,validateSettings,saveSettings};
