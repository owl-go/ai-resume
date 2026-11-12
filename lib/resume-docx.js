'use strict';
const {lineSpans,entryParts,entryName,presentationFor,sideFields,fonts,appearanceFor,orderedSections} = require('../dist/resume-format');

async function renderResumeDocx(resume, layout, appearance) {
  const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,BorderStyle,AlignmentType,ShadingType,TableLayoutType} = require('docx');
  const settings = appearanceFor(appearance), sections = orderedSections(settings);
  const margin = Math.round(settings.margin * 15), available = 11906 - margin * 2;
  const template = presentationFor(layout,settings), hex = color => color.replace('#','');
  const accent = hex(template.accent), tint = hex(template.tint);
  const face = fonts[settings.font].word;
  const font = {ascii:face,hAnsi:face,eastAsia:fonts[settings.font].cjk || face,cs:face};
  const bodySize = settings.fontSize * 1.5;
  const spacing = {after:0,line:Math.round(settings.fontSize * .75 * settings.lineHeight * 20),lineRule:'exact'};
  const shade = fill => ({type:ShadingType.CLEAR,fill});
  const noBorder = {style:BorderStyle.NONE,size:0,color:'FFFFFF'};
  const borders = {top:noBorder,bottom:noBorder,left:noBorder,right:noBorder};
  const textRuns = (spans, overrides = {}) => spans.map(span => new TextRun({
    text:span.text,font,size:bodySize,bold:!!span.bold,...overrides,
    ...(span.tone ? {color:span.tone === 'example' ? '9A6700' : span.tone === 'result' ? '2348A1' : '171717',
      shading:shade(span.tone === 'example' ? 'FFF8DB' : span.tone === 'pending' ? 'FFF0AA' : 'E8EFFF')} : {})
  }));
  const paragraph = (spans, options = {}, runOptions = {}) => new Paragraph({widowControl:true,spacing,children:textRuns(spans,runOptions),...options});
  const underline = template.heading === 'underline' ? {underline:{color:accent}} : {};
  const profile = [];
  const alignment = template.header === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT;
  const nameSpacing = {before:0,after:70,line:Math.round((settings.fontSize+5)*.75*settings.lineHeight*20)};
  if (resume.name) profile.push(paragraph([{text:resume.name,bold:true}],{alignment,spacing:nameSpacing},{size:(settings.fontSize+5)*1.5,...underline}));
  if (resume.contact) resume.contact.split(/\r?\n/).forEach(text => profile.push(paragraph(lineSpans(text),{alignment},{color:'525252'})));
  const cell = (children,width,fill) => new TableCell({
    width:{size:width,type:WidthType.DXA},borders,
    margins:{top:100,bottom:100,left:130,right:130},
    ...(fill ? {shading:shade(fill)} : {}),children:children.length ? children : [new Paragraph('')]
  });
  const table = (cells,widths) => new Table({width:{size:100,type:WidthType.PERCENTAGE},
    layout:TableLayoutType.FIXED,columnWidths:widths,borders:{...borders,insideHorizontal:noBorder,insideVertical:noBorder},
    rows:[new TableRow({children:cells})]
  });
  const children = [];
  if (template.header === 'band') {
    const band = [];
    if (resume.name) band.push(paragraph([{text:resume.name,bold:true}],{spacing:nameSpacing},{size:(settings.fontSize+5)*1.5,color:'FFFFFF'}));
    if (resume.contact) resume.contact.split(/\r?\n/).forEach(text => band.push(paragraph(lineSpans(text),{},{color:'FFFFFF'})));
    children.push(table([cell(band,available,accent)],[available]),new Paragraph({spacing:{after:50}}));
  } else children.push(...profile);

  function sectionParagraphs(items) {
    const output = [];
    for (const [field,title] of items) {
      if (!resume[field]) continue;
      const filled = ['bar','card'].includes(template.heading);
      const pill = template.heading === 'pill';
      const headingBorder = {style:BorderStyle.SINGLE,color:accent,size:4,space:4};
      output.push(paragraph([{text:pill ? `  ${title}  ` : title,bold:true}],{
        // Keeping a heading with the next paragraph inside a two-column row
        // can move the entire row to a new page in Word/LibreOffice.
        keepNext:!template.side,spacing:{before:template.compact ? 100 : 180,after:90,line:Math.round((settings.fontSize+2)*.75*settings.lineHeight*20)},
        ...(filled ? {shading:shade(tint),indent:{left:100,right:100}} : {}),
        border:template.heading === 'bar' ? {left:{...headingBorder,size:16}} : template.heading === 'timeline' ? {left:{...headingBorder,size:5,space:8}} : filled || pill ? undefined : {bottom:headingBorder}
      },{size:(settings.fontSize+2)*1.5,color:pill ? 'FFFFFF' : accent,...(pill ? {shading:shade(accent)} : {}),...underline}));
      const grouped = ['experience','projects'].includes(field);
      const entries = grouped ? entryParts(resume[field],field) : [resume[field]];
      entries.forEach((entry,index) => {
        const name = grouped ? entryName(entry,field) : '';
        entry.slice(name.length).split(/\r?\n/).forEach((line,lineIndex) => {
          const heading = lineIndex === 0 && name ? lineSpans(name,true).map(span => ({...span,bold:true})) : [];
          const card = template.heading === 'card';
          output.push(paragraph([...heading,...lineSpans(line,field !== 'intent')],{
            ...(index && lineIndex === 0 ? {spacing:{...spacing,before:90}} : {}),
            ...(card ? {shading:shade(tint),indent:{left:100,right:100}} : {}),
            ...(template.heading === 'timeline' ? {border:{left:{style:BorderStyle.SINGLE,color:accent,size:5,space:8}},indent:{left:90}} : {})
          }));
        });
      });
    }
    return output;
  }
  if (template.side) {
    const sidebarWidth = Math.round(available * .3), mainWidth = available - sidebarWidth;
    const side = cell(sectionParagraphs(sections.filter(([key]) => sideFields.includes(key))),sidebarWidth,tint);
    const main = cell(sectionParagraphs(sections.filter(([key]) => !sideFields.includes(key))),mainWidth);
    children.push(table(template.side === 'left' ? [side,main] : [main,side],template.side === 'left' ? [sidebarWidth,mainWidth] : [mainWidth,sidebarWidth]));
  } else children.push(...sectionParagraphs(sections));
  return Packer.toBuffer(new Document({
    styles:{default:{document:{run:{font,size:bodySize,color:'171717'},paragraph:{spacing}}}},
    sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:margin,bottom:margin,left:margin,right:margin}}},children}]
  }));
}

module.exports = {renderResumeDocx};
