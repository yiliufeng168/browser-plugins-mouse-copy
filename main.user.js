// ==UserScript==
// @name         Mouse Move Text Extractor with Highlight, Selectable Text, Clipboard Copy, and Centered Notification
// @namespace    http://tampermonkey.net/
// @version      0.30.0
// @description  Mouse Copy：按住 Cmd/Ctrl+Shift 移动取文，松开固定；Esc 退出。可编辑原文、翻译、编解码、Markdown、恢复草稿。
// @author       You
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      api.deepseek.com
// @connect      raw.githubusercontent.com
// @require      https://cdn.jsdelivr.net/npm/turndown@7.2.0/dist/turndown.js
// @homepageURL  https://github.com/yiliufeng168/browser-plugins-mouse-copy
// @supportURL   https://github.com/yiliufeng168/browser-plugins-mouse-copy/issues
// @updateURL    none
// ==/UserScript==

/*
 * v0.30.0 使用说明
 * 1. 按住 Cmd(macOS)/Ctrl(Windows/Linux)+Shift 移动鼠标预览取文；松开任一键固定。
 * 2. Cmd/Ctrl+Shift+P 打开/收起面板；Esc 取消取文或关闭面板；菜单也可打开。
 * 3. “重新取文”可免按键取文，单击目标固定；↑/↓或范围按钮扩大/缩小范围。
 * 4. 替换内容前自动保留内存草稿，可用上一步/下一步恢复；刷新网页后清空。
 * 5. 设置中保存、测试 DeepSeek Key。自动翻译按网站开启，默认关闭。
 * 6. 编解码在本地完成。翻译向 api.deepseek.com 发送当前文字，可能产生 API 费用。
 * 7. 为防上游覆盖本次定制，关闭自动更新；设置中仍可手动检查上游版本。
 * 限制：不能提取图片、canvas 中的文字；跨域 iframe 由各自脚本实例处理。
 */
(function () {
    'use strict';
    const VERSION = '0.30.0';
    const HOST_ID = 'mouse-copy-workbench-v030';
    if (document.getElementById(HOST_ID)) return;
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const MOD = isMac ? 'Cmd' : 'Ctrl';
    const SITE_KEY = 'mouse_copy_auto_v030:' + location.origin;
    const API_URL = 'https://api.deepseek.com/chat/completions';
    const UPSTREAM = 'https://github.com/yiliufeng168/browser-plugins-mouse-copy';
    const MAX_CAPTURE = 200000;
    const state = {
        open: false, tab: 'translate', revision: 0, source: null, html: '', capturedText: '',
        capture: null, capturePreviousRange: [], candidate: null, candidateBase: null, candidateData: null, smaller: [],
        past: [], future: [], job: null, autoTimer: null, auto: false, key: '',
        result: { translate: null, codec: null, markdown: null }, mdMode: 'source',
        pos: null, drag: null, suppressChord: false, previousFocus: null
    };
    const cache = new Map();
    const host = document.createElement('div');
    host.id = HOST_ID;
    // Shadow DOM keeps page CSS away from controls, and plugin CSS away from the page.
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;width:0!important;height:0!important;z-index:2147483647!important;';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
        :host{color-scheme:dark} *{box-sizing:border-box} [hidden]{display:none!important}
        .panel{position:fixed;top:16px;left:16px;width:min(960px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;background:#151b25;color:#e7edf7;border:1px solid #38465a;border-radius:14px;box-shadow:0 18px 70px #0006;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden;text-align:left}
        button,input,select,textarea{font:inherit;color:inherit} button{border:1px solid #41506a;background:#202b3b;border-radius:7px;padding:6px 10px;min-height:32px;cursor:pointer;white-space:nowrap}button:hover:not(:disabled){background:#30415b}button:disabled{opacity:.45;cursor:not-allowed}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #83b7ff;outline-offset:2px}
        button.primary{background:#3374d5;border-color:#4c8bea;color:#fff}button.primary:hover:not(:disabled){background:#4184e8}.icon{min-width:36px;min-height:36px;padding:4px}.muted,.hint{color:#a5b4ca;font-size:12px}.hint{margin:6px 0;white-space:normal;overflow-wrap:anywhere}.warn{color:#f1c77c}.error{color:#ffaaa5}
        .header{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #303c50;cursor:move;touch-action:none;flex:none}.brand{font-size:15px;font-weight:700}.badge{padding:2px 7px;border-radius:12px;background:#233d38;color:#9be5c3;font-size:11px}.spacer{flex:1}.toolbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid #303c50;flex:none}
        .layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);min-height:0;overflow:auto}.source,.results{min-width:0;padding:14px}.source{border-right:1px solid #303c50}.labelrow{display:flex;align-items:center;gap:8px;margin-bottom:8px}.labelrow label{font-weight:600}.editor{display:block;resize:vertical;width:100%;height:260px;min-height:110px;max-height:45dvh;background:#0e141e;border:1px solid #34435b;border-radius:8px;padding:12px;line-height:1.65;tab-size:4;white-space:pre-wrap;overflow:auto;user-select:text}.source-actions{display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap}
        .chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.chips button{font:12px ui-monospace,monospace;color:#b9d6ff;min-height:28px;padding:3px 7px}.tabs{display:flex;gap:4px;border-bottom:1px solid #34435b;margin-bottom:12px;padding-bottom:8px}.tabs button{border-color:transparent;background:transparent;padding:5px 9px}.tabs button[aria-selected=true]{color:#b9d6ff;background:#263e60;border-color:#41628d}
        .result-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px}.output{margin:0;min-height:100px;max-height:300px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.65 system-ui,sans-serif;user-select:text}.mono{font:13px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace}.stale{opacity:.55}.notice{margin:8px 0;color:#f1c77c;font-size:12px}.codec-list{max-height:330px;overflow:auto}.codec-row{padding:9px 0;border-bottom:1px solid #2c384b}.codec-head{display:flex;align-items:center;gap:8px;font-size:12px;color:#b9cbe3}.codec-value{margin:5px 0 0;max-height:110px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 ui-monospace,monospace}.codec-group{color:#a5b4ca;margin:12px 0 0;font-size:12px}select,input[type=password],input[type=text],input[type=number]{max-width:100%;background:#0e141e;border:1px solid #41506a;border-radius:6px;padding:6px 8px}select{min-width:0;white-space:normal}.footer{padding:9px 14px;border-top:1px solid #303c50;flex:none}.status{min-height:21px;overflow-wrap:anywhere}.shortcut{font-size:11px;color:#90a3bf;margin-top:3px}
        .settings{padding:14px;overflow:auto;min-height:0}.setting-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}.setting-row label{display:flex;gap:7px;align-items:center}.key{flex:1;min-width:130px}.settings h3{font-size:14px;margin:0 0 10px}.settings p{margin:5px 0 12px}.settings a{color:#b9d6ff}.settings hr{border:0;border-top:1px solid #303c50;margin:16px 0}
        .panel.capturing{width:min(420px,calc(100vw - 24px))}.panel.capturing .layout,.panel.capturing .settings,.panel.capturing .toolbar{display:none}.capture-info{padding:12px 14px;max-height:130px;overflow:auto;white-space:pre-wrap;font-size:12px}.outline{position:fixed;border:2px solid #70aaff;background:#548fff14;border-radius:3px;pointer-events:none;box-shadow:0 0 0 1px #15243b;z-index:1}.panel{z-index:2}
        @media(max-width:680px){.layout{grid-template-columns:minmax(0,1fr)}.source{border-right:0;border-bottom:1px solid #303c50}.editor{height:150px;max-height:30dvh}.output,.codec-list{max-height:200px}.header{padding:8px 10px}.toolbar{padding:8px 10px}.source,.results{padding:10px}.header .muted{display:none}}
        @media(prefers-reduced-motion:no-preference){button{transition:background .12s}}
    `;
    root.appendChild(style);
    const shell = document.createElement('div');
    shell.innerHTML = `
      <div class="outline" hidden></div>
      <section class="panel" role="dialog" aria-modal="false" aria-label="Mouse Copy 文本工作台" hidden>
        <header class="header"><span class="brand">Mouse Copy</span><span class="muted">0.30</span><span class="badge" id="mode">已固定</span><span class="spacer"></span><button class="icon" id="settingsToggle" title="设置" aria-label="打开设置" aria-expanded="false">⚙</button><button class="icon" id="close" title="关闭（Esc）" aria-label="关闭面板">✕</button></header>
        <div class="capture-info" hidden></div>
        <div class="toolbar"><button id="pick">重新取文</button><button id="expand" title="扩大到上一级元素">扩大范围 ↑</button><button id="shrink" title="返回较小的元素">缩小范围 ↓</button><span class="spacer"></span><button id="back" title="恢复上一份内容，包括替换前的编辑草稿">上一步</button><button id="forward">下一步</button><button id="new">新建</button></div>
        <div class="layout">
          <div class="source"><div class="labelrow"><label for="editor">原文</label><span id="sourceInfo" class="muted">可直接输入或粘贴</span><span class="spacer"></span><span id="count" class="muted">0 字符</span></div>
          <textarea id="editor" class="editor" spellcheck="false" placeholder="按住 ${MOD}+Shift 移动鼠标取文，松开固定。也可以直接粘贴文字。"></textarea>
          <div class="source-actions"><button id="copySource" class="primary">复制原文</button><label class="hint"><input type="checkbox" id="auto"> 此网站自动翻译</label></div><div class="hint" id="autoHint"></div><div class="chips" aria-label="CVE 快速复制"></div></div>
          <div class="results"><div class="tabs" role="tablist" aria-label="处理方式"><button id="tab-translate" role="tab" aria-controls="pane-translate" data-tab="translate">翻译</button><button id="tab-codec" role="tab" aria-controls="pane-codec" data-tab="codec">编解码</button><button id="tab-markdown" role="tab" aria-controls="pane-markdown" data-tab="markdown">Markdown</button></div>
          <section id="pane-translate" role="tabpanel" aria-labelledby="tab-translate"><div class="result-actions"><button id="translate">翻译成中文</button><button id="stop" hidden>停止</button><button id="copyTranslation" disabled>复制译文</button></div><div class="hint">当前文字将发送至 DeepSeek，可能产生 API 费用。</div><div id="translateNotice" class="notice" role="status"></div><pre id="translation" class="output">点击“翻译成中文”开始。</pre></section>
          <section id="pane-codec" role="tabpanel" aria-labelledby="tab-codec" hidden><div class="result-actions"><button id="codecRun">重新计算</button><select id="codecFilter" aria-label="筛选转换类型"><option value="all">全部</option><option value="encode">编码</option><option value="decode">解码</option><option value="hash">哈希</option></select></div><div class="hint">本地计算 · UTF-8；保留原文首尾空格和换行。</div><div id="codecNotice" class="notice" role="status"></div><div class="codec-list"></div></section>
          <section id="pane-markdown" role="tabpanel" aria-labelledby="tab-markdown" hidden><div class="result-actions"><select id="mdMode" aria-label="Markdown 来源"><option value="source">网页原始格式</option><option value="edited">当前编辑文本（纯文本）</option></select><button id="mdRun">重新生成</button><button id="copyMarkdown" disabled>复制</button></div><div class="hint" id="mdHint"></div><div id="markdownNotice" class="notice" role="status"></div><pre id="markdown" class="output mono"></pre></section></div>
        </div>
        <section class="settings" aria-label="设置" hidden>
          <h3>DeepSeek 翻译</h3><div class="setting-row"><label for="apiKey">API Key</label><input id="apiKey" class="key" type="password" autocomplete="off" placeholder="输入 API Key"><button id="reveal" aria-label="显示或隐藏 API Key">显示</button></div>
          <div class="setting-row"><button id="saveKey" class="primary">保存 Key</button><button id="testKey">测试 Key</button><button id="clearKey">清除 Key</button></div><p class="hint">Key 保存在脚本管理器中。“测试”会发送一条简短请求，可能产生少量费用。不会把 Key 写入网页存储。</p>
          <div class="setting-row"><label for="autoLimit">自动翻译字数上限</label><input id="autoLimit" type="number" min="50" max="5000" step="50" value="500"><button id="saveLimit">保存</button></div><p class="hint">自动翻译仅在本网站启用；固定取文后延迟 800ms 触发。编辑文字不会自动发送。旧版全局自动翻译开关不会迁移为全站开启。</p>
          <hr><h3>操作说明</h3><p class="hint">按住 ${MOD}+Shift 移动预览，松开固定。${MOD}+Shift+P 打开/收起。Esc 取消取文或关闭。点击“重新取文”后可单击网页目标固定；↑/↓调整范围。拖动标题栏可移动窗口。内容仅在当前页面内保留，上一步/下一步可恢复最近 20 次替换。</p><button id="resetPosition">重置位置</button>
          <hr><h3>版本与更新</h3><p class="hint">当前为定制版 ${VERSION}，自动更新已关闭，以免上游脚本覆盖本次优化。</p><div class="setting-row"><button id="checkUpdate">检查上游版本</button><a href="${UPSTREAM}" target="_blank" rel="noopener noreferrer">项目主页</a></div><p class="hint" id="updateInfo"></p>
          <button id="settingsDone">完成设置</button>
        </section>
        <footer class="footer"><div class="status" role="status" aria-live="polite" aria-atomic="true">就绪</div><div class="shortcut">${MOD}+Shift 移动取文 · 松开固定 · Esc 退出</div></footer>
      </section>`;
    root.appendChild(shell);
    (document.body || document.documentElement).appendChild(host);
    const $ = sel => root.querySelector(sel);
    const panel = $('.panel'), editor = $('#editor');
    let autoLimit = 500, selectionFrame = 0, lastPoint = null, testRequest = null;
    const listen = (id, fn) => $(id).addEventListener('click', fn);
    function say(message, error = false) { $('.status').textContent = message; $('.status').classList.toggle('error', error); }
    function rememberSetting(key, value) {
        try { Promise.resolve(GM_setValue(key, value)).catch(() => say('设置保存失败，请重试。', true)); }
        catch (_) { say('设置保存失败，请重试。', true); }
    }
    function position() {
        const r = panel.getBoundingClientRect();
        const x = Math.max(12, Math.min(state.pos?.x ?? 16, window.innerWidth - r.width - 12));
        const y = Math.max(12, Math.min(state.pos?.y ?? 16, window.innerHeight - r.height - 12));
        panel.style.left = x + 'px'; panel.style.top = y + 'px';
    }
    function open(focus = false) {
        if (!state.open) state.previousFocus = document.activeElement;
        state.open = true; panel.hidden = false; position();
        if (focus) editor.focus({ preventScroll: true });
    }
    function setSettings(visible) {
        if (visible && state.capture) cancelCapture();
        $('.settings').hidden = !visible; $('.layout').hidden = visible; $('.toolbar').hidden = visible;
        $('#settingsToggle').setAttribute('aria-expanded', String(visible));
        if (visible) { $('#apiKey').value = state.key; $('#autoLimit').value = autoLimit; $('#apiKey').focus(); }
        else $('#settingsToggle').focus();
        position();
    }
    function close() {
        cancelCapture(); cancelTranslation(); clearTimeout(state.autoTimer);
        if (testRequest) { testRequest.abort(); testRequest = null; $('#testKey').disabled = false; }
        state.open = false; panel.hidden = true;
        if (state.previousFocus?.isConnected) state.previousFocus.focus({ preventScroll: true });
    }
    function snapshot() { return { text: editor.value, html: state.html, capturedText: state.capturedText, source: state.source }; }
    function pushHistory() {
        const current = snapshot();
        const previous = state.past.at(-1);
        if (!previous || previous.text !== current.text || previous.html !== current.html) state.past.push(current);
        if (state.past.length > 20) state.past.shift();
        state.future = [];
    }
    function sourceChanged(message) {
        clearTimeout(state.autoTimer); cancelTranslation(); state.revision++;
        refreshSource(message);
    }
    function refreshSource(message) {
        $('#count').textContent = `${editor.value.length} 字符`;
        $('#sourceInfo').textContent = state.html ? (editor.value === state.capturedText ? '已固定网页内容' : '已编辑 · 网页快照保留') : '手动输入';
        $('#copySource').disabled = !editor.value;
        $('#expand').disabled = !state.source?.isConnected || !parentFor(state.source);
        $('#shrink').disabled = !state.smaller.length;
        $('#back').disabled = !state.past.length; $('#forward').disabled = !state.future.length;
        $('#mode').textContent = editor.value === state.capturedText && state.html ? '已固定' : '编辑中';
        renderChips(); renderResults(); updateAutoHint(); if (message) say(message);
    }
    function applySnapshot(s, message) {
        editor.value = s.text; state.html = s.html; state.capturedText = s.capturedText; state.source = s.source;
        state.smaller = []; sourceChanged(message);
    }
    function restore(direction) {
        const from = direction < 0 ? state.past : state.future, to = direction < 0 ? state.future : state.past;
        if (!from.length) return;
        to.push(snapshot()); applySnapshot(from.pop(), '已恢复内容；处理结果需要重新生成。');
    }
    function renderChips() {
        const chips = $('.chips'); chips.replaceChildren();
        const matches = [...new Set(editor.value.match(/\bCVE-\d{4}-\d{4,7}\b/gi) || [])];
        matches.slice(0, 30).forEach(value => { const b = document.createElement('button'); b.textContent = value; b.title = `复制 ${value}`; b.addEventListener('click', () => copy(value)); chips.appendChild(b); });
        if (matches.length > 30) { const more = document.createElement('span'); more.className = 'hint'; more.textContent = `还有 ${matches.length - 30} 个编号，可从原文复制。`; chips.appendChild(more); }
    }
    async function copy(text) {
        try {
            if (typeof GM_setClipboard === 'function') {
                await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => reject(new Error('剪贴板写入超时')), 3500);
                    try { GM_setClipboard(text, 'text', () => { clearTimeout(timer); resolve(); }); }
                    catch (e) { clearTimeout(timer); reject(e); }
                });
            } else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); }
            else throw new Error('剪贴板接口不可用');
            say('已复制到剪贴板。');
        } catch (_) { say('复制失败，请选中文字后按 ' + MOD + '+C 手动复制。', true); }
    }
    function fresh(kind) { const r = state.result[kind]; return r && r.revision === state.revision && (kind !== 'markdown' || r.mode === state.mdMode); }
    function renderResults() {
        const t = state.result.translate, m = state.result.markdown;
        $('#translation').textContent = t?.text || (t?.status === 'loading' ? '正在等待翻译…' : '点击“翻译成中文”开始。');
        $('#translation').classList.toggle('stale', !!t && !fresh('translate'));
        $('#translateNotice').textContent = t && !fresh('translate') ? '原文已修改，译文已过期。请重新翻译。' : (t?.message || '');
        $('#copyTranslation').disabled = !fresh('translate') || t.status !== 'done' || !t.text;
        $('#translate').disabled = !!state.job || !editor.value.trim();
        $('#translate').textContent = state.job ? '翻译中…' : (t ? '重新翻译' : '翻译成中文');
        $('#stop').hidden = !state.job;
        $('#markdown').textContent = m?.text || '请选择来源并生成 Markdown。';
        $('#markdown').classList.toggle('stale', !!m && !fresh('markdown'));
        $('#markdownNotice').textContent = m && !fresh('markdown') ? '内容或来源已变化，请重新生成。' : (m?.message || '');
        $('#copyMarkdown').disabled = !fresh('markdown') || m.status !== 'done' || !m.text;
        $('#mdMode').options[0].disabled = !state.html;
        $('#mdHint').textContent = state.mdMode === 'source' ? '转换固定取文时的网页格式；不包含编辑框里的修改。' : '当前编辑内容按纯文本保留，不会恢复网页的链接、标题等格式。';
        renderCodec();
    }
    function activateTab(kind, generate = true) {
        state.tab = kind;
        root.querySelectorAll('[data-tab]').forEach(b => { const active = b.dataset.tab === kind; b.setAttribute('aria-selected', String(active)); b.tabIndex = active ? 0 : -1; });
        ['translate','codec','markdown'].forEach(k => { $('#pane-' + k).hidden = k !== kind; });
        if (generate && kind === 'codec' && !fresh(kind)) runCodec();
        if (generate && kind === 'markdown' && !fresh(kind)) runMarkdown();
        position();
    }
    // Extraction is bounded and only performed when the hovered element changes.
    function extract(element) {
        let budget = MAX_CAPTURE + 1, visited = 0;
        const block = /^(P|DIV|SECTION|ARTICLE|HEADER|FOOTER|MAIN|NAV|ASIDE|H[1-6]|BLOCKQUOTE|PRE|FIGURE|FIGCAPTION|ADDRESS|DETAILS|SUMMARY|TABLE|THEAD|TBODY|TFOOT|DD|DT)$/;
        function text(s) { const out = s.slice(0, Math.max(0, budget)); budget -= out.length; return out; }
        function walk(node, pre = false) {
            if (budget <= 0 || ++visited > 20000) return '';
            if (node.nodeType === 3) return text(pre ? node.data : node.data.replace(/[\r\n\t ]+/g, ' '));
            if (node.nodeType !== 1 || node === host) return '';
            const tag = node.tagName;
            if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(tag) || node.hidden || node.getAttribute('aria-hidden') === 'true') return '';
            if (tag === 'INPUT' && node.type === 'password') return '';
            const css = getComputedStyle(node);
            if (css.display === 'none' || css.visibility === 'hidden') return '';
            if (tag === 'INPUT' || tag === 'TEXTAREA') return text(node.value || '');
            if (tag === 'SELECT') return text([...node.selectedOptions].map(o => o.textContent).join('\n'));
            if (tag === 'BR') return '\n';
            if (tag === 'HR') return '\n---\n';
            const inPre = pre || /^(pre|break-spaces)/.test(css.whiteSpace);
            const children = n => [...n.childNodes].map(c => walk(c, inPre)).join('');
            if (tag === 'UL' || tag === 'OL') {
                let idx = Number(node.getAttribute('start')) || 1;
                return '\n' + [...node.children].map(li => {
                    if (li.tagName !== 'LI') return walk(li, inPre);
                    if (li.hasAttribute('value')) idx = Number(li.getAttribute('value'));
                    return (tag === 'OL' ? `${idx++}. ` : '• ') + walk(li, inPre).trim() + '\n';
                }).join('');
            }
            const s = children(node);
            if (tag === 'TD' || tag === 'TH') return s.trim() + '\t';
            if (tag === 'TR') return s.replace(/\t$/, '') + '\n';
            return block.test(tag) ? '\n' + (inPre ? s.replace(/^\n|\n$/g, '') : s.trim()) + '\n' : s;
        }
        let value = walk(element).replace(/^\n+|\n+$/g, '');
        const truncated = value.length > MAX_CAPTURE || budget <= 0 || visited > 20000;
        value = value.slice(0, MAX_CAPTURE);
        // Snapshot HTML for Markdown. Remove plugin, hidden elements and secret input values.
        let html = '';
        if (!truncated) {
            const clone = element.cloneNode(true);
            function prune(original, copy) {
                for (let i = original.childNodes.length - 1; i >= 0; i--) {
                    const source = original.childNodes[i], child = copy.childNodes[i];
                    if (source.nodeType !== 1 || !child) continue;
                    const css = getComputedStyle(source);
                    if (source === host || source.hidden || source.getAttribute('aria-hidden') === 'true' || css.display === 'none' || css.visibility === 'hidden') child.remove();
                    else prune(source, child);
                }
            }
            prune(element, clone);
            clone.querySelectorAll('script,style,noscript,template,[hidden],[aria-hidden="true"],input[type="password"]').forEach(n => n.remove());
            clone.querySelectorAll('input,textarea,select').forEach(n => n.remove());
            clone.querySelectorAll('[id="' + HOST_ID + '"]').forEach(n => n.remove());
            html = /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName) ? '' : clone.outerHTML;
            if (html.length > 1000000) html = '';
        }
        return { text: value, html, source: element, capturedText: value, truncated };
    }
    function parentFor(element) {
        const parent = element?.parentElement;
        return parent && !/^(BODY|HTML)$/.test(parent.tagName) && parent !== host ? parent : null;
    }
    function beginCapture(method) {
        if (state.capture) return;
        clearTimeout(state.autoTimer); cancelTranslation();
        state.capturePreviousRange = state.smaller.slice();
        state.capture = method; state.candidate = null; state.candidateBase = null; state.candidateData = null;
        state.smaller = []; open(); panel.classList.add('capturing'); $('.capture-info').hidden = false;
        $('.capture-info').textContent = method === 'hold' ? '移动鼠标选择，松开快捷键固定。↑/↓调整范围，Esc 取消。' : '移动鼠标选择，单击网页目标固定。↑/↓调整范围，Esc 取消。';
        $('#mode').textContent = '取文中'; say('正在预览；现有内容会保留到固定新目标时。'); position();
    }
    function drawOutline() {
        const el = state.candidate;
        if (!state.capture || !el?.isConnected) { $('.outline').hidden = true; return; }
        const r = el.getBoundingClientRect();
        const o = $('.outline'); o.hidden = false;
        o.style.left = Math.max(0, r.left) + 'px'; o.style.top = Math.max(0, r.top) + 'px';
        o.style.width = Math.max(0, Math.min(innerWidth, r.right) - Math.max(0, r.left)) + 'px';
        o.style.height = Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top)) + 'px';
    }
    function candidate(element, resetRange = true) {
        if (!element || element === host || element.tagName === 'HTML' || element.tagName === 'BODY') return;
        if (element === state.candidate) return;
        state.candidate = element;
        if (resetRange) state.smaller = [];
        state.candidateData = extract(element); drawOutline();
        const data = state.candidateData;
        $('.capture-info').textContent = `${state.capture === 'hold' ? '松开快捷键固定' : '单击目标固定'} · ${element.tagName.toLowerCase()} · ${data.text.length} 字符\n${data.text.slice(0, 150) || '此处没有可提取的文字，请移动到文字区域。'}${data.truncated ? '\n内容过大，已截断；建议缩小范围。' : ''}`;
    }
    function deepestElement(x, y) {
        let el = document.elementFromPoint(x, y);
        while (el?.shadowRoot && el !== host) { const inner = el.shadowRoot.elementFromPoint?.(x, y); if (!inner || inner === el) break; el = inner; }
        return el;
    }
    function previewPoint() {
        selectionFrame = 0;
        if (!state.capture || !lastPoint) return;
        const el = deepestElement(lastPoint.x, lastPoint.y);
        if (el === host) return;
        if (el !== state.candidateBase) { state.candidateBase = el; candidate(el); }
    }
    function endCapture() {
        state.capture = null; state.candidate = null; state.candidateData = null;
        panel.classList.remove('capturing'); $('.capture-info').hidden = true; $('.outline').hidden = true;
        position();
    }
    function cancelCapture() {
        if (!state.capture) return;
        endCapture(); state.smaller = state.capturePreviousRange; state.capturePreviousRange = [];
        refreshSource('已取消取文，原有内容未改变。');
    }
    function commitCapture() {
        const data = state.candidateData;
        if (!data?.text.trim()) { cancelCapture(); return; }
        const range = state.smaller.slice(); pushHistory(); endCapture();
        applySnapshot(data, data.truncated ? '已固定截断的内容；建议缩小范围。' : '已固定内容，可以编辑、复制或处理。');
        state.smaller = range; state.capturePreviousRange = []; $('#shrink').disabled = !range.length;
        if (!state.html) { state.mdMode = 'edited'; $('#mdMode').value = 'edited'; renderResults(); }
        scheduleAuto();
    }
    function changeRange(expand) {
        const current = state.capture ? state.candidate : state.source;
        if (!current?.isConnected) { say('原网页元素已移除，请重新取文。', true); return; }
        const next = expand ? parentFor(current) : state.smaller.pop();
        if (!next) { say(expand ? '已到区块边界。' : '没有更小的范围。'); return; }
        if (expand) state.smaller.push(current);
        if (state.capture) { candidate(next, false); return; }
        const data = extract(next), range = state.smaller.slice();
        if (!data.text.trim()) { say('此范围没有可提取的文字。'); return; }
        pushHistory(); applySnapshot(data, '已调整取文范围，上一份内容已保留。'); state.smaller = range;
        $('#shrink').disabled = !range.length; scheduleAuto();
    }
    function autoReason(text) {
        const t = text.trim();
        if (!t) return '等待固定网页文字。';
        if (t.length > autoLimit) return `超过 ${autoLimit} 字符，请手动翻译。`;
        if (!state.key) return '请先在设置中保存 DeepSeek API Key。';
        if (/^(?:GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH|TRACE|CONNECT)\s+\S+\s+HTTP\/\d|^HTTP\/\d/i.test(t)) return 'HTTP 报文不自动翻译。';
        const letters = [...t].filter(c => /\p{L}/u.test(c));
        if (letters.length < 4) return '文字过短，请手动翻译。';
        const nonSpace = [...t].filter(c => !/\s/u.test(c));
        const symbols = nonSpace.filter(c => !/[\p{L}\p{N}]/u.test(c)).length;
        if (letters.length / nonSpace.length < .5 || symbols / nonSpace.length > .2) return '疑似代码或符号内容，请手动翻译。';
        const kana = letters.filter(c => /\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(c)).length;
        if (kana / letters.length >= .15) return '';
        if (!/\s/.test(t) && t.length > 24) return '疑似标识符，请手动翻译。';
        const han = letters.filter(c => /\p{Script=Han}/u.test(c)).length;
        if (han / letters.length > .2) return '含较多中文，暂不自动翻译。';
        return '';
    }
    function updateAutoHint() {
        $('#auto').checked = state.auto;
        $('#autoHint').textContent = state.auto ? '自动翻译：' + (autoReason(editor.value) || '固定取文后发送至 DeepSeek。') : '自动翻译已关闭；启用后仅对当前网站生效。';
    }
    function scheduleAuto() {
        clearTimeout(state.autoTimer); updateAutoHint();
        if (!state.auto || autoReason(editor.value)) return;
        const revision = state.revision;
        $('#autoHint').textContent = '自动翻译：即将发送至 DeepSeek…';
        state.autoTimer = setTimeout(() => {
            if (state.open && !state.capture && state.auto && revision === state.revision) translate();
        }, 800);
    }
    function cancelTranslation() {
        const job = state.job;
        if (!job) return;
        state.job = null;
        if (state.result.translate?.revision === job.revision) {
            state.result.translate.status = 'cancelled'; state.result.translate.message = '翻译已停止；可重新翻译。';
        }
        job.request?.abort(); renderResults();
    }
    function httpError(status) {
        return ({401:'API Key 无效，请在设置中修改。',402:'账户余额不足，请检查 DeepSeek 账户。',403:'请求被拒绝，请检查 Key 权限。',429:'请求过于频繁或额度受限，请稍后重试。'})[status] || `服务返回 HTTP ${status}，请稍后重试。`;
    }
    function translate() {
        clearTimeout(state.autoTimer);
        const text = editor.value;
        if (!text.trim()) { say('请先输入或提取文字。'); return; }
        if (!state.key) { open(); setSettings(true); say('请先保存 DeepSeek API Key。'); return; }
        cancelTranslation(); activateTab('translate', false);
        const revision = state.revision;
        if (cache.has(text)) {
            state.result.translate = { revision, status:'done', text:cache.get(text), message:'已使用本页缓存。' }; renderResults(); return;
        }
        const job = { revision, request:null }; state.job = job;
        const result = { revision, status:'loading', text:'', message:'' }; state.result.translate = result;
        renderResults(); say('正在翻译，可随时停止。');
        let processed = 0, buffer = '', streamError = null;
        const active = () => state.job === job && state.revision === revision;
        function line(raw) {
            if (!raw.startsWith('data:')) return;
            const payload = raw.slice(5).trim();
            if (!payload || payload === '[DONE]') return;
            try {
                const data = JSON.parse(payload);
                if (data.error) { streamError = '服务返回错误，请检查账户或稍后重试。'; return; }
                const part = data.choices?.[0]?.delta?.content;
                if (typeof part === 'string') result.text += part;
            } catch (_) { streamError = '收到无法解析的响应，请重试。'; }
        }
        function consume(response, final = false) {
            const raw = response.responseText || '';
            buffer += raw.slice(processed); processed = raw.length;
            const lines = buffer.split('\n'); buffer = lines.pop(); lines.forEach(l => line(l.replace(/\r$/, '')));
            if (final && buffer) { line(buffer.replace(/\r$/, '')); buffer = ''; }
            if (active()) $('#translation').textContent = result.text || '正在等待翻译…';
        }
        function fail(message) {
            if (!active()) return;
            result.status = 'error'; result.message = message; state.job = null; renderResults(); say(message, true);
        }
        try {
            job.request = GM_xmlhttpRequest({
                method:'POST', url:API_URL, timeout:90000,
                headers:{'Content-Type':'application/json','Authorization':'Bearer ' + state.key,'Accept':'text/event-stream','Accept-Encoding':'identity'},
                data:JSON.stringify({model:'deepseek-chat',stream:true,messages:[{role:'system',content:'你是一个翻译助手，将用户提供的文本翻译成中文，只返回翻译结果，不要解释。'},{role:'user',content:text}]}),
                onprogress(res) { if (active() && (!res.status || (res.status >= 200 && res.status < 300))) consume(res); },
                onload(res) {
                    if (!active()) return;
                    if (res.status < 200 || res.status >= 300) { fail(httpError(res.status)); return; }
                    consume(res, true);
                    if (streamError || !result.text) { fail(streamError || '服务未返回译文，请重试。'); return; }
                    result.status = 'done'; result.message = ''; state.job = null;
                    if (text.length < 20000) { cache.set(text, result.text); if (cache.size > 30) cache.delete(cache.keys().next().value); }
                    renderResults(); say('翻译完成。');
                },
                onerror() { fail('网络请求失败，请检查连接后重试。'); },
                ontimeout() { fail('翻译超时（90 秒），请重试或缩短原文。'); },
                onabort() { fail('翻译已停止。'); }
            });
        } catch (_) { fail('无法发起请求，请检查脚本管理器的联网授权。'); }
    }

    function md5(str) {
        function safeAdd(x, y) { const lsw = (x & 0xFFFF) + (y & 0xFFFF); return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xFFFF); }
        function bitRol(n, c) { return (n << c) | (n >>> (32 - c)); }
        function cmn(q, a, b, x, s, t) { return safeAdd(bitRol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
        function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
        function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
        function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
        function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
        function md5cycle(x, k) {
            let [a, b, c, d] = x;
            a=ff(a,b,c,d,k[0],7,-680876936);   d=ff(d,a,b,c,k[1],12,-389564586);  c=ff(c,d,a,b,k[2],17,606105819);   b=ff(b,c,d,a,k[3],22,-1044525330);
            a=ff(a,b,c,d,k[4],7,-176418897);   d=ff(d,a,b,c,k[5],12,1200080426);  c=ff(c,d,a,b,k[6],17,-1473231341); b=ff(b,c,d,a,k[7],22,-45705983);
            a=ff(a,b,c,d,k[8],7,1770035416);   d=ff(d,a,b,c,k[9],12,-1958414417); c=ff(c,d,a,b,k[10],17,-42063);     b=ff(b,c,d,a,k[11],22,-1990404162);
            a=ff(a,b,c,d,k[12],7,1804603682);  d=ff(d,a,b,c,k[13],12,-40341101);  c=ff(c,d,a,b,k[14],17,-1502002290);b=ff(b,c,d,a,k[15],22,1236535329);
            a=gg(a,b,c,d,k[1],5,-165796510);   d=gg(d,a,b,c,k[6],9,-1069501632);  c=gg(c,d,a,b,k[11],14,643717713);  b=gg(b,c,d,a,k[0],20,-373897302);
            a=gg(a,b,c,d,k[5],5,-701558691);   d=gg(d,a,b,c,k[10],9,38016083);    c=gg(c,d,a,b,k[15],14,-660478335); b=gg(b,c,d,a,k[4],20,-405537848);
            a=gg(a,b,c,d,k[9],5,568446438);    d=gg(d,a,b,c,k[14],9,-1019803690); c=gg(c,d,a,b,k[3],14,-187363961);  b=gg(b,c,d,a,k[8],20,1163531501);
            a=gg(a,b,c,d,k[13],5,-1444681467); d=gg(d,a,b,c,k[2],9,-51403784);    c=gg(c,d,a,b,k[7],14,1735328473);  b=gg(b,c,d,a,k[12],20,-1926607734);
            a=hh(a,b,c,d,k[5],4,-378558);      d=hh(d,a,b,c,k[8],11,-2022574463); c=hh(c,d,a,b,k[11],16,1839030562); b=hh(b,c,d,a,k[14],23,-35309556);
            a=hh(a,b,c,d,k[1],4,-1530992060);  d=hh(d,a,b,c,k[4],11,1272893353);  c=hh(c,d,a,b,k[7],16,-155497632);  b=hh(b,c,d,a,k[10],23,-1094730640);
            a=hh(a,b,c,d,k[13],4,681279174);   d=hh(d,a,b,c,k[0],11,-358537222);  c=hh(c,d,a,b,k[3],16,-722521979);  b=hh(b,c,d,a,k[6],23,76029189);
            a=hh(a,b,c,d,k[9],4,-640364487);   d=hh(d,a,b,c,k[12],11,-421815835); c=hh(c,d,a,b,k[15],16,530742520);  b=hh(b,c,d,a,k[2],23,-995338651);
            a=ii(a,b,c,d,k[0],6,-198630844);   d=ii(d,a,b,c,k[7],10,1126891415);  c=ii(c,d,a,b,k[14],15,-1416354905);b=ii(b,c,d,a,k[5],21,-57434055);
            a=ii(a,b,c,d,k[12],6,1700485571);  d=ii(d,a,b,c,k[3],10,-1894986606); c=ii(c,d,a,b,k[10],15,-1051523);   b=ii(b,c,d,a,k[1],21,-2054922799);
            a=ii(a,b,c,d,k[8],6,1873313359);   d=ii(d,a,b,c,k[15],10,-30611744);  c=ii(c,d,a,b,k[6],15,-1560198380); b=ii(b,c,d,a,k[13],21,1309151649);
            a=ii(a,b,c,d,k[4],6,-145523070);   d=ii(d,a,b,c,k[11],10,-1120210379);c=ii(c,d,a,b,k[2],15,718787259);   b=ii(b,c,d,a,k[9],21,-343485551);
            x[0]=safeAdd(a,x[0]); x[1]=safeAdd(b,x[1]); x[2]=safeAdd(c,x[2]); x[3]=safeAdd(d,x[3]);
        }
        function md5blks(s) {
            const blks = [], len = s.length;
            for (let i = 0; i < len * 8; i += 8) blks[i >> 5] |= (s.charCodeAt(i / 8) & 0xFF) << (i % 32);
            blks[len * 8 >> 5] |= 0x80 << (len * 8 % 32);
            blks[(((len * 8 + 64) >>> 9) << 4) + 14] = len * 8;
            return blks;
        }
        function rhex(n) {
            let s = '';
            for (let j = 0; j < 4; j++) s += ((n >>> (j * 8 + 4)) & 0xF).toString(16) + ((n >>> (j * 8)) & 0xF).toString(16);
            return s;
        }
        const bs = md5blks(unescape(encodeURIComponent(str)));
        const state = [1732584193, -271733879, -1732584194, 271733878];
        for (let i = 0; i < bs.length; i += 16) md5cycle(state, bs.slice(i, i + 16));
        return state.map(rhex).join('');
    }

    async function digestHex(algorithm, text) {
        if (algorithm === 'MD5') return md5(text);
        if (typeof crypto === 'undefined' || !crypto.subtle) return null;
        const buf = await crypto.subtle.digest(algorithm, new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function bytes(text) { return new TextEncoder().encode(text); }
    function utf8(data) { return new TextDecoder('utf-8', { fatal:true }).decode(data); }
    function base64Encode(text) {
        const data = bytes(text); let binary = '';
        for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.subarray(i, i + 8192));
        return btoa(binary);
    }
    function base64Decode(text) {
        let clean = text.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1) throw new Error('不是有效的 Base64 / Base64URL 文本');
        return utf8(Uint8Array.from(atob(clean), c => c.charCodeAt(0)));
    }
    function unicodeEscape(text) {
        // JS \uXXXX represents UTF-16 code units, so emoji must use surrogate pairs.
        return text.split('').map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
    }
    function unicodeDecode(text) {
        if (!/\\u(?:[0-9a-f]{4}|\{[0-9a-f]{1,6}\})/i.test(text)) throw new Error('未发现 Unicode 转义序列');
        return text.replace(/\\u(?:\{([0-9a-f]{1,6})\}|([0-9a-f]{4}))/gi, (_, point, unit) => point ? String.fromCodePoint(parseInt(point,16)) : String.fromCharCode(parseInt(unit,16)));
    }
    const codecDefs = [
        ['urlEncode','URL 编码','encode',t=>encodeURIComponent(t)],
        ['urlEncodeAll','URL 全编码（UTF-8）','encode',t=>[...bytes(t)].map(b=>'%'+b.toString(16).padStart(2,'0').toUpperCase()).join('')],
        ['urlDecode','URL 解码','decode',t=>{ if (!/%[0-9a-f]{2}/i.test(t)) throw new Error('未发现百分号编码；+ 不会转换为空格'); return decodeURIComponent(t); }],
        ['b64Encode','Base64 编码','encode',base64Encode],
        ['b64Decode','Base64 / Base64URL 解码','decode',base64Decode],
        ['hexEncode','Hex 编码（UTF-8）','encode',t=>[...bytes(t)].map(b=>b.toString(16).padStart(2,'0')).join('')],
        ['hexDecode','Hex 解码（UTF-8）','decode',t=>{ const s=t.replace(/\s/g,''); if (!/^(?:[0-9a-f]{2})+$/i.test(s)) throw new Error('需要偶数个十六进制字符'); return utf8(Uint8Array.from(s.match(/../g),h=>parseInt(h,16))); }],
        ['unicodeEscape','\\uXXXX 转义（UTF-16）','encode',unicodeEscape],
        ['unicodeUnescape','Unicode 转义还原','decode',unicodeDecode],
        ['hexEscape','\\xXX 字节转义（UTF-8）','encode',t=>[...bytes(t)].map(b=>'\\x'+b.toString(16).padStart(2,'0')).join('')],
        ['octEscape','八进制字节转义（UTF-8）','encode',t=>[...bytes(t)].map(b=>'\\'+b.toString(8).padStart(3,'0')).join('')],
        ...['MD5','SHA-1','SHA-256','SHA-384','SHA-512'].map(algo=>[algo,algo,'hash',t=>digestHex(algo,t)])
    ];
    async function runCodec() {
        const text = editor.value, revision = state.revision;
        const result = { revision, rows:codecDefs.map(([id,label,group])=>({id,label,group,status:'loading',text:''})) };
        state.result.codec = result; renderCodec();
        await Promise.all(codecDefs.map(async ([id,label,group,fn], i) => {
            try {
                const value = await fn(text);
                result.rows[i] = {id,label,group,status:value === null ? 'error' : 'done',text:value ?? '当前页面不支持此算法，请在 HTTPS 页面使用。'};
            } catch (e) {
                result.rows[i] = {id,label,group,status:'error',text: e instanceof TypeError ? '输入无法解码为有效 UTF-8 文本。' : (e.message || '无法转换此输入。')};
            }
        }));
        if (state.result.codec === result) renderCodec();
    }
    function renderCodec() {
        const r = state.result.codec, container = $('.codec-list'), filter = $('#codecFilter').value;
        $('#codecNotice').textContent = r && !fresh('codec') ? '原文已修改，结果已过期。请重新计算。' : '';
        container.classList.toggle('stale', !!r && !fresh('codec')); container.replaceChildren();
        if (!r) return;
        for (const row of r.rows) {
            if (filter !== 'all' && row.group !== filter) continue;
            const el = document.createElement('div'); el.className = 'codec-row'; el.dataset.codec = row.id;
            const head = document.createElement('div'); head.className = 'codec-head';
            const label = document.createElement('span'); label.textContent = row.label;
            const spacer = document.createElement('span'); spacer.className = 'spacer';
            const button = document.createElement('button'); button.textContent = '复制'; button.setAttribute('aria-label','复制 '+row.label);
            button.disabled = row.status !== 'done' || !fresh('codec'); button.addEventListener('click',()=>copy(row.text));
            const value = document.createElement('pre'); value.className = 'codec-value';
            value.textContent = row.status === 'loading' ? '计算中…' : (row.text || '（空字符串）');
            if (row.status === 'error') value.classList.add('muted');
            head.append(label,spacer,button); el.append(head,value); container.appendChild(el);
        }
    }
    function runMarkdown() {
        if (!state.html && state.mdMode === 'source') { state.mdMode = 'edited'; $('#mdMode').value = 'edited'; }
        const result = {revision:state.revision,mode:state.mdMode,status:'done',text:'',message:''};
        try {
            if (state.mdMode === 'source') {
                if (typeof TurndownService !== 'function') throw new Error('Markdown 组件未加载，请检查脚本依赖并刷新网页。');
                result.text = new TurndownService({headingStyle:'atx',codeBlockStyle:'fenced',bulletListMarker:'-'}).turndown(state.html);
                result.message = editor.value !== state.capturedText ? '这是网页快照的转换结果，不包含当前编辑修改。' : '';
            } else { result.text = editor.value; }
        } catch (e) { result.status = 'error'; result.message = e.message; }
        state.result.markdown = result; renderResults();
    }
    function testKey() {
        const key = $('#apiKey').value.trim();
        if (!key) { say('请先输入 API Key。', true); return; }
        if (testRequest) testRequest.abort();
        $('#testKey').disabled = true; say('正在测试 Key…');
        const done = (message, error = false) => { testRequest = null; $('#testKey').disabled = false; say(message, error); };
        try {
            testRequest = GM_xmlhttpRequest({method:'POST',url:API_URL,timeout:20000,
                headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
                data:JSON.stringify({model:'deepseek-chat',stream:false,max_tokens:4,messages:[{role:'user',content:'Reply OK'}]}),
                onload(res) {
                    if (res.status < 200 || res.status >= 300) { done(httpError(res.status),true); return; }
                    try { const body = JSON.parse(res.responseText); if (!body.choices?.length) throw new Error(); done('Key 可用。修改后请点击“保存 Key”。'); }
                    catch (_) { done('服务响应异常，请重试。',true); }
                },onerror:()=>done('测试失败：网络请求失败。',true),ontimeout:()=>done('测试超时，请稍后重试。',true),onabort:()=>done('测试已取消。')});
        } catch (_) { done('无法发起请求，请检查脚本管理器授权。',true); }
    }
    function checkUpdate() {
        $('#checkUpdate').disabled = true; $('#updateInfo').textContent = '正在检查…';
        const done = message => { $('#checkUpdate').disabled = false; $('#updateInfo').textContent = message; };
        try { GM_xmlhttpRequest({method:'GET',url:'https://raw.githubusercontent.com/yiliufeng168/browser-plugins-mouse-copy/main/main.meta.js',timeout:15000,
            onload(res) {
                if (res.status !== 200) { done('检查失败：HTTP '+res.status); return; }
                const version = res.responseText.match(/^\s*\/\/\s*@version\s+([^\r\n]+)/m)?.[1]?.trim();
                done(version ? `上游版本：${version}；本地定制版：${VERSION}。版本号不能代表功能包含关系，安装上游版本可能覆盖本次优化。` : '未能读取上游版本号。');
            },onerror:()=>done('检查失败：网络错误。'),ontimeout:()=>done('检查超时，请稍后重试。')});
        } catch (_) { done('无法检查更新，请查看项目主页。'); }
    }
    listen('#close', close);
    listen('#settingsToggle', () => setSettings($('.settings').hidden));
    listen('#settingsDone', () => setSettings(false));
    listen('#pick', () => beginCapture('click'));
    listen('#expand', () => changeRange(true)); listen('#shrink', () => changeRange(false));
    listen('#back', () => restore(-1)); listen('#forward', () => restore(1));
    listen('#new', () => { pushHistory(); applySnapshot({text:'',html:'',capturedText:'',source:null},'已新建；可用“上一步”恢复之前的草稿。'); editor.focus(); });
    listen('#copySource', () => copy(editor.value));
    listen('#copyTranslation', () => { if (fresh('translate')) copy(state.result.translate.text); });
    listen('#copyMarkdown', () => { if (fresh('markdown')) copy(state.result.markdown.text); });
    listen('#translate', translate); listen('#stop', () => { cancelTranslation(); say('翻译已停止。'); });
    listen('#codecRun', runCodec); listen('#mdRun', runMarkdown);
    editor.addEventListener('input', () => sourceChanged('原文已修改；已有结果需要重新生成。'));
    $('#codecFilter').addEventListener('change', renderCodec);
    $('#mdMode').addEventListener('change', () => { state.mdMode = $('#mdMode').value; runMarkdown(); });
    $('#auto').addEventListener('change', () => {
        state.auto = $('#auto').checked; rememberSetting(SITE_KEY,state.auto); clearTimeout(state.autoTimer); updateAutoHint();
        say(state.auto ? '已为此网站开启自动翻译，下次固定取文后生效。' : '已关闭此网站的自动翻译。');
    });
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => activateTab(b.dataset.tab)));
    $('.tabs').addEventListener('keydown', e => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
        e.preventDefault(); const tabs = ['translate','codec','markdown'];
        const i = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (tabs.indexOf(state.tab) + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
        activateTab(tabs[i]); $('#tab-'+tabs[i]).focus();
    });
    listen('#saveKey', () => { cancelTranslation(); state.key = $('#apiKey').value.trim(); rememberSetting('deepseek_api_key',state.key); cache.clear(); updateAutoHint(); say(state.key ? 'API Key 已保存。' : 'API Key 已清除。'); });
    listen('#clearKey', () => { cancelTranslation(); state.key = ''; $('#apiKey').value = ''; rememberSetting('deepseek_api_key',''); cache.clear(); updateAutoHint(); say('API Key 已清除。'); });
    listen('#reveal', () => { const input = $('#apiKey'); input.type = input.type === 'password' ? 'text' : 'password'; $('#reveal').textContent = input.type === 'password' ? '显示' : '隐藏'; });
    listen('#testKey', testKey);
    listen('#saveLimit', () => { const n = Number($('#autoLimit').value); if (!Number.isFinite(n) || n < 50 || n > 5000) { say('请输入 50–5000 之间的字数上限。',true); return; } autoLimit = Math.floor(n); rememberSetting('mouse_copy_auto_limit',autoLimit); updateAutoHint(); say('自动翻译字数上限已保存。'); });
    listen('#resetPosition', () => { state.pos = null; rememberSetting('mouse_copy_position',null); position(); say('窗口位置已重置。'); });
    listen('#checkUpdate', checkUpdate);
    const inPanel = e => e.composedPath().includes(host);
    window.addEventListener('keydown', e => {
        const mod = isMac ? e.metaKey : e.ctrlKey;
        if (e.key === 'Escape' && state.open) {
            e.preventDefault(); e.stopImmediatePropagation();
            if (state.capture) cancelCapture(); else if (!$('.settings').hidden) setSettings(false); else close();
            state.suppressChord = true; return;
        }
        if (e.code === 'KeyP' && mod && e.shiftKey && !e.altKey) {
            e.preventDefault(); e.stopImmediatePropagation(); state.suppressChord = true;
            if (!e.repeat) { if (state.open) close(); else open(true); }
            return;
        }
        if (state.capture && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault(); e.stopImmediatePropagation(); changeRange(e.key === 'ArrowUp'); return;
        }
        // Other modifier combinations (e.g. selecting words) must not start picking.
        if (mod && e.shiftKey && !['Shift','Meta','Control'].includes(e.key)) state.suppressChord = true;
    }, true);
    window.addEventListener('keyup', e => {
        const mod = isMac ? e.metaKey : e.ctrlKey;
        if (!mod || !e.shiftKey) {
            if (state.capture === 'hold') { if (selectionFrame) { cancelAnimationFrame(selectionFrame); previewPoint(); } commitCapture(); }
            state.suppressChord = false;
        }
    }, true);
    document.addEventListener('pointermove', e => {
        if (inPanel(e)) return;
        const mod = isMac ? e.metaKey : e.ctrlKey;
        if (!state.capture && mod && e.shiftKey && !e.altKey && !state.suppressChord) {
            const active = document.activeElement;
            if (active !== host && (active?.matches('input,textarea,select') || active?.isContentEditable)) return;
            if (active === host && !$('.settings').hidden) return;
            beginCapture('hold');
        }
        if (!state.capture) return;
        lastPoint = {x:e.clientX,y:e.clientY};
        if (!selectionFrame) selectionFrame = requestAnimationFrame(previewPoint);
    }, true);
    // Prevent activation/navigation of the selected page element in click-pick mode.
    document.addEventListener('pointerdown', e => { if (state.capture === 'click' && !inPanel(e) && e.button === 0) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    document.addEventListener('click', e => {
        if (state.capture !== 'click' || inPanel(e)) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (selectionFrame) { cancelAnimationFrame(selectionFrame); previewPoint(); }
        if (!state.candidate) candidate(deepestElement(e.clientX,e.clientY));
        commitCapture();
    }, true);
    window.addEventListener('blur', () => { state.suppressChord = false; if (state.capture) cancelCapture(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelCapture(); clearTimeout(state.autoTimer); } });
    window.addEventListener('resize', () => { if (state.open) position(); drawOutline(); });
    window.addEventListener('scroll', drawOutline, true);
    $('.header').addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.target.closest('button')) return;
        const r = panel.getBoundingClientRect(); state.drag = {dx:e.clientX-r.left,dy:e.clientY-r.top};
        $('.header').setPointerCapture(e.pointerId); e.preventDefault();
    });
    $('.header').addEventListener('pointermove', e => { if (!state.drag) return; state.pos = {x:e.clientX-state.drag.dx,y:e.clientY-state.drag.dy}; position(); });
    const endDrag = () => { if (!state.drag) return; state.drag = null; const r=panel.getBoundingClientRect(); state.pos={x:r.left,y:r.top}; rememberSetting('mouse_copy_position',state.pos); };
    $('.header').addEventListener('pointerup', endDrag); $('.header').addEventListener('pointercancel', endDrag);
    // Isolate bubbling keyboard and pointer handlers from the surrounding webpage.
    ['keydown','keyup','click','pointerdown','pointerup'].forEach(type=>root.addEventListener(type,e=>e.stopPropagation()));
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (state.open && !state.drag) position(); }).observe(panel);
    activateTab('translate', false); sourceChanged();
    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('打开 Mouse Copy',()=>open(true));
        GM_registerMenuCommand('Mouse Copy 设置',()=>{open();setSettings(true);});
    }
    (async () => {
        try {
            const [key,auto,limit,pos] = await Promise.all([GM_getValue('deepseek_api_key',''),GM_getValue(SITE_KEY,false),GM_getValue('mouse_copy_auto_limit',500),GM_getValue('mouse_copy_position',null)]);
            state.key = String(key || '').trim(); state.auto = !!auto;
            autoLimit = Number.isFinite(Number(limit)) ? Math.min(5000,Math.max(50,Number(limit))) : 500;
            if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) state.pos = pos;
            updateAutoHint(); if (state.open) position();
        } catch (_) { say('读取设置失败，可在设置中重新保存。',true); }
    })();
})();
