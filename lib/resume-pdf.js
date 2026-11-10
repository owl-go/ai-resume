'use strict';
const {sections, lineSpans, entryParts, entryName} = require('../dist/resume-format');

const colors = {
  ink:'#171717', muted:'#525252', accent:'#4255d9', rule:'#e5e5e5',
  pending:'#fff0aa', result:'#e8efff', resultInk:'#2348a1'
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

function renderResumePdf(resume, layout, font) {
  const PDFDocument = require('pdfkit');
  const compact = layout === 'compact', centered = layout === 'editorial';
  const margin = compact ? 36 : 44;
  const doc = new PDFDocument({size:'A4',margin,info:{Title:`${resume.name}的简历`,Author:'简历专家'}});
  const chunks = [];
  const result = new Promise((resolve,reject) => {
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.font(font);
  const width = doc.page.width - 2 * margin;
  const bottom = doc.page.height - margin;
  const measure = value => doc.widthOfString(value);
  const bodySize = 9;
  const gap = compact ? 1.5 : 2.7;
  let y = margin;

  function keepSpace(height) {
    if (y + height <= bottom) return;
    doc.addPage();
    y = margin;
  }

  function rule(x1, x2, at, color, thickness) {
    doc.strokeColor(color).lineWidth(thickness).moveTo(x1,at).lineTo(x2,at).stroke();
  }

  function write(spans, {size = bodySize, alignCenter = false, underline = false, color = colors.ink} = {}) {
    doc.fontSize(size);
    const height = doc.currentLineHeight(true);
    for (const line of wrapLine(spans,measure,width)) {
      keepSpace(height + gap);
      const lineWidth = line.reduce((sum,span) => sum + span.width,0);
      let x = alignCenter ? margin + (width - lineWidth) / 2 : margin;
      if (underline && lineWidth) rule(x,x + lineWidth,y + size + 2,colors.accent,1.5);
      for (const span of line) {
        if (span.tone && span.width) doc.roundedRect(x,y,span.width,height,1).fill(colors[span.tone]);
        const ink = span.tone === 'result' ? colors.resultInk : color;
        // Scale the outline with the font size for a light emphasis on CJK glyphs.
        if (span.bold) doc.lineWidth(size * .01).strokeColor(ink);
        doc.fillColor(ink).text(span.text,x,y,{lineBreak:false,fill:true,stroke:!!span.bold});
        x += span.width;
      }
      y += height + gap;
    }
  }

  if (resume.name) {
    write([{text:resume.name.replace(/\s*\r?\n\s*/g,' '),bold:true}],{size:centered ? 14 : 13,alignCenter:centered,underline:true});
    y += 4;
  }
  if (resume.contact) {
    for (const line of resume.contact.split(/\r?\n/)) {
      write(lineSpans(line),{alignCenter:centered,color:colors.muted});
    }
  }
  for (const [field,title] of sections) {
    const body = resume[field];
    if (!body) continue;
    y += compact ? 7 : 12;
    doc.fontSize(10);
    keepSpace(2 * (doc.currentLineHeight(true) + gap) + 5);
    write([{text:title,bold:true}],{size:10,underline:true});
    rule(margin,margin + width,y + 1,colors.rule,.6);
    y += 5;
    const grouped = field === 'experience' || field === 'projects';
    const entries = grouped ? entryParts(body,field) : [body];
    entries.forEach((entry,index) => {
      if (index) y += compact ? 4 : 7;
      const name = grouped ? entryName(entry,field) : '';
      entry.slice(name.length).split(/\r?\n/).forEach((line,lineIndex) => {
        const heading = lineIndex === 0 && name
          ? lineSpans(name,true).map(span => ({...span,bold:true})) : [];
        write([...heading,...lineSpans(line,field !== 'intent')]);
      });
    });
  }
  doc.end();
  return result;
}

module.exports = {renderResumePdf};
