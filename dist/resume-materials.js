'use strict';
const ResumeMaterials = (() => {
  const compact = text => text.replace(/\s/g,'');
  function mergeJDText(previous = '', incoming = '') {
    if (typeof previous !== 'string' || typeof incoming !== 'string') throw new Error('岗位描述格式无效。');
    const oldText = previous.trim(), nextText = incoming.trim();
    if (!nextText) return previous;
    const needle = Array.from(compact(nextText)), prefix = Array(needle.length).fill(0);
    for (let i=1,j=0;i<needle.length;i++) {
      while (j && needle[i]!==needle[j]) j=prefix[j-1];
      if (needle[i]===needle[j]) j++;
      prefix[i]=j;
    }
    let matched=0;
    for (const character of compact(oldText)) {
      while (matched && character!==needle[matched]) matched=prefix[matched-1];
      if (character===needle[matched]) matched++;
      if (matched===needle.length) return previous;
    }
    let remainder=nextText, join='\n\n';
    // Exact lines also allow short repeated headings at screenshot boundaries.
    const oldLines=oldText.split(/\r?\n/).filter(line=>line.trim());
    const nextLines=nextText.split(/\r?\n/);
    const meaningful=nextLines.map((line,index)=>({text:compact(line),index})).filter(line=>line.text);
    for (let count=Math.min(oldLines.length,meaningful.length,200);count>0;count--) {
      if (meaningful.slice(0,count).every((line,index)=>line.text===compact(oldLines[oldLines.length-count+index]))) {
        remainder=nextLines.slice(meaningful[count-1].index+1).join('\n').trim();
        break;
      }
    }
    if (remainder===nextText && matched>=12) {
      let seen=0, offset=0;
      for (const character of nextText) {
        offset+=character.length;
        if (!/\s/.test(character) && ++seen===matched) break;
      }
      const rest=nextText.slice(offset);
      join=/^\r?\n/.test(rest)?'\n\n':/^\s/.test(rest)?' ':'';
      remainder=rest.trim();
    }
    const combined=!oldText?nextText:!remainder?previous:oldText+join+remainder;
    if (combined.length>50000) throw new Error('合并后的岗位描述超过 50,000 字，请先精简已有内容。');
    return combined;
  }
  return {mergeJDText};
})();
if (typeof module!=='undefined') module.exports=ResumeMaterials;
