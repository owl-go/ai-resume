'use strict';
const ResumeTemplates = (() => {
  let trigger = null;

  function thumbnail(template) {
    const section = (title,content) => `<section><i>${title}</i>${content.map(text => `<p>${text}</p>`).join('')}</section>`;
    const education = section('教育背景',['浙江某大学 · 本科','信息管理与信息系统　2018—2022']);
    const skills = section('技能工具',['产品设计　需求分析　项目推进','Axure · Figma · SQL · Dify']);
    const side = template.side ? `<span class="template-mini-side">${education}${skills}${section('核心能力',['业务流程梳理与产品规划','跨团队协作与交付验收'])}</span>` : '';
    const content = section('个人优势',['4 年企业服务产品经验，覆盖采购、库存与经营分析场景，持续关注业务流程与交付质量。'])
      + (template.side ? '' : education)
      + section('工作经历',['某企业服务科技有限公司　产品经理','2022.07—至今','• 围绕采购与库存场景开展需求访谈和流程梳理。','• 负责产品方案设计，协同研发与测试完成版本交付。','• 梳理经营指标口径，为业务分析提供依据。'])
      + section('项目经历',['ERP 采购协同 · 产品设计','• 梳理审批与入库流程，形成需求与验收标准。','WMS 库存管理 · 版本交付','• 设计出入库及盘点功能，根据反馈推进迭代。'])
      + (template.side ? '' : skills);
    return `<span class="template-mini" aria-hidden="true" data-heading="${template.heading}" data-header="${template.header}" data-side="${template.side || ''}" style="--resume-accent:${template.accent};--resume-tint:${template.tint}"><span class="template-mini-profile"><strong>林知远</strong><em>产品经理 · 企业服务</em><small>联系方式 · 求职意向</small></span><span class="template-mini-columns"><span class="template-mini-main">${content}</span>${side}</span></span>`;
  }

  function renderGallery() {
    const selected = state.layout || 'classic';
    $('templateGrid').innerHTML = Object.entries(ResumeFormat.templates)
      .map(([key,template]) => `<button class="template-card" type="button" data-template="${key}" aria-pressed="${key === selected}" aria-label="${template.name}模板">${thumbnail(template)}<span class="template-card-name">${template.name}<span class="template-selected" aria-hidden="true">${key === selected ? '✓' : ''}</span></span></button>`).join('');
    document.querySelectorAll('[data-template]').forEach(button => button.onclick = () => {
      state.layout = button.dataset.template;
      persistResumeDraft();
      $('templateDialog').close();
      render();
      document.querySelector('[data-open-templates]')?.focus();
    });
  }

  function open(button) {
    if (!hasResume() || state.busy || state.importBusy) return;
    if (state.editing) { saveResumeEdits(); render(); }
    trigger = button;
    renderGallery();
    $('closeTemplates').onclick = () => $('templateDialog').close();
    $('templateDialog').onclose = () => {
      (trigger?.isConnected ? trigger : document.querySelector('[data-open-templates]'))?.focus();
    };
    $('templateDialog').showModal();
    $('templateGrid').querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
    $('templateDialog').scrollTop = 0;
    $('templateGrid').scrollTop = 0;
  }

  return {open};
})();
