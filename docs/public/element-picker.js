/**
 * ============================================================================
 * element-picker.js — 页面元素拾取器（点选 → 结构化引用卡 → 自动复制剪贴板）
 * ============================================================================
 *
 * 【用途】
 * 让用户把「有问题的 DOM 元素」精确传达给 AI agent：点亮后悬停即高亮元素，
 * 点击即生成引用卡（唯一 selector / 样式 / 盒模型 / 源码线索）并写入剪贴板，
 * 用户直接粘贴给 agent。与 agent 工作流的衔接：agent 收到引用卡后，用
 * chrome-devtools MCP 或 agent-browser 按 selector / fallbackPath 定位元素
 * 复核，按 sourceHint 在本仓库 packages/ 内 grep 源码。
 *
 * 【两种点亮方式（脚本自检运行环境）】
 * 1. bookmarklet（生产站点手动点亮）：把本文件的 IIFE 全文前面加 `javascript:`
 *    前缀做成浏览器书签 URL，任意域名可手动点亮；
 * 2. VitePress dev server 自动注入（本地 dev 自动可用）：注入方先执行
 *    window.__ELEMENT_PICKER_AUTO__ = true 再加载本脚本；脚本仅当
 *    location.hostname 为 localhost / 127.0.0.1 / *.local 时才接受「自动点亮」，
 *    其余域名（生产站点）一律拒绝，防止误触发。
 *
 * 【熄灭方式（三选一，等价；均完整清理全部注入 DOM 与事件监听）】
 * - 拾取模式下按 Esc；
 * - 再次执行本脚本 / 再次点击书签（切换开关：点亮 ↔ 熄灭）；
 * - 控制台执行 window.__ELEMENT_PICKER_DEACTIVATE__()。
 *
 * 【引用卡 JSON 字段】schemaVersion / selector（唯一性已验证；shadow 内为
 * `host >>> inner` 穿透形式）/ fallbackPath（nth-of-type 全路径兜底）/
 * element / styles / box / htmlSnippet / sourceHint（挂件源码映射）/
 * capturedFrom / capturedAt / inShadowDom / shadowHostChain，见 buildCard()。
 *
 * 【工程约束】零第三方依赖、单文件 IIFE、无构建步骤；注入样式全部带
 * `element-picker-` 前缀并在熄灭时移除；事件监听全部登记、熄灭时对称移除
 * （document 级监听以 { capture: true, passive: false } 注册并以同一对象移除）；
 * overlay / toast 的 z-index 固定 2147483647（最大值），确保盖过页面一切元素。
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var ACTIVE_KEY = '__ELEMENT_PICKER_ACTIVE__';
  var AUTO_KEY = '__ELEMENT_PICKER_AUTO__';
  var DEACTIVATE_KEY = '__ELEMENT_PICKER_DEACTIVATE__';
  var PREFIX = 'element-picker-';
  var Z_MAX = '2147483647';

  /* ---- 0. 点亮 / 熄灭开关与环境自检 ---- */

  function isLocalHost() {
    var h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || /\.local$/.test(h);
  }

  // 已点亮：本次执行视为「再次调用」，切换为熄灭（toggle）
  if (window[ACTIVE_KEY] && typeof window[DEACTIVATE_KEY] === 'function') {
    window[DEACTIVATE_KEY]();
    return;
  }

  // 自动点亮仅允许本地开发域名；生产站点只能 bookmarklet 手动点亮
  if (window[AUTO_KEY] === true && !isLocalHost()) {
    console.warn(
      '[element-picker] 检测到自动点亮请求，但当前域名 "' + location.hostname +
      '" 不是本地开发环境（localhost / 127.0.0.1 / *.local），已拒绝自动点亮；' +
      '生产站点请通过 bookmarklet 手动点亮。'
    );
    return;
  }

  /* ---- 1. 内部状态：全部可撤销资源登记在此 ---- */

  var state = {
    styleEl: null,
    hoverBox: null,
    hoverBadge: null,
    pinBox: null,
    toastEl: null,
    pinTimer: null,
    toastTimer: null,
    listeners: [], // { target, type, fn, options }
    lastEl: null
  };

  function addListener(target, type, fn, options) {
    target.addEventListener(type, fn, options);
    state.listeners.push({ target: target, type: type, fn: fn, options: options });
  }

  function mount(el) {
    (document.body || document.documentElement).appendChild(el);
  }

  function makeEl(id, css) {
    var d = document.createElement('div');
    d.id = PREFIX + id;
    d.style.cssText = css;
    return d;
  }

  var CSS_HOVER =
    'position:fixed;left:0;top:0;width:0;height:0;display:none;' +
    'outline:2px solid #ff00ff;outline-offset:0;background:rgba(255,0,255,0.12);' +
    'pointer-events:none;z-index:' + Z_MAX + ';';
  var CSS_BADGE =
    'position:fixed;left:0;top:0;display:none;pointer-events:none;z-index:' + Z_MAX + ';' +
    'background:#ff00ff;color:#fff;font:12px/1.5 Consolas,Menlo,monospace;' +
    'padding:2px 8px;border-radius:3px;white-space:nowrap;max-width:60vw;' +
    'overflow:hidden;text-overflow:ellipsis;';
  var CSS_PIN =
    'position:fixed;left:0;top:0;width:0;height:0;display:none;' +
    'outline:3px solid #cc00cc;outline-offset:1px;background:rgba(255,0,255,0.18);' +
    'pointer-events:none;z-index:' + Z_MAX + ';';
  var CSS_TOAST =
    'position:fixed;top:16px;right:16px;display:none;pointer-events:none;z-index:' + Z_MAX + ';' +
    'background:#1f1f1f;color:#fff;border-left:3px solid #ff00ff;' +
    'font:13px/1.6 system-ui,-apple-system,sans-serif;padding:10px 14px;' +
    'border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.25);max-width:40vw;';

  /* ---- 2. 选择器生成（核心算法） ----
   * 优先级：#id → 祖先链组合（目标 + 至多 5 层祖先，每层取首个稳定 class，
   * 每级用 root.querySelectorAll(sel).length === 1 验证唯一性，不唯一就加深
   * / 降级）→ :nth-of-type 全路径兜底（永远生成，作为 fallbackPath）。
   * root 传 document（普通 DOM）或 ShadowRoot（shadow 内按其作用域验证唯一性）。
   */

  function cssEscape(s) {
    try {
      if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
    } catch (e) { /* 忽略 */ }
    return String(s).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
  }

  function isStableClass(c) {
    if (!c || c.length < 2) return false;
    if (/^(css|sc)-/.test(c)) return false; // CSS Modules / styled-components 产物
    if (c.indexOf('__') !== -1 && /[0-9a-f]{6,}/i.test(c)) return false; // Button__a1b2c3
    // 哈希特征：含数字的 6+ 位十六进制连续段；纯字母英文单词（如 feedback）不误伤
    if (/\d/.test(c) && /[0-9a-f]{6,}/i.test(c)) return false;
    return true;
  }

  function firstStableClass(el) {
    var list = el.classList;
    for (var i = 0; i < list.length; i++) {
      if (isStableClass(list[i])) return list[i];
    }
    return '';
  }

  function partSel(el) {
    var cls = firstStableClass(el);
    return el.tagName.toLowerCase() + (cls ? '.' + cssEscape(cls) : '');
  }

  function nthIndex(el) {
    var count = 1;
    var sib = el.previousElementSibling;
    while (sib) {
      if (sib.tagName === el.tagName) count++;
      sib = sib.previousElementSibling;
    }
    return count;
  }

  function nthPath(el) {
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1) {
      parts.unshift(node.tagName.toLowerCase() + ':nth-of-type(' + nthIndex(node) + ')');
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function uniqueIn(root, sel, el) {
    if (!sel) return false;
    var nodes;
    try {
      nodes = root.querySelectorAll(sel);
    } catch (e) {
      return false; // 非法选择器直接判不唯一
    }
    return nodes.length === 1 && nodes[0] === el;
  }

  function buildSelector(el, root) {
    var fallback = nthPath(el);
    // 1) #id（存在且在作用域内唯一）
    if (el.id) {
      var idSel = '#' + cssEscape(el.id);
      if (uniqueIn(root, idSel, el)) return { sel: idSel, fallback: fallback };
    }
    // 2) 祖先链组合：目标 + 至多 5 层祖先，逐级加深直到唯一
    var chain = [el];
    for (var depth = 0; depth <= 5; depth++) {
      var sel = chain.map(partSel).join(' ');
      if (uniqueIn(root, sel, el)) return { sel: sel, fallback: fallback };
      var parent = chain[chain.length - 1].parentElement;
      if (!parent) break; // 到达 documentElement 或 shadow root 边界
      chain.push(parent);
    }
    // 3) 兜底：nth-of-type 全路径
    return { sel: fallback, fallback: fallback };
  }

  /* ---- 3. shadow DOM 分析 ----
   * 用 event.composedPath() 取真实目标；路径中 ShadowRoot 的下一个节点即 host，
   * 逐级向外收集 host 链，选择器写成 `hostSel >>> innerSel`（DevTools 同款穿透标记）。
   */

  function analyzeShadow(path) {
    var bounds = []; // { root, host }，按内层 → 外层排列
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (
        typeof ShadowRoot !== 'undefined' &&
        n instanceof ShadowRoot &&
        path[i + 1] instanceof Element
      ) {
        bounds.push({ root: n, host: path[i + 1] });
      }
    }
    if (!bounds.length) return { inShadow: false, chain: '', selector: '', fallbackPath: '' };
    var inner = buildSelector(path[0], bounds[0].root); // 最内层元素在其 shadow root 内的选择器
    var hostSels = [];
    for (var j = 0; j < bounds.length; j++) {
      var scopeRoot = j + 1 < bounds.length ? bounds[j + 1].root : document;
      hostSels.push(buildSelector(bounds[j].host, scopeRoot).sel);
    }
    hostSels.reverse(); // 外层 → 内层
    return {
      inShadow: true,
      chain: hostSels.join(' >>> '),
      selector: hostSels.join(' >>> ') + ' >>> ' + inner.sel,
      fallbackPath: inner.fallback
    };
  }

  /* ---- 4. sourceHint 组件映射表（数据来自真实源码探查） ---- */

  var SOURCE_HINT_MAP = [
    // 特异性高的 key 放前面（前缀包含匹配：class 以 key 开头即命中）
    ['ai-chat-floating-button', 'packages/ai-vue/src/components/ai-chat/AiChatFloatingButton.vue'],
    ['ai-chat-example', 'packages/ai-vue/src/components/ai-chat/parts/AiChatExampleQuestions.vue'],
    ['example-questions', 'packages/ai-vue/src/components/ai-chat/parts/AiChatExampleQuestions.vue'],
    ['ai-chat', 'packages/ai-vue/src/components/ai-chat/AiChat.vue'],
    ['ai-modal-chat', 'packages/ai-vue/src/components/ai-modal-chat/AiModalChat.vue'],
    ['ai-sidebar-chat', 'packages/ai-vue/src/components/ai-sidebar-chat/AiSidebarChat.vue'],
    ['ai-shadow-root', 'packages/ai-vue/src/components/ai-shadow-root/AiShadowRoot.vue'],
    ['search-result-card', 'packages/ai-vue/src/components/ai-chat/cards/SearchResultCard.vue'],
    ['source-list-card', 'packages/ai-vue/src/components/ai-chat/cards/SourceListCard.vue'],
    ['feedback', 'packages/ai-vue/src/components/ai-chat/parts/AiChatFeedback.vue'],
    ['message-actions', 'packages/ai-vue/src/components/ai-chat/parts/AiChatMessageActions.vue']
  ];

  function sourceHint(el) {
    // 收集目标元素及其祖先的全部 class
    var classes = [];
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var list = n.classList;
      for (var i = 0; i < list.length; i++) {
        if (classes.indexOf(list[i]) === -1) classes.push(list[i]);
      }
    }
    for (var k = 0; k < SOURCE_HINT_MAP.length; k++) {
      for (var m = 0; m < classes.length; m++) {
        if (classes[m].indexOf(SOURCE_HINT_MAP[k][0]) === 0) {
          return 'class 特征 "' + SOURCE_HINT_MAP[k][0] + '" → ' + SOURCE_HINT_MAP[k][1] +
            '（本仓库源码，可 grep）';
        }
      }
    }
    for (var j = 0; j < classes.length; j++) {
      if (classes[j].indexOf('elx-') === 0) {
        return 'elx-* 组件 → node_modules/vue-element-plus-x（第三方库内部，非本仓库源码）';
      }
    }
    return '无已知映射，建议 agent 用 selector + text 在 packages/ 内 grep';
  }

  /* ---- 5. 引用卡生成 ---- */

  function buildCard(el, shadowInfo) {
    var cs = getComputedStyle(el);
    var rect = el.getBoundingClientRect();
    var selector, fallbackPath;
    if (shadowInfo.inShadow) {
      selector = shadowInfo.selector;
      fallbackPath = shadowInfo.fallbackPath;
    } else {
      var picked = buildSelector(el, document);
      selector = picked.sel;
      fallbackPath = picked.fallback;
    }
    var html = el.outerHTML;
    if (html.length > 300) html = html.slice(0, 300) + '…';
    return {
      schemaVersion: '1.0',
      selector: selector,
      fallbackPath: fallbackPath,
      element: {
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        classes: Array.prototype.slice.call(el.classList),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
      },
      styles: {
        display: cs.display,
        position: cs.position,
        zIndex: cs.zIndex,
        backgroundColor: cs.backgroundColor,
        color: cs.color,
        fontSize: cs.fontSize,
        padding: cs.padding,
        borderRadius: cs.borderRadius,
        overflow: cs.overflow
      },
      box: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      htmlSnippet: html,
      sourceHint: sourceHint(el),
      capturedFrom: location.href + ' @ ' + window.innerWidth + 'x' + window.innerHeight,
      capturedAt: new Date().toISOString(),
      inShadowDom: shadowInfo.inShadow === true,
      shadowHostChain: shadowInfo.chain || ''
    };
  }

  /* ---- 6. 剪贴板与 toast ---- */

  function copyText(text, done) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(
        function () { done(true); },
        function () { execCopy(text, done); } // 权限被拒 / 非安全上下文 → 兜底
      );
    } else {
      execCopy(text, done);
    }
  }

  function execCopy(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText =
        'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      mount(ta);
      ta.select();
      try { ta.setSelectionRange(0, text.length); } catch (e) { /* 老浏览器忽略 */ }
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      if (ta.parentNode) ta.parentNode.removeChild(ta);
      done(ok);
    } catch (e) {
      done(false);
    }
  }

  function showToast(msg) {
    var t = state.toastEl;
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () {
      if (state.toastEl) state.toastEl.style.display = 'none';
    }, 3000);
  }

  /* ---- 7. 悬停高亮与点选 ---- */

  function describe(el) {
    var cls = Array.prototype.slice.call(el.classList, 0, 2).join('.');
    var s = el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (el.id ? '#' + el.id : '');
    return s.length > 60 ? s.slice(0, 60) + '…' : s;
  }

  function showHover(el) {
    var box = state.hoverBox;
    var badge = state.hoverBadge;
    if (!box || !badge) return;
    var r = el.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = r.left + 'px';
    box.style.top = r.top + 'px';
    box.style.width = r.width + 'px';
    box.style.height = r.height + 'px';
    badge.style.display = 'block';
    badge.textContent = describe(el);
    var bw = badge.offsetWidth;
    var bh = badge.offsetHeight;
    var left = Math.max(2, Math.min(r.left, window.innerWidth - bw - 2));
    var top = r.top - bh - 4;
    if (top < 2) top = Math.min(r.bottom + 4, window.innerHeight - bh - 2);
    if (top < 2) top = 2;
    badge.style.left = left + 'px';
    badge.style.top = top + 'px';
  }

  function hideHover() {
    if (state.hoverBox) state.hoverBox.style.display = 'none';
    if (state.hoverBadge) state.hoverBadge.style.display = 'none';
  }

  function pin(el) {
    var p = state.pinBox;
    if (!p) return;
    clearTimeout(state.pinTimer);
    var r = el.getBoundingClientRect();
    p.style.display = 'block';
    p.style.left = r.left + 'px';
    p.style.top = r.top + 'px';
    p.style.width = r.width + 'px';
    p.style.height = r.height + 'px';
    state.pinTimer = setTimeout(function () {
      if (state.pinBox) state.pinBox.style.display = 'none';
    }, 3000);
  }

  function onMove(e) {
    var path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
    var el = path[0];
    if (!(el instanceof Element)) {
      hideHover();
      return;
    }
    state.lastEl = el;
    showHover(el);
  }

  function onViewportChange() {
    if (state.lastEl && state.lastEl.isConnected) showHover(state.lastEl);
    else hideHover();
  }

  function onPick(e) {
    // 捕获阶段拦截：阻止页面真实行为（导航 / 表单 / 业务点击等）
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    var path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
    var el = path[0];
    if (!(el instanceof Element)) return;
    var card;
    try {
      card = buildCard(el, analyzeShadow(path));
    } catch (err) {
      console.error('[element-picker] 引用卡生成失败：', err);
      return;
    }
    console.log('[element-picker]', card);
    var json = JSON.stringify(card, null, 2);
    copyText(json, function (ok) {
      if (ok) {
        showToast('✓ 引用卡已复制到剪贴板');
      } else {
        showToast('✗ 剪贴板不可用，请从控制台手动复制');
        console.log('[element-picker] 剪贴板写入失败，请手动复制下方 JSON：\n' + json);
        try { console.table(card); } catch (err2) { /* 老环境忽略 */ }
      }
    });
    pin(el);
  }

  function onKey(e) {
    if (e.key === 'Escape') deactivate();
  }

  /* ---- 8. 点亮 / 熄灭 ---- */

  function activate() {
    var style = document.createElement('style');
    style.id = PREFIX + 'style';
    style.textContent =
      '.' + PREFIX + 'picking, .' + PREFIX + 'picking * { cursor: crosshair !important; }';
    (document.head || document.documentElement).appendChild(style);
    state.styleEl = style;
    document.documentElement.classList.add(PREFIX + 'picking');

    state.hoverBox = makeEl('hover-box', CSS_HOVER);
    state.hoverBadge = makeEl('hover-badge', CSS_BADGE);
    state.pinBox = makeEl('pin-box', CSS_PIN);
    state.toastEl = makeEl('toast', CSS_TOAST);
    mount(state.hoverBox);
    mount(state.hoverBadge);
    mount(state.pinBox);
    mount(state.toastEl);

    addListener(document, 'mousemove', onMove, { capture: true, passive: true });
    addListener(document, 'click', onPick, { capture: true, passive: false });
    addListener(document, 'keydown', onKey, { capture: true, passive: false });
    addListener(window, 'scroll', onViewportChange, { capture: true, passive: true });
    addListener(window, 'resize', onViewportChange, { passive: true });

    window[ACTIVE_KEY] = true;
    window[DEACTIVATE_KEY] = deactivate;

    console.log(
      '[element-picker] 已点亮拾取模式：悬停高亮 → 点击生成引用卡并自动复制 → ' +
      'Esc / 再次执行本脚本 = 熄灭'
    );
  }

  function deactivate() {
    var i;
    for (i = 0; i < state.listeners.length; i++) {
      var l = state.listeners[i];
      l.target.removeEventListener(l.type, l.fn, l.options);
    }
    state.listeners = [];
    clearTimeout(state.pinTimer);
    clearTimeout(state.toastTimer);
    if (state.styleEl && state.styleEl.parentNode) {
      state.styleEl.parentNode.removeChild(state.styleEl);
    }
    state.styleEl = null;
    var nodes = [state.hoverBox, state.hoverBadge, state.pinBox, state.toastEl];
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i] && nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
    }
    state.hoverBox = state.hoverBadge = state.pinBox = state.toastEl = null;
    state.lastEl = null;
    document.documentElement.classList.remove(PREFIX + 'picking');
    delete window[DEACTIVATE_KEY];
    delete window[ACTIVE_KEY];
    console.log('[element-picker] 已熄灭：全部 overlay 与事件监听已清理');
  }

  activate();
})();
