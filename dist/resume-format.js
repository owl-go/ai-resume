'use strict';

// Shared by the browser preview and PDF export.
const ResumeFormat = (() => {
  const sections = [
    ['intent','求职意向'], ['education','教育背景'], ['summary','职业摘要'], ['coreAbilities','核心能力'],
    ['experience','工作经历'], ['projects','项目经历'], ['skills','技能工具'], ['additional','其他加分项']
  ];
  const layouts = {classic:'标准',compact:'紧凑',editorial:'居中标题'};
  const metric = /((?<![\w.])\d+(?:,\d{3})*(?:\.\d+)?(?:\s*[–—~～至-]\s*\d+(?:,\d{3})*(?:\.\d+)?)?\s*(?:个百分点|[%％]|(?:亿|万|千)?元|年(?:以上)?(?:工作)?经验|小时(?:\/[周月天])?|分钟|毫秒|个月|秒|周|天|倍|(?:亿|万|千)?[名位家台套次人条单笔件项个])(?![\da-zA-Z]))/;
  const achievement = /(?<![未不])(?:荣获|获评|获颁|获奖|获得[^，。；;]{0,16}(?:奖|认证)|入选|排名(?:第|前)|位列|(?:通过|完成)(?:上线|交付)?验收|(?:正式|成功|按期)上线|(?:正式|按期|提前)(?:交付|投产))/;
  const supplementTitle = '补充经历（根据本人回答整理）';

  function lineSpans(line, highlightResults = false) {
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

  return {sections, layouts, lineSpans, entryParts, entryName, supplementTitle};
})();

if (typeof module !== 'undefined') module.exports = ResumeFormat;
