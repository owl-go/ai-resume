'use strict';
const {test,after}=require('node:test');
const settingsFs=require('node:fs'),settingsOs=require('node:os'),settingsPath=require('node:path');
const suiteSettingsDir=settingsFs.mkdtempSync(settingsPath.join(settingsOs.tmpdir(),'resume-suite-'));
const originalSettingsFile=process.env.RESUME_SETTINGS_FILE;
const originalPromptSource=process.env.RESUME_PROMPT_SOURCE;
process.env.RESUME_SETTINGS_FILE=settingsPath.join(suiteSettingsDir,'settings.json');
process.env.RESUME_PROMPT_SOURCE='settings';
after(()=>{if(originalSettingsFile===undefined)delete process.env.RESUME_SETTINGS_FILE;else process.env.RESUME_SETTINGS_FILE=originalSettingsFile;if(originalPromptSource===undefined)delete process.env.RESUME_PROMPT_SOURCE;else process.env.RESUME_PROMPT_SOURCE=originalPromptSource;settingsFs.rmSync(suiteSettingsDir,{recursive:true,force:true});});
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {createServer}=require('../server');
const {createResumeService,validateResult}=require('../lib/resume-service');
const {sample}=require('../dist/resume-data');
const exampleResult=()=>structuredClone(require('./fixtures/resume-analysis.json'));
async function run(fn,service){const server=createServer(service?{resumeService:service}:{});server.listen(0,'127.0.0.1');await once(server,'listening');try{await fn(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(resolve=>server.close(resolve));}}
const post=(base,endpoint,data,options={})=>fetch(base+'/api/resume/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Resume-Request':'1',...options.headers},body:JSON.stringify(data),...options});
test('conversation uses supplied materials, gates JD analysis and returns a safe resume layout', async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'synthetic-chat-key';
  let output, payload, calls = 0;
  const service = createResumeService({fetchFn:async (_url, options) => {
    calls++;
    const {messages} = JSON.parse(options.body);
    payload = JSON.parse(messages[1].content);
    assert.match(messages[0].content,/简历会话/);
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(output)}}]}));
  }});
  try {
    await run(async base => {
      const chat = async data => {
        const response = await post(base,'chat',data);
        assert.equal(response.status,200);
        return (await response.json()).result;
      };
      assert.equal((await post(base,'chat',{message:'',guide:'jobs'})).status,400);
      assert.equal(calls,0);
      output = {intent:'tailored',reply:'材料齐备，可以开始定向分析。',materials:{role:'AI 产品经理',jd:'编造的岗位描述'},analyze:true};
      const incomplete = await chat({message:'岗位是 AI 产品经理',input:{resume:sample.resume},guide:'tailored'});
      assert.deepEqual(incomplete.materials,{role:'AI 产品经理'});
      assert.equal(incomplete.analyze,false);
      assert.equal(incomplete.reply,'请补充完整的岗位描述（JD）。');
      const jd = '负责企业工作流的需求分析与产品设计';
      output = {intent:'tailored',reply:'请提供岗位描述。',analyze:false};
      const uploaded = await chat({message:'继续定向优化',input:{jd,resume:sample.resume},guide:'tailored'});
      assert.equal(uploaded.reply,'岗位描述已收到，请确认目标岗位名称。');
      const titledJD = `岗位名称：AI 产品经理\n${jd}`;
      const explicitStart = {message:'请根据我提供的目标岗位和 JD 优化这份简历。',guide:'tailored',startTailored:true};
      output = {intent:'tailored',reply:'请确认岗位。',materials:{role:'AI 产品经理'},analyze:false};
      const identified = await chat({...explicitStart,input:{jd:titledJD,resume:sample.resume}});
      assert.equal(identified.analyze,true);
      assert.equal(identified.materials.role,'AI 产品经理');
      assert.equal(identified.roleFromJD,true);
      assert.match(identified.reply,/开始定向分析/);
      const unconfirmed = await chat({...explicitStart,input:{jd,resume:sample.resume}});
      assert.equal(unconfirmed.analyze,false);
      assert.equal(unconfirmed.materials.role,undefined);
      const manualRole = await chat({...explicitStart,input:{jd:titledJD,resume:sample.resume,role:'已明确选择的岗位'}});
      assert.equal(manualRole.analyze,true);
      assert.equal(manualRole.materials.role,undefined);
      const newJD = `岗位名称：数据产品经理\n${jd}`;
      output = {intent:'tailored',reply:'开始分析。',materials:{jd:newJD,role:'数据产品经理'},analyze:true};
      const replaced = await chat({message:newJD,guide:'tailored',roleFromJD:true,input:{jd:titledJD,resume:sample.resume,role:'AI 产品经理'}});
      assert.equal(replaced.materials.role,'数据产品经理');
      assert.equal(replaced.roleFromJD,true);
      output = {intent:'tailored',reply:'开始分析。',materials:{jd},analyze:true};
      const ready = await chat({message:jd,input:{role:'AI 产品经理',resume:sample.resume},guide:'tailored',history:[{role:'assistant',text:'请粘贴 JD。'}]});
      assert.equal(ready.analyze,true);
      assert.equal(payload.history[0].text,'请粘贴 JD。');
      output = {intent:'optimize',reply:'已整理简历。',resume:exampleResult().resume,approach:'根据原简历整理个人职责与交付成果。',nextActions:['jobs','unsupported','jobs','diagnose']};
      const optimized = await chat({message:'优化我的简历',input:{resume:sample.resume}});
      assert.equal(optimized.resume.name,exampleResult().resume.name);
      assert.equal(optimized.approach,output.approach);
      assert.deepEqual(optimized.nextActions,['jobs','diagnose']);
      const diagnosis = {
        direction:'企业服务产品经理',summary:'有企业系统经验，近期产出缺少可验证的结果。',score:64,
        dimensions:{content:{score:62,reason:'缺少成果数据'},screening:{score:60,reason:'当前证据较少'},fit:{score:70,reason:'企业系统经历相关'}},
        suggestions:[{title:'补充验收证据',action:'说明使用范围及可验证的上线结果。',section:'experience'}]
      };
      output = {intent:'diagnose',reply:'已完成诊断。',diagnosis,resume:optimized.resume,analyze:true};
      const diagnosed = await chat({message:'简历诊断',guide:'diagnose',currentResume:optimized.resume});
      assert.deepEqual(diagnosed.diagnosis,diagnosis);
      assert.equal(diagnosed.resume,null);
      assert.equal(diagnosed.analyze,false);
      output.diagnosis = {...diagnosis,score:101};
      const invalidDiagnosis = await post(base,'chat',{message:'简历诊断',guide:'diagnose',input:{resume:sample.resume}});
      assert.equal(invalidDiagnosis.status,502);
      assert.equal((await invalidDiagnosis.json()).error.code,'INVALID_RESULT');
      output = {intent:'style',reply:'建议使用紧凑版。',layout:'compact',materials:{extra:'只改排版'},resume:{name:'不应覆盖已有简历'},approach:'超'.repeat(601)};
      const styled = await chat({message:'只改排版',input:{resume:sample.resume},currentResume:optimized.resume});
      assert.equal(styled.resume,null);
      assert.equal(styled.layout,'compact');
      assert.equal(styled.approach,undefined);
      assert.deepEqual(styled.materials,{extra:'只改排版'});
      output = {intent:'jobs',reply:'建议搜索企业服务产品经理。'};
      const jobs = await chat({message:'找匹配岗位',input:{resume:sample.resume},guide:'jobs'});
      assert.match(jobs.reply,/企业服务产品经理/);
      assert.equal(jobs.resume,null);
      const exported = await post(base,'export',{format:'docx',resume:optimized.resume,layout:styled.layout});
      assert.equal(exported.status,200);
      assert((await exported.arrayBuffer()).byteLength > 5000);
      assert.equal((await post(base,'export',{format:'docx',resume:optimized.resume,layout:'unknown'})).status,400);
    },service);
  } finally {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
test('chat streams the public approach before the validated result and ignores internal fields',async()=>{
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'synthetic-stream-key';
  const encoder = new TextEncoder();
  const frame = delta => `data: ${JSON.stringify({choices:[{delta}]})}\r\n\r\n`;
  const prefix = '{"approach":"依据';
  const analysisSummary = {evidence:'有库存系统经历',direction:'更匹配企业服务',deductions:'缺少验收数据',priority:'先补个人职责'};
  let upstream;
  const service = createResumeService({fetchFn:async (_url,options) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.stream,true);
    if (JSON.parse(payload.messages[1].content).message === '验证普通回复') {
      const content = JSON.stringify({intent:'other',reply:'普通 JSON 回复。'});
      return new Response(JSON.stringify({choices:[{message:{content}}]}));
    }
    if (JSON.parse(payload.messages[1].content).message === '验证诊断流') {
      const dimension = {score:60,reason:'有库存系统经历，缺少验收数据'};
      const diagnosis = {direction:'企业服务产品经理',summary:'证据有待补充',score:60,
        dimensions:{content:dimension,screening:dimension,fit:dimension},suggestions:[{title:'补充证据',action:'补充个人交付',section:'experience'}]};
      const content = JSON.stringify({intent:'diagnose',analysisSummary:{...analysisSummary,privateNotes:'隐藏内容'},reply:'已诊断。',diagnosis});
      return new Response(frame({content})+'data: [DONE]\r\n\r\n',{headers:{'Content-Type':'text/event-stream'}});
    }
    return new Response(new ReadableStream({start(controller) {
      upstream = controller;
      controller.enqueue(encoder.encode(frame({reasoning_content:'不得展示的内部字段'})));
      const bytes = encoder.encode(frame({content:prefix}));
      controller.enqueue(bytes.slice(0,bytes.length-8));
      controller.enqueue(bytes.slice(bytes.length-8));
    }}),{headers:{'Content-Type':'text/event-stream'}});
  }});
  try {
    await run(async base => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(),5000);
      try {
        const response = await fetch(base+'/api/resume/chat',{
          method:'POST',headers:{'Content-Type':'application/json','X-Resume-Request':'1',Accept:'application/x-ndjson'},
          body:JSON.stringify({message:'优化我的简历',input:{resume:sample.resume}}),signal:controller.signal
        });
        assert.match(response.headers.get('content-type'),/^application\/x-ndjson/);
        const stream = response.body.pipeThrough(new TextDecoderStream());
        const reader = stream.getReader();
        let pending = '';
        const next = async () => {
          while (!pending.includes('\n')) {
            const {value,done} = await reader.read();
            assert(!done);
            pending += value;
          }
          const newline = pending.indexOf('\n');
          const event = JSON.parse(pending.slice(0,newline));
          pending = pending.slice(newline+1);
          return event;
        };
        assert.deepEqual(await next(),{type:'generating'});
        assert.deepEqual(await next(),{type:'approach',text:'依据'});
        upstream.enqueue(encoder.encode(frame({content:'现有经历。","intent":"optimize","reply":"已优'})));
        assert.deepEqual(await next(),{type:'approach',text:'现有经历。'});
        assert.deepEqual(await next(),{type:'reply',text:'已优'});
        upstream.enqueue(encoder.encode(frame({content:'化。","resume":{"name":"虚构'})));
        assert.deepEqual(await next(),{type:'reply',text:'化。'});
        assert.deepEqual(await next(),{type:'resume',key:'name',text:'虚构'});
        const resume = {name:'',...exampleResult().resume};
        resume.name = '虚构示例';
        upstream.enqueue(encoder.encode(frame({content:JSON.stringify(resume).slice('{"name":"虚构'.length)+'}'})));
        upstream.enqueue(encoder.encode('data: [DONE]\r\n\r\n'));
        upstream.close();
        let final;
        do { final = await next(); } while (final.type === 'resume');
        assert.equal(final.type,'result');
        assert.equal(final.result.approach,'依据现有经历。');
        assert.equal(final.result.reply,'已优化。');
        assert.equal(final.result.resume.name,'虚构示例');
        assert.equal((await reader.read()).done,true);
        const fallback = await post(base,'chat',{message:'验证普通回复'},{headers:{'Content-Type':'application/json','X-Resume-Request':'1',Accept:'application/x-ndjson'}});
        assert.match(fallback.headers.get('content-type'),/^application\/json/);
        assert.equal((await fallback.json()).result.reply,'普通 JSON 回复。');
        const diagnosis = await post(base,'chat',{message:'验证诊断流',guide:'diagnose',input:{resume:sample.resume}},
          {headers:{'Content-Type':'application/json','X-Resume-Request':'1',Accept:'application/x-ndjson'}});
        const events = (await diagnosis.text()).trim().split('\n').map(line => JSON.parse(line));
        assert.deepEqual(events.map(event=>event.type),['generating','analysis','analysis','analysis','analysis','reply','diagnosis','result']);
        assert.deepEqual(Object.fromEntries(events.filter(event=>event.type==='analysis').map(event=>[event.key,event.text])),analysisSummary);
        assert.deepEqual(events.at(-1).result.analysisSummary,analysisSummary);
      } finally {
        clearTimeout(timeout);
        controller.abort();
      }
    },service);
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});
test('response contract validates model output and browser sample contains input materials only',()=>{assert.equal(validateResult(exampleResult()).interview.questions.length,10);assert.throws(()=>validateResult({}));assert.throws(()=>validateResult({...exampleResult(),questions:[]}));assert.deepEqual(Object.keys(require('../dist/resume-data')),['sample']);assert.equal(typeof sample.resume,'string');});
test('input, origin, signature and file type boundaries',async()=>run(async base=>{assert.equal((await post(base,'analyze',{input:{}})).status,400);assert.equal((await fetch(base+'/api/resume/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);assert.equal((await post(base,'analyze',{input:sample},{headers:{'Content-Type':'application/json','X-Resume-Request':'1',Origin:'https://foreign.example'}})).status,403);const form=new FormData();form.set('resume',new Blob(['not a pdf']), 'fake.pdf');const r=await fetch(base+'/api/resume/import',{method:'POST',headers:{'X-Resume-Request':'1'},body:form});assert.equal(r.status,400);assert.match((await r.json()).error.message,/不匹配/);assert.equal((await fetch(base+'/%zz')).status,400);assert.equal((await fetch(base+'/%2e%2e%2fpackage.json')).status,403);assert.equal((await fetch(base+'/not-found')).status,404);assert.equal((await fetch(base+'/')).status,200);}));
test('PDF and DOCX round-trip with compensation and education above experience',async()=>run(async base=>{
  const resume = exampleResult().resume;
  resume.intent += '\n期望薪资：20–25K';
  resume.experience += '\n• 处理时间缩短20%，覆盖120家。\n• 效果数据待补充：核对统计口径。';
  for (const [format,layout] of [['pdf','classic'],['pdf','compact'],['pdf','editorial'],['docx',undefined]]) {
    const response = await post(base,'export',{format,resume,layout});
    assert.equal(response.status,200);
    const bytes = await response.arrayBuffer();
    assert(bytes.byteLength > 5000);
    const form = new FormData();
    form.set('resume',new Blob([bytes]),`synthetic.${format}`);
    const imported = await fetch(base+'/api/resume/import',{method:'POST',headers:{'X-Resume-Request':'1'},body:form});
    assert.equal(imported.status,200);
    const {text} = await imported.json();
    assert.match(text,/林知远/);
    assert.match(text,/职业摘要/);
    assert.match(text,/核心能力/);
    assert.match(text,/求职意向[\s\S]*期望薪资[\s\S]*教育背景[\s\S]*工作经历/);
    assert.match(text.replace(/\s/g,''),/处理时间缩短20%，覆盖120家。.*效果数据待补充：核对统计口径。/);
  }
}));
test('chat, tailored analysis and refinement use the latest resume draft', async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'synthetic-draft-key';
  const input = {...sample,resume:'只存在于原始附件的旧版表达'};
  const currentResume = {...exampleResult().resume,summary:'最新手动保存的职业摘要'};
  let output, context;
  const service = createResumeService({fetchFn:async (_url, options) => {
    context = JSON.parse(JSON.parse(options.body).messages[1].content);
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(output)}}]}));
  }});
  try {
    await run(async base => {
      output = {intent:'optimize',reply:'已基于当前稿修改。',resume:currentResume};
      const chat = await post(base,'chat',{message:'继续精简简历',input,currentResume});
      assert.equal(chat.status,200);
      assert.equal((await chat.json()).result.resume.summary,currentResume.summary);
      assert.equal(context.currentResume.summary,currentResume.summary);
      assert.equal(context.input.resume,'');
      const preview = await post(base,'prompt-preview',{input,currentResume,template:'{{resume}}'});
      assert.equal(preview.status,200);
      assert.match((await preview.json()).prompt,/最新手动保存的职业摘要/);
      output = {intent:'tailored',reply:'开始分析。',analyze:true};
      const tailored = await post(base,'chat',{guide:'tailored',message:'继续定向优化',input:{...input,resume:''},currentResume});
      assert.equal(tailored.status,200);
      assert.equal((await tailored.json()).result.analyze,true);
      output = exampleResult();
      assert.equal((await post(base,'analyze',{input,currentResume})).status,200);
      assert.match(context.prompt,/最新手动保存的职业摘要/);
      assert.doesNotMatch(JSON.stringify(context),/只存在于原始附件的旧版表达/);
      output = {bullets:['梳理采购审批流程。']};
      const answers = [{question:'做了什么？',answer:'梳理采购审批流程。'}];
      assert.equal((await post(base,'refine',{input:{...input,resume:''},currentResume,answers})).status,200);
      assert.match(context.prompt,/最新手动保存的职业摘要/);
      assert.match(JSON.stringify(context),/梳理采购审批流程/);
      assert.equal((await post(base,'refine',{input,currentResume:{},answers})).status,400);
      output = exampleResult();
      assert.equal((await post(base,'analyze',{input})).status,200);
      assert.match(context.prompt,/只存在于原始附件的旧版表达/);
    },service);
  } finally {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
test('AI response, malformed provider response and refinement contract with isolated provider',async()=>{
const oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='synthetic-test-only';
try{let output=exampleResult();const service=createResumeService({fetchFn:async(_url,options)=>{const input=JSON.parse(options.body);assert.equal(input.store,false);assert.equal(input.response_format.type,'json_object');return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(output)}}]}));}});await run(async base=>{const r=await post(base,'analyze',{input:sample});assert.equal(r.status,200);assert.equal((await r.json()).mode,'ai');output={bullets:['根据真实回答整理的表达。']};const refined=await post(base,'refine',{input:sample,answers:[{question:'做了什么？',answer:'梳理采购审批流程。'}]});assert.equal(refined.status,200);output={bad:true};const bad=await post(base,'analyze',{input:sample});assert.equal(bad.status,502);assert.equal((await bad.json()).error.code,'INVALID_RESULT');},service);}finally{if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}});
test('provider errors are explicit and do not silently become demo results',async()=>{
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'synthetic-test-only';
  let status = 404;
  try {
    await run(async base => {
      for (const [upstreamStatus,hint] of [[404,/请检查模型设置/],[502,/请稍后重试/]]) {
        status = upstreamStatus;
        const response = await post(base,'analyze',{input:sample});
        assert.equal(response.status,502);
        const {error,result} = await response.json();
        assert.equal(error.code,'MODEL_ERROR');
        assert.match(error.message,hint);
        assert(!result);
      }
    },createResumeService({fetchFn:async()=>new Response('',{status})}));
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});
test('model and prompt settings persist atomically, protect key, retain blank and clear explicitly',async()=>{const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'resume-settings-'));const old=process.env.RESUME_SETTINGS_FILE;process.env.RESUME_SETTINGS_FILE=path.join(dir,'settings.json');try{let captured;const service=createResumeService({fetchFn:async(_url,options)=>{captured=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(exampleResult())}}]}));}});await run(async base=>{const initial=await(await fetch(base+'/api/resume/settings')).json();assert(!('apiKey' in initial));const input={baseURL:'https://model.example/v1/chat/completions',apiKey:'synthetic-setting-key',model:'test-model',prompts:{analysis:'自定义分析重点',refine:'自定义追问表达'}};const saved=await post(base,'settings',input);assert.equal(saved.status,200);const value=await saved.json();assert.equal(value.apiKeyConfigured,true);assert.deepEqual(Object.keys(value.prompts),['analysis']);assert.deepEqual(Object.keys(value.defaults),['analysis']);assert.equal(value.baseURL,'https://model.example/v1');assert(!JSON.stringify(value).includes('synthetic-setting-key'));assert.equal((await fs.stat(process.env.RESUME_SETTINGS_FILE)).mode&0o777,0o600);assert.equal((await post(base,'settings',{...input,apiKey:''})).status,200);assert.equal((await post(base,'analyze',{input:sample})).status,200);assert(captured.messages.some(x=>x.content.includes('自定义分析重点')));assert.equal((await post(base,'test',{})).status,200);const reloaded=await(await fetch(base+'/api/resume/settings')).json();assert.equal(reloaded.model,'test-model');assert.equal(reloaded.prompts.analysis,'自定义分析重点');const cleared=await post(base,'settings',{...input,apiKey:'',clearApiKey:true});assert.equal((await cleared.json()).apiKeyConfigured,false);assert.equal((await post(base,'settings',{baseURL:'javascript:alert(1)'})).status,400);assert.equal((await post(base,'settings',{baseURL:'https://user:pass@host.example'})).status,400);},service);}finally{if(old===undefined)delete process.env.RESUME_SETTINGS_FILE;else process.env.RESUME_SETTINGS_FILE=old;await fs.rm(dir,{recursive:true,force:true});}});
test('concurrent AI requests are blocked and client cancellation releases the request lock',async()=>{const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='synthetic-test-only';let started,release;const ready=new Promise(resolve=>{started=resolve;});const aborted=new Promise(resolve=>{release=resolve;});let calls=0;const service=createResumeService({fetchFn:async(_url,options)=>{calls++;if(calls>1)return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(exampleResult())}}]}));started();return new Promise((_resolve,reject)=>{options.signal.addEventListener('abort',()=>{release();reject(new DOMException('aborted','AbortError'));},{once:true});});}});try{await run(async base=>{const controller=new AbortController();const first=post(base,'analyze',{input:sample},{signal:controller.signal}).catch(()=>null);await ready;assert.equal((await (await fetch(base+'/api/resume/status')).json()).busy,true);assert.equal((await post(base,'analyze',{input:sample})).status,409);assert.equal((await post(base,'settings',{model:'test'})).status,409);controller.abort();await aborted;await first;assert.equal((await (await fetch(base+'/api/resume/status')).json()).busy,false);const retry=await post(base,'analyze',{input:sample});assert.equal(retry.status,200);assert.equal(calls,2);},service);}finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}});
test('prompt variables bind once, preserve literal candidate text, and reject unknown or malformed variables',()=>{
  const {bindPrompt,validateTemplate,readProjectPrompt,PROMPT_VARIABLES}=require('../lib/resume-prompts');
  const template=readProjectPrompt('main');
  const bound=bindPrompt('岗位：{{ role }}\n原文：{{resume}}\n补充：{{extra}}',{role:'测试岗位',resume:'原文 {{jd}} 与 $& 不应再次替换',jd:'不应注入原文'});
  assert.match(bound.prompt,/测试岗位/);assert(bound.prompt.includes('原文 {{jd}} 与 $& 不应再次替换'));assert.match(bound.prompt,/未提供（需要补充）/);assert.equal(bound.additionalContext.jd,'不应注入原文');
  assert.equal(PROMPT_VARIABLES.length,14);assert(template.includes('第九步'));assert(template.includes('{{boundaries}}'));
  assert.throws(()=>validateTemplate('{{not_supported}}'),/未知/);assert.throws(()=>validateTemplate('{{role'),/不完整/);
  assert(bindPrompt(template,sample,[{question:'负责什么？',answer:'参与验收，未主导项目。'}]).prompt.includes('参与验收，未主导项目。'));
});
test('preview binds every material field without invoking the model; AI requests use the same binding',async()=>{
  const oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='synthetic-test-only';let captured,calls=0;
  const service=createResumeService({fetchFn:async(_url,options)=>{calls++;captured=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(exampleResult())}}]}));}});
  try{await run(async base=>{
    const {readProjectPrompt}=require('../lib/resume-prompts');
    const input={...sample,role:'绑定岗位A',industry:'绑定行业B',company:'绑定公司C',stage:'转行',focus:'绑定能力D',jd:'绑定 JD E',resume:'绑定原文 F {{role}}',projects:'绑定项目G',skills:'绑定技能H',results:'绑定数据I',boundaries:'只参与验收，不主导',length:'两页',extra:'绑定补充J'};
    const preview=await post(base,'prompt-preview',{input,template:readProjectPrompt('main')});assert.equal(preview.status,200);const data=await preview.json();
    for(const value of Object.values(input))assert(data.prompt.includes(value));assert.equal(calls,0);assert(!JSON.stringify(data).includes('synthetic-test-only'));
    assert.equal((await post(base,'prompt-preview',{input,template:'{{apiKey}}'})).status,400);
    assert.equal((await post(base,'settings',{prompts:{analysis:'{{typo}}',refine:'保守表达'}})).status,400);
    assert.equal((await post(base,'analyze',{input:{...input,length:'三页'}})).status,400);
    const analyzed=await post(base,'analyze',{input});assert.equal(analyzed.status,200);assert.equal(calls,1);
    const actual=JSON.parse(captured.messages[1].content);assert.equal(actual.prompt,data.prompt);assert(!captured.messages[0].content.includes(input.resume));
    const result=(await analyzed.json()).result;assert.deepEqual(Object.keys(result),['jd','diagnosis','matches','questions','strategy','rewrites','resume','interview','strengthening']);
    assert.equal(result.diagnosis.dimensions.length,10);assert.equal(result.jd.competencies.length,5);assert(result.interview.questions.every(x=>x.advice));
  },service);}finally{if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
});
test('refinement reuses the sole main prompt; legacy secondary prompts are ignored and removed when saving',async()=>{
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'resume-one-prompt-'));const previousFile=process.env.RESUME_SETTINGS_FILE;process.env.RESUME_SETTINGS_FILE=path.join(dir,'settings.json');let captured;
  try{
    await fs.writeFile(process.env.RESUME_SETTINGS_FILE,JSON.stringify({version:1,baseURL:'https://model.example/v1',apiKey:'synthetic-only',model:'test-model',prompts:{analysis:'共享主模板 {{role}}\n{{answers}}',refine:'旧表达模板不应使用'}}));
    const service=createResumeService({fetchFn:async(_url,options)=>{captured=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({bullets:['参与需求评审与验收，未主导项目。']})}}]}));}});
    await run(async base=>{
      const settings=await(await fetch(base+'/api/resume/settings')).json();assert.deepEqual(Object.keys(settings.prompts),['analysis']);
      const r=await post(base,'refine',{input:sample,answers:[{question:'具体负责什么？',answer:'参与需求评审与验收，未主导项目。'}]});assert.equal(r.status,200);assert.equal((await r.json()).mode,'ai');
      const payload=JSON.parse(captured.messages[1].content);assert(payload.prompt.includes('共享主模板'));assert(payload.prompt.includes('参与需求评审与验收，未主导项目。'));assert(!JSON.stringify(captured).includes('旧表达模板不应使用'));assert(captured.messages[0].content.includes('不重新生成九项完整报告'));
      assert.equal((await post(base,'settings',{prompts:{analysis:'新的主模板 {{answers}}'}})).status,200);const stored=JSON.parse(await fs.readFile(process.env.RESUME_SETTINGS_FILE,'utf8'));assert.deepEqual(Object.keys(stored.prompts),['analysis']);assert.equal(stored.apiKey,'synthetic-only');assert.equal(stored.model,'test-model');
    },service);
  }finally{process.env.RESUME_SETTINGS_FILE=previousFile;await fs.rm(dir,{recursive:true,force:true});}
});
test('model performance settings are validated and forwarded to the real request seam',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'resume-performance-'));const old=process.env.RESUME_SETTINGS_FILE;process.env.RESUME_SETTINGS_FILE=path.join(dir,'settings.json');let captured;
 try{await run(async base=>{
  const saved=await post(base,'settings',{apiKey:'synthetic-only',reasoningEffort:'low',timeoutMs:240000});assert.equal(saved.status,200);const value=await saved.json();assert.equal(value.reasoningEffort,'low');assert.equal(value.timeoutMs,240000);
  assert.equal((await post(base,'analyze',{input:sample})).status,200);assert.equal(captured.reasoning_effort,'low');
  assert.equal((await post(base,'settings',{reasoningEffort:'auto'})).status,200);assert.equal((await post(base,'analyze',{input:sample})).status,200);assert(!Object.hasOwn(captured,'reasoning_effort'));
  assert.equal((await post(base,'settings',{reasoningEffort:'invalid'})).status,400);assert.equal((await post(base,'settings',{timeoutMs:100})).status,400);
 },createResumeService({fetchFn:async(_url,options)=>{captured=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(exampleResult())}}]}));}}));}finally{process.env.RESUME_SETTINGS_FILE=old;await fs.rm(dir,{recursive:true,force:true});}
});
test('development rereads Markdown prompts and production uses the saved main prompt', async () => {
  const fs = require('node:fs/promises');
  const {readProjectPrompt} = require('../lib/resume-prompts');
  const directory = await fs.mkdtemp(settingsPath.join(settingsOs.tmpdir(), 'resume-prompt-docs-'));
  const original = { RESUME_PROMPT_SOURCE:process.env.RESUME_PROMPT_SOURCE, NODE_ENV:process.env.NODE_ENV, RESUME_SETTINGS_FILE:process.env.RESUME_SETTINGS_FILE };
  process.env.RESUME_PROMPT_SOURCE = '';
  process.env.NODE_ENV = 'development';
  process.env.RESUME_SETTINGS_FILE = settingsPath.join(directory, 'settings.json');
  const write = (name, content) => fs.writeFile(settingsPath.join(directory, `${name}.md`), content);
  const requests = [];
  const service = createResumeService({
    readPrompt: name => readProjectPrompt(name, directory),
    fetchFn: async (_url, options) => {
      const {messages} = JSON.parse(options.body);
      requests.push(messages);
      const output = messages[0].content.includes('不重新生成九项完整报告')
        ? {bullets:['参与需求评审与验收。']}
        : exampleResult();
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(output)}}]}));
    }
  });
  try {
    await Promise.all([
      write('main', '开发模板 A：{{role}}'),
      write('system', '项目系统提示词 A'),
      ...['analyze','refine'].map(name => write(name, readProjectPrompt(name)))
    ]);
    await run(async base => {
      const saved = await post(base, 'settings', {apiKey:'synthetic-only', prompts:{analysis:'上线模板：{{role}}'}});
      assert.equal(saved.status, 200);
      assert.equal((await saved.json()).promptSource, 'project');
      const preview = await post(base, 'prompt-preview', {input:sample});
      assert.equal((await preview.json()).prompt, `开发模板 A：${sample.role}`);
      assert.equal((await post(base, 'analyze', {input:sample})).status, 200);
      assert.equal(JSON.parse(requests[0][1].content).prompt, `开发模板 A：${sample.role}`);
      assert.match(requests[0][0].content, /项目系统提示词 A/);

      await Promise.all([write('main', '开发模板 B：{{answers}}'), write('system', '项目系统提示词 B')]);
      const answers = [{question:'你负责什么？',answer:'参与验收。'}];
      assert.equal((await post(base, 'refine', {input:sample, answers})).status, 200);
      assert.match(JSON.parse(requests[1][1].content).prompt, /开发模板 B[\s\S]*参与验收/);
      assert.match(requests[1][0].content, /项目系统提示词 B/);

      await write('main', '{{unknown_variable}}');
      const invalid = await post(base, 'analyze', {input:sample});
      assert.equal(invalid.status, 503);
      assert.equal((await invalid.json()).error.code, 'CONFIG_INVALID');
      assert.equal(requests.length, 2);

      process.env.NODE_ENV = 'production';
      assert.equal((await post(base, 'analyze', {input:sample})).status, 200);
      assert.equal(JSON.parse(requests[2][1].content).prompt, `上线模板：${sample.role}`);
      assert.match(requests[2][0].content, /项目系统提示词 B/);
      const config = await (await fetch(base+'/api/resume/settings')).json();
      assert.equal(config.promptSource, 'settings');
      assert.equal(config.prompts.analysis, '上线模板：{{role}}');
      assert(!JSON.stringify(config).includes('项目系统提示词'));
    }, service);
  } finally {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await fs.rm(directory, {recursive:true, force:true});
  }
});
