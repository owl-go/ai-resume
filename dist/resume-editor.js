'use strict';
const ResumeEditor = (() => {
  function paperStyle() {
    const value = ResumeFormat.appearanceFor(state.appearance);
    const template = ResumeFormat.presentationFor(state.layout,value);
    return esc(`--resume-accent:${template.accent};--resume-tint:${template.tint};--resume-font:${ResumeFormat.fonts[value.font].css};--resume-size:${value.fontSize}px;--resume-name-size:${value.fontSize+5}px;--resume-heading-size:${value.fontSize+2}px;--resume-line-height:${value.lineHeight};--resume-margin:${value.margin}px`);
  }
  const toolIcon = name => `<i class="format-icon format-icon-${name}" aria-hidden="true"></i>`;
  const selectCaret = `<span class="format-select-caret" aria-hidden="true"><svg width="8" height="12" viewBox="0 0 10 14" fill="none"><path d="m2 5 3-3 3 3M2 9l3 3 3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
  function toolbar(disabled = '') {
    const value = ResumeFormat.appearanceFor(state.appearance);
    const color = ResumeFormat.presentationFor(state.layout,value).accent;
    const fontWidth = ({arial:40,roboto:52,opensans:70,lato:38})[value.font] || 36;
    const margins = [...new Set([8,12,16,20,24,28,32,36,40,48,60,value.margin])].sort((a,b)=>a-b);
    return `<div class="resume-format-tools" role="toolbar" aria-label="简历排版">
      <div class="format-group">
        <button type="button" class="format-button" data-module-order title="模块顺序" ${disabled}>${toolIcon('menu-line')}<span>模块顺序</span></button>
        <button type="button" class="format-button" data-open-templates title="更换模板" ${disabled}>${toolIcon('layout-2-line')}<span>更换模板</span></button>
      </div>
      <div class="format-group">
        <label class="format-control format-font" title="字体" style="--font-select-width:${fontWidth}px">${toolIcon('font-size')}<span class="format-select-field"><select data-appearance="font" aria-label="简历字体" ${disabled}>${Object.entries(ResumeFormat.fonts).map(([key,font])=>`<option value="${key}" ${value.font===key?'selected':''}>${font.name}</option>`).join('')}</select>${selectCaret}</span></label>
        <label class="format-control format-size" title="字号">${toolIcon('font-family')}<span>字号</span><span class="format-select-field"><select data-appearance="fontSize" aria-label="简历字号" ${disabled}>${Array.from({length:9},(_,index)=>index+10).map(size=>`<option value="${size}" ${value.fontSize===size?'selected':''}>${size}</option>`).join('')}</select>${selectCaret}</span></label>
      </div>
      <div class="format-group">
        <label class="format-control format-line-height" title="行高">${toolIcon('line-height')}<span>行高</span><span class="format-select-field"><select data-appearance="lineHeight" aria-label="简历行高" ${disabled}>${[1.2,1.3,1.4,1.5,1.6,1.7,1.8,1.9,2,2.1,2.2].map(height=>`<option value="${height}" ${value.lineHeight===height?'selected':''}>${height}</option>`).join('')}</select>${selectCaret}</span></label>
        <label class="format-control format-margin" title="边距（px）">${toolIcon('space')}<span>边距</span><span class="format-select-field"><select data-appearance="margin" aria-label="简历边距（px）" ${disabled}>${margins.map(margin=>`<option value="${margin}" ${value.margin===margin?'selected':''}>${margin}px</option>`).join('')}</select>${selectCaret}</span></label>
      </div>
      <div class="format-group format-color-group">
        <button type="button" class="resume-color-control" data-color-palette aria-label="简历主题色" title="主题色" aria-haspopup="dialog" aria-controls="resumeColorPalette" aria-expanded="false" style="--color-swatch:${color}" ${disabled}><span aria-hidden="true"></span></button>
      </div>
    </div>`;
  }
  function apply(change) {
    if (state.busy || state.importBusy) return false;
    try {
      const next = ResumeFormat.appearanceFor({...state.appearance,...change});
      if (state.editing) saveResumeEdits();
      state.appearance = next;
      persistResumeDraft();
      render();
      return true;
    } catch (error) { toast(error.message); return false; }
  }
  const paletteColors = [
    ['炭黑','#25262b'],['深灰','#525866'],['灰色','#7b8193'],['浅灰','#a4a9b5'],['银灰','#c4c8d0'],['白色','#ffffff'],
    ['深蓝','#213b70'],['靛蓝','#345fd8'],['蓝紫','#4255d9'],['蓝色','#2563eb'],['天蓝','#2584b5'],['浅蓝','#7da8e8'],
    ['深紫','#593b80'],['紫色','#7350ab'],['鸢紫','#8b5fc0'],['淡紫','#a88bd1'],['莓红','#b54b7d'],['玫瑰','#d579a0'],
    ['深棕','#78543d'],['棕色','#9b6a40'],['赭色','#b56b32'],['橙色','#d68b38'],['珊瑚','#c45f56'],['红色','#b74444']
  ];
  let paletteBound = false;
  function positionPalette() {
    const palette=$('resumeColorPalette');
    if (!palette.matches(':popover-open')) return;
    const trigger=document.querySelector('[data-color-palette]');
    if (!trigger) {palette.hidePopover();return;}
    const rect=trigger.getBoundingClientRect(), width=palette.offsetWidth, height=palette.offsetHeight;
    const viewportHeight=window.visualViewport?.height || innerHeight;
    const viewportTop=window.visualViewport?.offsetTop || 0;
    const below=viewportTop+viewportHeight-rect.bottom;
    const top=below<height+8 && rect.top-viewportTop>below ? rect.top-height-8 : rect.bottom+8;
    palette.style.left=Math.max(8,Math.min(rect.right-width,innerWidth-width-8))+'px';
    palette.style.top=Math.max(viewportTop+8,Math.min(top,viewportTop+viewportHeight-height-8))+'px';
  }
  function syncPalette() {
    const palette=$('resumeColorPalette');
    const value=ResumeFormat.presentationFor(state.layout,state.appearance).accent.toLowerCase();
    const selected=palette.querySelector(`[data-palette-color="${value}"]`) || palette.querySelector('[data-palette-color]');
    palette.querySelectorAll('[data-palette-color]').forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.paletteColor===value));
      button.tabIndex=button===selected ? 0 : -1;
    });
    $('resumeColorHex').value=value;
    $('resumeColorHex').removeAttribute('aria-invalid');
    $('paletteCurrentColor').textContent=value.toUpperCase();
    $('paletteCustomPreview').style.backgroundColor=value;
    $('paletteColorError').hidden=true;
    palette.querySelector('[data-reset-color]').disabled=!state.appearance.accent;
    document.querySelectorAll('[data-color-palette]').forEach(button=>button.setAttribute('aria-expanded',String(palette.matches(':popover-open'))));
  }
  function bindPalette() {
    const palette=$('resumeColorPalette');
    if (!paletteBound) {
      paletteBound=true;
      $('resumeColorSwatches').innerHTML=paletteColors.map(([name,color])=>`<button type="button" class="palette-swatch" data-palette-color="${color}" style="--palette-color:${color}" aria-label="${name} ${color}" aria-pressed="false" title="${name} ${color}"><span aria-hidden="true">${toolIcon('check-line')}</span></button>`).join('');
      palette.querySelectorAll('[data-palette-color]').forEach(button=>button.onclick=()=>{
        if (apply({accent:button.dataset.paletteColor})) {syncPalette();button.focus();}
      });
      $('resumeColorSwatches').onkeydown=event=>{
        const button=event.target.closest('[data-palette-color]');
        if (!button || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const buttons=Array.from(palette.querySelectorAll('[data-palette-color]')),index=buttons.indexOf(button);
        const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+({ArrowLeft:-1,ArrowRight:1,ArrowUp:-6,ArrowDown:6}[event.key])));
        buttons.forEach((item,i)=>item.tabIndex=i===next?0:-1);
        buttons[next].focus();
      };
      $('resumeColorCustom').onsubmit=event=>{
        event.preventDefault();
        const value=$('resumeColorHex').value.trim();
        const color=value.startsWith('#')?value:'#'+value;
        if (!/^#[0-9a-f]{6}$/i.test(color)) {
          $('paletteColorError').hidden=false;
          $('resumeColorHex').setAttribute('aria-invalid','true');
          $('resumeColorHex').focus();
          return;
        }
        if (apply({accent:color.toLowerCase()})) {syncPalette();$('resumeColorHex').removeAttribute('aria-invalid');$('resumeColorHex').focus();}
      };
      $('resumeColorHex').oninput=()=>{
        $('paletteColorError').hidden=true;
        $('resumeColorHex').removeAttribute('aria-invalid');
        const value=$('resumeColorHex').value.trim();
        if (/^#?[0-9a-f]{6}$/i.test(value)) $('paletteCustomPreview').style.backgroundColor=value.startsWith('#')?value:'#'+value;
      };
      const close=()=>{palette.hidePopover();document.querySelector('[data-color-palette]')?.focus();};
      $('closeResumePalette').onclick=close;
      palette.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}};
      palette.ontoggle=()=>{
        document.querySelectorAll('[data-color-palette]').forEach(button=>button.setAttribute('aria-expanded',String(palette.matches(':popover-open'))));
      };
      window.addEventListener('resize',positionPalette);
      document.addEventListener('scroll',positionPalette,true);
    }
    document.querySelectorAll('[data-color-palette]').forEach(button=>{
      button.setAttribute('aria-expanded',String(palette.matches(':popover-open')));
      button.onclick=()=>{
        if (palette.matches(':popover-open')) {palette.hidePopover();return;}
        syncPalette();
        palette.showPopover();
        button.setAttribute('aria-expanded','true');
        positionPalette();
        palette.querySelector('[data-palette-color][tabindex="0"]').focus({preventScroll:true});
      };
    });
  }
  let orderDrag = null;
  const orderCards = lane => Array.from(lane.querySelectorAll('[data-order-key]'));
  function saveOrder(lane, key) {
    const keys = orderCards(lane).map(card=>card.dataset.orderKey), members = new Set(keys);
    let index = 0;
    const updated = state.appearance.sectionOrder.map(field=>members.has(field) ? keys[index++] : field);
    if (updated.join() !== state.appearance.sectionOrder.join() && !apply({sectionOrder:updated})) { renderOrder();return; }
    renderOrder();
    const card = $('moduleOrderList').querySelector(`[data-order-key="${key}"]`);
    card?.focus({preventScroll:true});
    const position = keys.indexOf(key)+1;
    $('moduleOrderStatus').textContent = `已将${card?.textContent.trim()}移至${lane.dataset.orderLane === 'side' ? '侧边栏' : '主页面'}第 ${position} 位`;
  }
  function finishOrderDrag(commit) {
    const drag = orderDrag;
    if (!drag) return;
    orderDrag = null;
    drag.ghost?.remove();
    drag.card.classList.remove('is-dragging');
    $('moduleOrderDialog').classList.remove('is-sorting');
    if ($('moduleOrderList').hasPointerCapture(drag.pointerId)) $('moduleOrderList').releasePointerCapture(drag.pointerId);
    if (drag.moved && commit && drag.allowed) saveOrder(drag.lane,drag.card.dataset.orderKey);
    else if (drag.moved) {
      const key=drag.card.dataset.orderKey;
      renderOrder();
      $('moduleOrderList').querySelector(`[data-order-key="${key}"]`)?.focus({preventScroll:true});
    }
  }
  function renderOrder() {
    const side = ResumeFormat.templateFor(state.layout).side;
    const groups = side ? [['main','主页面',false],['side','侧边栏',true]] : [['main','主页面',null]];
    const root = $('moduleOrderList');
    root.classList.toggle('is-two-column',Boolean(side));
    root.innerHTML = groups.map(([id,label,isSide])=>{
      const keys = state.appearance.sectionOrder.filter(key=>isSide === null || ResumeFormat.sideFields.includes(key) === isSide);
      return `<section class="module-order-column" aria-labelledby="order-${id}-title">
        <h3 id="order-${id}-title">${label}</h3>
        <ol class="module-order-lane" data-order-lane="${id}" aria-label="${label}模块顺序">${keys.map((key,index)=>`<li><button type="button" class="module-order-card" data-order-key="${key}" aria-label="${ResumeFormat.sections.find(([field])=>field===key)[1]}，${label}第 ${index+1} 项" title="拖动调整顺序，也可使用上下方向键"><span class="module-drag-handle" aria-hidden="true"></span><span>${ResumeFormat.sections.find(([field])=>field===key)[1]}</span></button></li>`).join('')}</ol>
      </section>`;
    }).join('');
    root.onkeydown = event=>{
      const card = event.target.closest('[data-order-key]');
      if (!card || !['ArrowUp','ArrowDown','Home','End'].includes(event.key) || orderDrag) return;
      event.preventDefault();
      const lane = card.closest('[data-order-lane]'), cards = orderCards(lane), index = cards.indexOf(card);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length-1 : index+(event.key === 'ArrowUp' ? -1 : 1);
      if (next<0 || next>=cards.length || next===index) return;
      lane.insertBefore(card.parentElement,next<index ? cards[next].parentElement : cards[next].parentElement.nextSibling);
      saveOrder(lane,card.dataset.orderKey);
    };
    root.onpointerdown = event=>{
      const card = event.target.closest('[data-order-key]');
      if (!card || event.button!==0 || !event.isPrimary || state.busy || state.importBusy) return;
      card.focus({preventScroll:true});
      const rect = card.getBoundingClientRect();
      orderDrag = {card,lane:card.closest('[data-order-lane]'),pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,offsetX:event.clientX-rect.left,offsetY:event.clientY-rect.top,width:rect.width,moved:false,allowed:true};
      root.setPointerCapture(event.pointerId);
    };
    root.onpointermove = event=>{
      const drag = orderDrag;
      if (!drag || drag.pointerId!==event.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<5) return;
      event.preventDefault();
      if (!drag.moved) {
        drag.moved = true;
        drag.ghost = drag.card.cloneNode(true);
        drag.ghost.removeAttribute('data-order-key');
        drag.ghost.removeAttribute('aria-label');
        drag.ghost.setAttribute('aria-hidden','true');
        drag.ghost.tabIndex = -1;
        drag.ghost.classList.add('module-order-ghost');
        drag.ghost.style.width = drag.width+'px';
        $('moduleOrderDialog').append(drag.ghost);
        drag.card.classList.add('is-dragging');
        $('moduleOrderDialog').classList.add('is-sorting');
      }
      drag.ghost.style.left = event.clientX-drag.offsetX+'px';
      drag.ghost.style.top = event.clientY-drag.offsetY+'px';
      drag.allowed = document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-order-lane]') === drag.lane;
      drag.ghost.classList.toggle('is-blocked',!drag.allowed);
      if (!drag.allowed) return;
      const before = orderCards(drag.lane).filter(card=>card!==drag.card).find(card=>event.clientY<card.getBoundingClientRect().top+card.getBoundingClientRect().height/2);
      drag.lane.insertBefore(drag.card.parentElement,before?.parentElement || null);
    };
    root.onpointerup = event=>{if(orderDrag?.pointerId===event.pointerId)finishOrderDrag(true);};
    root.onpointercancel = ()=>finishOrderDrag(false);
    root.onlostpointercapture = ()=>finishOrderDrag(false);
  }
  function bind() {
    bindPalette();
    document.querySelectorAll('[data-appearance]').forEach(control=>{
      control.onchange=()=>{
        const key=control.dataset.appearance;
        const value=['fontSize','lineHeight','margin'].includes(key)?Number(control.value):control.value;
        if (!apply({[key]:value})) control.value = state.appearance[key] ?? ResumeFormat.presentationFor(state.layout,state.appearance).accent;
        document.querySelector(`[data-appearance="${key}"]`)?.focus();
      };
      if (control.type==='number') control.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();control.blur();}};
    });
    document.querySelectorAll('[data-reset-color]').forEach(button=>button.onclick=()=>{if(apply({accent:null}))syncPalette();});
    document.querySelectorAll('[data-module-order]').forEach(button=>button.onclick=()=>{
      if (state.editing) {saveResumeEdits();render();}
      $('moduleOrderStatus').textContent = '';
      renderOrder();
      $('moduleOrderDialog').showModal();
    });
    $('closeModuleOrder').onclick=()=>$('moduleOrderDialog').close();
    $('moduleOrderDialog').oncancel=event=>{if(orderDrag){event.preventDefault();finishOrderDrag(false);}};
    $('moduleOrderDialog').onclose=()=>{finishOrderDrag(false);document.querySelector('[data-module-order]')?.focus();};
  }
  return {toolbar,paperStyle,bind,toolIcon};
})();
