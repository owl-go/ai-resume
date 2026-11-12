'use strict';
const ResumeExports = (() => {
  let bound=false, renderer=null;
  const trigger=()=>document.querySelector('[data-open-export]');
  function button(disabled='') {
    return `<button type="button" class="button primary small resume-export-button" data-open-export aria-label="导出" aria-haspopup="menu" aria-controls="resumeExportMenu" aria-expanded="false" ${disabled || (state.exporting?'disabled':'')}>${ResumeEditor.toolIcon('download-2-line')}<span class="export-button-text">${state.exporting?'导出中…':'导出'}</span>${ResumeEditor.toolIcon('arrow-down-s-line')}</button>`;
  }
  function close(focus=false) {
    const menu=$('resumeExportMenu');
    if(menu.matches(':popover-open'))menu.hidePopover();
    if(focus)trigger()?.focus();
  }
  function position() {
    const menu=$('resumeExportMenu');
    if(!menu.matches(':popover-open'))return;
    const opener=trigger();
    if(!opener){close();return;}
    const box=opener.getBoundingClientRect(),width=menu.offsetWidth,height=menu.offsetHeight;
    const top=window.visualViewport?.offsetTop||0,bottom=top+(window.visualViewport?.height||innerHeight);
    const y=bottom-box.bottom<height+8 && box.top-top>bottom-box.bottom ? box.top-height-6 : box.bottom+6;
    menu.style.left=Math.max(8,Math.min(box.right-width,innerWidth-width-8))+'px';
    menu.style.top=Math.max(top+8,Math.min(y,bottom-height-8))+'px';
  }
  function refreshBusy() {
    const disabled=state.busy||state.importBusy||state.exporting;
    document.querySelectorAll('[data-open-export],[data-export]').forEach(control=>control.disabled=disabled);
    document.querySelectorAll('[data-open-export]').forEach(control=>{
      control.setAttribute('aria-busy',String(Boolean(state.exporting)));
      control.querySelector('.export-button-text').textContent=state.exporting?'导出中…':'导出';
    });
  }
  function bind() {
    const menu=$('resumeExportMenu');
    if(!bound){
      bound=true;
      menu.onkeydown=event=>{
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
        if(!['ArrowDown','ArrowUp','Home','End','Tab'].includes(event.key))return;
        if(event.key==='Tab'){close();return;}
        event.preventDefault();
        const items=Array.from(menu.querySelectorAll('[data-export]')),index=items.indexOf(document.activeElement);
        const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowUp'?-1:1)+items.length)%items.length;
        items[next].focus();
      };
      menu.ontoggle=()=>document.querySelectorAll('[data-open-export]').forEach(control=>control.setAttribute('aria-expanded',String(menu.matches(':popover-open'))));
      window.addEventListener('resize',position);document.addEventListener('scroll',position,true);
    }
    document.querySelectorAll('[data-open-export]').forEach(control=>{
      const open=(last=false)=>{
        if(state.busy||state.importBusy||state.exporting)return;
        if(menu.matches(':popover-open')){close(true);return;}
        menu.showPopover();position();control.setAttribute('aria-expanded','true');
        const items=menu.querySelectorAll('[data-export]');items[last?items.length-1:0].focus({preventScroll:true});
      };
      control.onclick=()=>open();
      control.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open(event.key==='ArrowUp');}};
    });
    refreshBusy();
  }
  async function toPNG(blob) {
    let task,canvas,pageCanvas;
    try {
      if(!renderer)renderer=import('/vendor/pdfjs/pdf.js').catch(error=>{renderer=null;throw error;});
      const pdfjs=await renderer;
      pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.js';
      task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false});
      const pdf=await task.promise;
      const pages=[];
      let width=0,height=0;
      for(let index=1;index<=pdf.numPages;index++){
        const page=await pdf.getPage(index),view=page.getViewport({scale:1});
        pages.push(page);width=Math.max(width,view.width);height+=Math.ceil(view.height);
      }
      const scale=Math.min(2,32700/height,Math.sqrt(16000000/(width*height)));
      if(scale<1)throw new Error('简历过长，无法生成完整图片，请选择导出 PDF。');
      canvas=document.createElement('canvas');canvas.width=Math.ceil(width*scale);canvas.height=pages.reduce((sum,page)=>sum+Math.ceil(page.getViewport({scale}).height),0);
      const context=canvas.getContext('2d');
      if(!context)throw new Error('当前浏览器无法生成图片，请选择导出 PDF。');
      context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
      pageCanvas=document.createElement('canvas');let offset=0;
      for(const page of pages){
        const viewport=page.getViewport({scale});pageCanvas.width=Math.ceil(viewport.width);pageCanvas.height=Math.ceil(viewport.height);
        const pageContext=pageCanvas.getContext('2d');
        if(!pageContext)throw new Error('当前浏览器无法生成图片，请选择导出 PDF。');
        await page.render({canvasContext:pageContext,viewport,background:'#ffffff'}).promise;
        context.drawImage(pageCanvas,0,offset);offset+=pageCanvas.height;page.cleanup();
      }
      return await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('图片生成失败，请选择导出 PDF。')),'image/png'));
    } catch(error) {
      if(error.message?.includes('请选择')||error.message?.includes('请选择'))throw error;
      throw new Error('图片生成失败，请重试或选择导出 PDF。');
    } finally {
      if(pageCanvas){pageCanvas.width=pageCanvas.height=0;}
      if(canvas){canvas.width=canvas.height=0;}
      if(task)await task.destroy().catch(()=>{});
    }
  }
  return {button,bind,close,refreshBusy,toPNG};
})();
