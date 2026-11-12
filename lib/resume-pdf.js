'use strict';
const {lineSpans,entryParts,entryName,presentationFor,sideFields,appearanceFor,orderedSections} = require('../dist/resume-format');

const colors = {
  ink:'#171717', muted:'#525252', accent:'#4255d9', rule:'#e5e5e5',
  pending:'#fff0aa', example:'#fff8db', exampleInk:'#9a6700', result:'#e8efff', resultInk:'#2348a1'
};
const words = new Intl.Segmenter('zh', {granularity:'word'});
const graphemes = new Intl.Segmenter('zh', {granularity:'grapheme'});

function* wrapLine(spans, measure, limit) {
  let line = [], width = 0;
  for (const span of spans) {
    const parts = width + measure(span.text) <= limit ? [span.text]
      : Array.from(words.segment(span.text), item => item.segment);
    for (const part of parts) {
      const pieces = measure(part) <= limit ? [part]
        : Array.from(graphemes.segment(part), item => item.segment);
      for (const piece of pieces) {
        const previous = line.at(-1);
        const sameStyle = previous && previous.tone === span.tone && previous.bold === span.bold;
        const combined = sameStyle ? previous.text + piece : piece;
        const combinedWidth = measure(combined);
        const nextWidth = width + combinedWidth - (sameStyle ? previous.width : 0);
        if (line.length && nextWidth > limit) {
          yield line;
          line = [{...span, text:piece, width:measure(piece)}];
          width = line[0].width;
        } else {
          if (sameStyle) line.pop();
          line.push({...span, text:combined, width:combinedWidth});
          width = nextWidth;
        }
      }
    }
  }
  yield line;
}

function renderResumePdf(resume, layout, font, appearance) {
  const PDFDocument = require('pdfkit');
  const settings = appearanceFor(appearance), sections = orderedSections(settings);
  const template = presentationFor(layout,settings);
  const compact = template.compact, centered = template.header === 'center';
  const margin = settings.margin * .75;
  const doc = new PDFDocument({size:'A4',margin,bufferPages:true,info:{Title:`${resume.name}的简历`,Author:'简历专家'}});
  const chunks = [];
  const result = new Promise((resolve,reject) => {
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const register=(name,value)=>{
    if (typeof value==='object') doc.registerFont(name,value.path,value.family);
    else doc.registerFont(name,value);
    doc.font(name);
    const face=doc._font;
    return {ascent:face.ascender,hasGlyphForCodePoint:code=>face.font.hasGlyphForCodePoint(code)};
  };
  const primary=register('resume-body',font.primary || font);
  const fallback=font.fallback ? register('resume-cjk',font.fallback) : null;
  doc.font('resume-body');
  // Match browser font fallback for Latin families while keeping Chinese searchable.
  const fontRuns=value=>{
    if (!fallback) return [{text:value,font:'resume-body'}];
    const runs=[];
    for (const {segment} of graphemes.segment(value)) {
      const name=Array.from(segment).every(character=>primary.hasGlyphForCodePoint(character.codePointAt(0)) || /\s/.test(character)) ? 'resume-body' : 'resume-cjk';
      if (runs.at(-1)?.font===name) runs.at(-1).text+=segment;
      else runs.push({text:segment,font:name});
    }
    return runs;
  };
  const width = doc.page.width - 2 * margin;
  const bottom = doc.page.height - margin;
  const measure = value => {
    const width=fontRuns(value).reduce((sum,run)=>sum+doc.font(run.font).widthOfString(run.text),0);
    doc.font('resume-body');
    return width;
  };
  const bodySize = settings.fontSize * .75;
  const gap = compact ? 1.5 : 2.7;
  let y = margin;
  let region = {x:margin,width};
  let pageIndex = 0, pageCount = 1, bodyStart = margin, bodyPage = 0, columnsActive = false;
  const sidebarWidth = width * .29, columnGap = 18;
  const sidebarX = template.side === 'left' ? margin : margin + width - sidebarWidth;
  const prepared = new Set();

  function prepareColumnPage() {
    if (!columnsActive || prepared.has(pageIndex)) return;
    prepared.add(pageIndex);
    const top = pageIndex === bodyPage ? bodyStart : margin;
    doc.rect(sidebarX,top,sidebarWidth,bottom - top).fill(template.tint);
  }

  function keepSpace(height) {
    if (y + height <= bottom) return;
    pageIndex++;
    if (pageIndex >= pageCount) { doc.addPage(); pageCount++; }
    else doc.switchToPage(pageIndex);
    y = margin;
    prepareColumnPage();
  }

  function rule(x1, x2, at, color, thickness) {
    doc.strokeColor(color).lineWidth(thickness).moveTo(x1,at).lineTo(x2,at).stroke();
  }

  function write(spans, {size = bodySize, alignCenter = false, underline = false, color = colors.ink, background, inset = 0, rail = false} = {}) {
    doc.font('resume-body').fontSize(size);
    const primaryHeight=doc.currentLineHeight(true);
    const height=fallback ? Math.max(primaryHeight,doc.font('resume-cjk').currentLineHeight(true)) : primaryHeight;
    doc.font('resume-body');
    const ascent=Math.max(primary.ascent,fallback?.ascent || primary.ascent);
    const lineGap = Math.max(0,size * settings.lineHeight - height);
    for (const line of wrapLine(spans,measure,region.width - inset * 2)) {
      keepSpace(height + lineGap);
      const lineWidth = line.reduce((sum,span) => sum + span.width,0);
      if (background) doc.rect(region.x,y - 1,region.width,height + lineGap + 1).fill(background);
      if (rail) doc.strokeColor(template.accent).lineWidth(.5).moveTo(region.x - 5,y - 2).lineTo(region.x - 5,y + height + lineGap + 1).stroke();
      let x = alignCenter ? region.x + (region.width - lineWidth) / 2 : region.x + inset;
      if (underline && lineWidth) rule(x,x + lineWidth,y + size + 2,template.accent,1.2);
      for (const span of line) {
        if (span.tone && span.width) doc.roundedRect(x,y,span.width,height,1).fill(colors[span.tone]);
        const ink = span.tone === 'example' ? colors.exampleInk : span.tone === 'result' ? colors.resultInk : color;
        // Scale the outline with the font size for a light emphasis on CJK glyphs.
        if (span.bold) doc.lineWidth(size * .01).strokeColor(ink);
        let runX=x;
        for (const run of fontRuns(span.text)) {
          doc.font(run.font);
          const face=run.font==='resume-cjk'?fallback:primary;
          const offset=fallback ? (ascent-face.ascent)*size/1000 : 0;
          doc.fillColor(ink).text(run.text,runX,y+offset,{lineBreak:false,fill:true,stroke:!!span.bold});
          runX+=doc.widthOfString(run.text);
        }
        doc.font('resume-body');
        x += span.width;
      }
      y += height + lineGap;
    }
  }

  const band = template.header === 'band';
  if (band) { doc.rect(margin,y,width,9).fill(template.accent); y += 9; }
  if (resume.name) write([{text:resume.name.replace(/\s*\r?\n\s*/g,' '),bold:true}],{
    size:(settings.fontSize + 5) * .75,alignCenter:centered,underline:template.heading === 'underline',
    color:band ? '#ffffff' : colors.ink,background:band ? template.accent : undefined,inset:band ? 10 : 0
  });
  if (resume.contact) {
    for (const line of resume.contact.split(/\r?\n/)) {
      write(lineSpans(line),{alignCenter:centered,color:band ? '#ffffff' : colors.muted,background:band ? template.accent : undefined,inset:band ? 10 : 0});
    }
  }
  if (band) { doc.rect(margin,y,width,8).fill(template.accent); y += 8; }
  keepSpace(36);
  bodyStart = y + 10;
  bodyPage = pageIndex;

  function renderSections(items) {
    for (const [field,title] of items) {
      const body = resume[field];
      if (!body) continue;
      y += compact ? 7 : 12;
      doc.fontSize((settings.fontSize + 2) * .75);
      const headingHeight = Math.max(doc.currentLineHeight(true),(settings.fontSize+2)*.75*settings.lineHeight);
      keepSpace(headingHeight + bodySize * settings.lineHeight + 5);
      const headingY = y;
      const filled = ['bar','card'].includes(template.heading);
      if (template.heading === 'pill') {
        const headingSize = (settings.fontSize + 2) * .75;
        doc.fontSize(headingSize);
        const height = Math.max(doc.currentLineHeight(true),headingSize * settings.lineHeight) + 4;
        doc.roundedRect(region.x,y - 2,Math.min(region.width,measure(title) + 16),height,Math.min(8,height/2)).fill(template.accent);
      }
      write([{text:title,bold:true}],{size:(settings.fontSize + 2) * .75,underline:template.heading === 'underline',
        color:template.heading === 'pill' ? '#ffffff' : template.accent,
        background:filled ? template.tint : undefined,inset:filled || template.heading === 'pill' ? 7 : 0});
      if (template.heading === 'bar') doc.rect(region.x,headingY - 1,2,y - headingY + 1).fill(template.accent);
      if (!['bar','pill','card','timeline'].includes(template.heading)) rule(region.x,region.x + region.width,y + 1,template.accent,.5);
      if (template.heading === 'timeline') doc.circle(region.x - 5,headingY + 5,2).fill(template.accent);
      y += 5;
      const grouped = field === 'experience' || field === 'projects';
      const entries = grouped ? entryParts(body,field) : [body];
      entries.forEach((entry,index) => {
        if (index) y += compact ? 4 : 7;
        const name = grouped ? entryName(entry,field) : '';
        entry.slice(name.length).split(/\r?\n/).forEach((line,lineIndex) => {
          const heading = lineIndex === 0 && name
            ? lineSpans(name,true).map(span => ({...span,bold:true})) : [];
          write([...heading,...lineSpans(line,field !== 'intent')],{background:template.heading === 'card' ? template.tint : undefined,inset:template.heading === 'card' ? 7 : 0,rail:template.heading === 'timeline'});
        });
      });
    }
  }
  if (template.side) {
    columnsActive = true;
    prepareColumnPage();
    region = {x:sidebarX + 9,width:sidebarWidth - 18};
    y = bodyStart;
    renderSections(sections.filter(([key]) => sideFields.includes(key)));
    pageIndex = bodyPage;
    doc.switchToPage(bodyPage);
    y = bodyStart;
    region = {x:template.side === 'left' ? margin + sidebarWidth + columnGap : margin,width:width - sidebarWidth - columnGap};
    renderSections(sections.filter(([key]) => !sideFields.includes(key)));
  } else renderSections(sections);
  doc.end();
  return result;
}

module.exports = {renderResumePdf};
