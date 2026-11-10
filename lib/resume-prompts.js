'use strict';
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { ResumeError } = require('./resume-error');
const PROMPT_DIRECTORY = path.join(__dirname, '../prompts/resume');
const PROMPT_VARIABLES = [
  ['role','目标岗位'],['industry','目标行业'],['company','目标公司类型'],
  ['stage','求职阶段 / 经验背景'],['focus','希望突出的能力'],['jd','目标岗位 JD'],
  ['resume','当前待优化简历'],['projects','代表项目'],['skills','工具与技能'],
  ['results','有数据结果的经历'],['boundaries','不希望被夸大的地方'],
  ['length','简历目标长度'],['extra','其他补充信息'],['answers','经历追问与回答']
].map(([name,label])=>({name,label,token:`{{${name}}}`}));
const TOKEN_PATTERN=/\{\{([^{}]*)\}\}/g;
function validateTemplate(template){
  if(typeof template!=='string'||!template.trim()||template.length>12000)throw new ResumeError('INVALID_INPUT','每项提示词不能为空，最多 12000 字。');
  const allowed=new Set(PROMPT_VARIABLES.map(x=>x.name));
  const rest=template.replace(TOKEN_PATTERN,(_token,raw)=>{const name=raw.trim();if(!allowed.has(name))throw new ResumeError('INVALID_VARIABLE',`未知提示词变量：${name.slice(0,80)}。请使用变量列表中的名称。`);return '';});
  if(rest.includes('{{')||rest.includes('}}'))throw new ResumeError('INVALID_VARIABLE','变量格式不完整，请使用 {{变量名}}。');
  return template;
}
function bindPrompt(template,input={},answers=[]){
  validateTemplate(template);
  const values=Object.fromEntries(PROMPT_VARIABLES.map(({name})=>[name,typeof input[name]==='string'?input[name]:'']));
  values.length=values.length||'不限制';
  values.answers=answers.length?answers.map((x,i)=>`${i+1}. ${x.question}\n回答：${x.answer}`).join('\n\n'):'尚未回答追问，需要用户确认';
  const used=new Set();
  // One pass: text supplied by a candidate is never reinterpreted as a template.
  const prompt=template.replace(TOKEN_PATTERN,(_token,name)=>{name=name.trim();used.add(name);return values[name]||'未提供（需要补充）';});
  const additionalContext=Object.fromEntries(Object.entries(values).filter(([name,value])=>!used.has(name)&&value));
  return {prompt,additionalContext};
}
function readProjectPrompt(name, directory = PROMPT_DIRECTORY) {
  const filename = `${name}.md`;
  try {
    const content = readFileSync(path.join(directory, filename), 'utf8').trim();
    if (!content || content.length > 12000) throw new Error('invalid prompt length');
    if (name === 'main') validateTemplate(content);
    return content;
  } catch {
    throw new ResumeError('CONFIG_INVALID', `项目提示词 ${filename} 无法读取或格式不正确，请检查文件和变量。`, 503);
  }
}

function activeMainPrompt(settings, readPrompt = readProjectPrompt) {
  return (settings.promptSource === 'settings' ? settings.prompts.analysis : undefined) ?? readPrompt('main');
}

module.exports={PROMPT_VARIABLES,validateTemplate,bindPrompt,readProjectPrompt,activeMainPrompt};
