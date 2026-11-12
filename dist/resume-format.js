'use strict';

// Shared by the browser preview, template library, PDF and Word export.
const ResumeFormat = (() => {
  const sections = [
    ['intent','求职意向'], ['education','教育背景'], ['summary','职业摘要'], ['coreAbilities','核心能力'],
    ['experience','工作经历'], ['projects','项目经历'], ['skills','技能工具'], ['additional','其他加分项']
  ];
  const templates = {
    classic: {name:'经典',group:'简约',heading:'underline',header:'plain',accent:'#4255d9',tint:'#f3f5fc'},
    compact: {name:'通用',group:'简约',heading:'underline',header:'plain',accent:'#4255d9',tint:'#f3f5fc',compact:true},
    editorial: {name:'居中',group:'简约',heading:'line',header:'center',accent:'#4255d9',tint:'#f3f5fc'},
    minimal: {name:'极简',group:'简约',heading:'line',header:'plain',accent:'#343840',tint:'#f5f5f5'},
    blue: {name:'雅蓝',group:'强调',heading:'line',header:'band',accent:'#2857dc',tint:'#edf2ff'},
    campus: {name:'校招',group:'强调',heading:'bar',header:'plain',accent:'#3864e8',tint:'#edf2ff'},
    cards: {name:'分层卡片',group:'强调',heading:'card',header:'plain',accent:'#4063ce',tint:'#f3f6fc'},
    capsule: {name:'胶囊',group:'强调',heading:'pill',header:'plain',accent:'#3460dc',tint:'#edf2ff'},
    timeline: {name:'时间线',group:'强调',heading:'timeline',header:'plain',accent:'#4c65c6',tint:'#eef1fc'},
    modern: {name:'现代双栏',group:'双栏',heading:'line',header:'plain',accent:'#345fd8',tint:'#f1f4fc',side:'right'},
    sidebar: {name:'清新双栏',group:'双栏',heading:'line',header:'plain',accent:'#3562dc',tint:'#edf2ff',side:'left'},
    violet: {name:'紫罗兰',group:'双栏',heading:'bar',header:'plain',accent:'#7350ab',tint:'#f2ebfc',side:'left'}
  };
  const layouts = Object.fromEntries(Object.entries(templates).map(([key,value]) => [key,value.name]));
  const sideFields = ['education','coreAbilities','skills','additional'];
  const templateFor = key => templates[key] || templates.classic;
  const fonts = {
    sans:{name:'黑体',css:'"Arial Unicode MS", "PingFang SC", sans-serif',word:'Arial Unicode MS'},
    serif:{name:'宋体',css:'"Songti SC", SimSun, serif',word:'Songti SC'},
    fangsong:{name:'仿宋',css:'"Resume Fangsong", FangSong, serif',word:'FandolFang'},
    kaiti:{name:'楷体',css:'"Resume Kaiti", KaiTi, serif',word:'FandolKai'},
    arial:{name:'Arial',css:'Arial, "Arial Unicode MS", "PingFang SC", sans-serif',word:'Arial',cjk:'Arial Unicode MS'},
    roboto:{name:'Roboto',css:'"Resume Roboto", "Arial Unicode MS", "PingFang SC", sans-serif',word:'Roboto',cjk:'Arial Unicode MS'},
    opensans:{name:'Open Sans',css:'"Resume Open Sans", "Arial Unicode MS", "PingFang SC", sans-serif',word:'Open Sans',cjk:'Arial Unicode MS'},
    lato:{name:'Lato',css:'"Resume Lato", "Arial Unicode MS", "PingFang SC", sans-serif',word:'Lato',cjk:'Arial Unicode MS'}
  };
  const defaultAppearance = {font:'sans',fontSize:12,lineHeight:1.6,margin:28,accent:null,sectionOrder:sections.map(([key])=>key)};
  function appearanceFor(value) {
    if (value === undefined) value = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('简历排版设置无效。');
    const result = {...defaultAppearance,...value,sectionOrder:value.sectionOrder === undefined ? [...defaultAppearance.sectionOrder] : value.sectionOrder};
    if (typeof result.font !== 'string' || !Object.hasOwn(fonts,result.font)) throw new Error('请选择有效的简历字体。');
    if (!Number.isInteger(result.fontSize) || result.fontSize < 10 || result.fontSize > 18) throw new Error('字号须为 10–18px 的整数。');
    if (typeof result.lineHeight !== 'number' || !Number.isFinite(result.lineHeight) || result.lineHeight < 1.2 || result.lineHeight > 2.2) throw new Error('行高须为 1.2–2.2 倍。');
    if (!Number.isInteger(result.margin) || result.margin < 8 || result.margin > 60) throw new Error('边距须为 8–60px 的整数。');
    if (result.accent !== null && (typeof result.accent !== 'string' || !/^#[0-9a-f]{6}$/i.test(result.accent))) throw new Error('主题色须为有效的十六进制颜色。');
    if (!Array.isArray(result.sectionOrder) || result.sectionOrder.length !== sections.length
        || new Set(result.sectionOrder).size !== sections.length || result.sectionOrder.some(key=>!sections.some(([field])=>field===key))) throw new Error('模块顺序须完整包含所有简历模块。');
    return {font:result.font,fontSize:result.fontSize,lineHeight:result.lineHeight,margin:result.margin,
      accent:result.accent,sectionOrder:[...result.sectionOrder]};
  }
  function orderedSections(appearance) {
    return appearanceFor(appearance).sectionOrder.map(key=>sections.find(([field])=>field===key));
  }
  function presentationFor(layout, appearance) {
    const template = templateFor(layout), settings = appearanceFor(appearance);
    if (!settings.accent) return template;
    const rgb = settings.accent.slice(1).match(/../g).map(part=>parseInt(part,16));
    const tint = '#'+rgb.map(channel=>Math.round(channel*.08+255*.92).toString(16).padStart(2,'0')).join('');
    return {...template,accent:settings.accent,tint};
  }
  const metric = /((?<![\w.])\d+(?:,\d{3})*(?:\.\d+)?(?:\s*[–—~～至-]\s*\d+(?:,\d{3})*(?:\.\d+)?)?\s*(?:个百分点|[%％]|(?:亿|万|千)?元|年(?:以上)?(?:工作)?经验|小时(?:\/[周月天])?|分钟|毫秒|个月|秒|周|天|倍|(?:亿|万|千)?[名位家台套次人条单笔件项个])(?![\da-zA-Z]))/;
  const achievement = /(?<![未不])(?:荣获|获评|获颁|获奖|获得[^，。；;]{0,16}(?:奖|认证)|入选|排名(?:第|前)|位列|(?:通过|完成)(?:上线|交付)?验收|(?:正式|成功|按期)上线|(?:正式|按期|提前)(?:交付|投产))/;
  const supplementTitle = '补充经历（根据本人回答整理）';

  function lineSpans(line, highlightResults = false) {
    // Keep illustrative numbers separate from achievements, even on the same line.
    const examples = line.split(/(【填写示例[：:][^】\r\n]*(?:】|$))/);
    if (examples.length > 1) return examples.flatMap(part => /^【填写示例[：:]/.test(part)
      ? [{text:part,tone:'example'}] : part ? lineSpans(part,highlightResults) : []);
    const pending = /[【\[（(]\s*(?:待补充|需要补充)(?:证据)?\s*[】\]）)]/.test(line)
      || /^[\s•·*–—-]*[^：:]{0,20}(?:待补充|需要补充)(?:证据)?\s*(?:[：:]|$)/.test(line);
    if (pending) return [{text:line, tone:'pending'}];
    if (!highlightResults) return [{text:line}];
    return line.split(/([，。；;])/).flatMap(part => achievement.test(part)
      ? [{text:part, tone:'result'}]
      : part.split(metric).map((text,index) => ({text, tone:index % 2 ? 'result' : undefined})))
      .filter(span => span.text);
  }

  function entryParts(text, field) {
    const entries = (text || '').split(/\r?\n[ \t]*(?:\r?\n)+/);
    // Older drafts can put consecutive employers on adjacent lines.
    const employmentHeading = /\r?\n(?=(?![ \t]*(?:[-•·*]|\d+[.、)]))[^\n|｜]{1,90}(?:公司|集团|研究院|事务所|工作室)[ \t]*[|｜])/;
    return (field === 'experience' ? entries.flatMap(entry => entry.split(employmentHeading)) : entries)
      .map(part => part.trim()).filter(Boolean);
  }

  function entryName(entry, field) {
    const heading = entry.split(/\r?\n/,1)[0];
    if (heading === supplementTitle || /^(?:[-•·*]|\d+[.、)]\s|(?:19|20)\d{2}[./年-])/.test(heading)) return '';
    const separator = heading.search(/[|｜]|[ \t]+[-–—·][ \t]+/);
    if (field === 'experience' && separator < 0) {
      const company = /^(.+?(?:公司|集团|研究院|事务所|工作室))[ \t]+/.exec(heading);
      if (company) return company[1];
    }
    const end = separator < 0 ? heading.search(/[ \t]+(?:19|20)\d{2}[./年-]/) : separator;
    return end < 0 ? heading : heading.slice(0,end).trimEnd();
  }

  return {sections,layouts,templates,sideFields,templateFor,fonts,appearanceFor,orderedSections,presentationFor,lineSpans,entryParts,entryName,supplementTitle};
})();

if (typeof module !== 'undefined') module.exports = ResumeFormat;
