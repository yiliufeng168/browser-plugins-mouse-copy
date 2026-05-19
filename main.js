// ==UserScript==
// @name         Mouse Move Text Extractor with Highlight, Selectable Text, Clipboard Copy, and Centered Notification (Command + Shift + P)
// @namespace    http://tampermonkey.net/
// @version      0.12
// @description  Extract text content from elements on mouse hover when Command + Shift + P is pressed, with highlight, selectable text, clipboard copy, DeepSeek translation, encode/decode panel, and centered popup notification
// @author       You
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      api.deepseek.com
// ==/UserScript==

(function() {
    'use strict';

    GM_addStyle(`
        #mouse-text-overlay {
            position: fixed;
            background-color: rgba(0, 0, 0, 0.82);
            color: white;
            padding: 24px 10px 8px 10px;
            font-size: 16px;
            border-radius: 5px;
            z-index: 9999;
            pointer-events: auto;
            user-select: text;
            max-width: 2200px;
        }
        #mouse-text-body {
            display: flex;
            flex-direction: row;
            gap: 12px;
            align-items: stretch;
        }
        #mouse-text-left {
            flex: 0 0 380px;
            min-width: 0;
            display: flex;
            flex-direction: column;
        }
        #mouse-text-content {
            flex: 1 1 auto;
            user-select: text;
            word-break: break-word;
            outline: none;
            min-height: 1em;
            max-height: 420px;
            cursor: text;
            overflow-y: auto;
            transition: min-height 0.15s ease;
        }
        #mouse-text-content.free-input {
            min-height: 200px;
        }
        #mouse-text-content:focus {
            outline: 1px solid rgba(255,255,255,0.4);
            border-radius: 3px;
        }
        #mouse-text-translation {
            display: none;
            flex: 0 0 360px;
            min-width: 0;
            max-height: 420px;
            overflow-y: auto;
            border-left: 1px solid rgba(255,255,255,0.2);
            padding-left: 10px;
            font-size: 15px;
            word-break: break-word;
            color: #d0f0ff;
            user-select: text;
        }
        .cve-tag {
            display: inline-block;
            background: #e74c3c;
            color: white;
            padding: 1px 6px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
            user-select: none;
            transition: background 0.15s, transform 0.1s;
        }
        .cve-tag:hover { background: #c0392b; }
        .cve-tag:active { transform: scale(0.93); }
        .cve-tag.cve-copied { background: #27ae60; }
        #mouse-text-btn-bar {
            display: flex;
            gap: 6px;
            margin-top: 8px;
            flex-wrap: wrap;
            align-items: center;
            flex-shrink: 0;
        }
        #mouse-text-copy-btn,
        #mouse-text-translate-btn,
        #mouse-text-auto-btn {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 5px 10px;
            border: none;
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            user-select: none;
            transition: opacity 0.15s, transform 0.1s;
        }
        #mouse-text-copy-btn {
            background: linear-gradient(135deg, #4f8ef7, #7b5ea7);
            color: white;
        }
        #mouse-text-translate-btn {
            background: linear-gradient(135deg, #11998e, #38ef7d);
            color: #111;
        }
        #mouse-text-auto-btn {
            background: rgba(255,255,255,0.12);
            color: rgba(255,255,255,0.7);
            border: 1px solid rgba(255,255,255,0.2);
        }
        #mouse-text-auto-btn.active {
            background: linear-gradient(135deg, #f7971e, #ffd200);
            color: #111;
            border-color: transparent;
        }
        #mouse-text-copy-btn:hover,
        #mouse-text-translate-btn:hover,
        #mouse-text-auto-btn:hover { opacity: 0.85; }
        #mouse-text-copy-btn:active,
        #mouse-text-translate-btn:active,
        #mouse-text-auto-btn:active { transform: scale(0.95); }
        #mouse-text-copy-btn.copied {
            background: linear-gradient(135deg, #2ecc71, #27ae60);
        }
        #mouse-text-translate-btn:disabled {
            opacity: 0.5;
            cursor: default;
        }
        .highlighted-element { background-color: rgba(255, 255, 0, 0.5); }
        #copy-notification {
            position: fixed;
            background-color: rgba(0, 255, 0, 0.8);
            color: white;
            padding: 10px;
            font-size: 16px;
            border-radius: 5px;
            z-index: 9998;
            display: none;
            transform: translate(-50%, -50%);
            top: 50%;
            left: 50%;
        }
        #mouse-text-close-btn {
            position: absolute;
            top: 4px;
            right: 6px;
            background: transparent;
            border: none;
            color: rgba(255,255,255,0.7);
            font-size: 16px;
            line-height: 1;
            cursor: pointer;
            padding: 0 2px;
            user-select: none;
        }
        #mouse-text-close-btn:hover { color: white; }
        /* --- Codec panels --- */
        #mouse-text-codec-encode,
        #mouse-text-codec-hash {
            display: none;
            min-width: 0;
            max-height: 420px;
            overflow-y: auto;
            border-left: 1px solid rgba(255,255,255,0.15);
            padding-left: 10px;
            user-select: text;
        }
        #mouse-text-codec-encode { flex: 0 0 420px; }
        #mouse-text-codec-hash   { flex: 0 0 360px; }
        .codec-panel-header {
            font-size: 11px;
            font-weight: 700;
            color: rgba(255,255,255,0.65);
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-bottom: 7px;
            padding-bottom: 4px;
            border-bottom: 1px solid rgba(255,255,255,0.15);
        }
        .codec-divider {
            height: 1px;
            background: rgba(255,255,255,0.07);
            margin: 5px 0;
        }
        .codec-row {
            display: flex;
            align-items: flex-start;
            gap: 6px;
            margin-bottom: 5px;
        }
        .codec-label {
            flex: 0 0 auto;
            min-width: 100px;
            font-size: 12px;
            color: #b8d0e8;
            white-space: nowrap;
            padding-top: 2px;
        }
        .codec-value {
            flex: 1 1 0;
            word-break: break-all;
            color: #e8f4ff;
            font-family: monospace;
            font-size: 13px;
            line-height: 1.5;
            max-height: 4.5em;
            overflow-y: auto;
        }
        #mouse-text-codec-hash .codec-value {
            color: #a8f0c6;
        }
        .codec-value.codec-fail {
            color: rgba(255,255,255,0.3);
            font-style: italic;
        }
        .codec-value.codec-loading {
            color: rgba(255,255,255,0.45);
            font-style: italic;
        }
        .codec-copy-btn {
            flex: 0 0 auto;
            padding: 1px 6px;
            border: none;
            border-radius: 3px;
            background: rgba(255,255,255,0.1);
            color: rgba(255,255,255,0.6);
            font-size: 11px;
            cursor: pointer;
            user-select: none;
            transition: background 0.12s;
            white-space: nowrap;
            align-self: flex-start;
        }
        .codec-copy-btn:hover { background: rgba(255,255,255,0.22); color: white; }
        .codec-copy-btn.copied {
            background: rgba(46,204,113,0.3);
            color: #4ade80;
        }
        #mouse-text-codec-btn {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 5px 10px;
            border: none;
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            user-select: none;
            transition: opacity 0.15s, transform 0.1s;
            background: linear-gradient(135deg, #6d28d9, #2563eb);
            color: white;
        }
        #mouse-text-codec-btn:hover { opacity: 0.85; }
        #mouse-text-codec-btn:active { transform: scale(0.95); }
        #mouse-text-codec-btn.active { outline: 2px solid rgba(255,255,255,0.45); }
    `);

    // --- DOM structure ---
    const overlay = document.createElement('div');
    overlay.id = 'mouse-text-overlay';
    overlay.style.display = 'none';

    const body = document.createElement('div');
    body.id = 'mouse-text-body';
    overlay.appendChild(body);

    const leftCol = document.createElement('div');
    leftCol.id = 'mouse-text-left';
    body.appendChild(leftCol);

    const textContent = document.createElement('div');
    textContent.id = 'mouse-text-content';
    textContent.contentEditable = 'true';
    leftCol.appendChild(textContent);

    const btnBar = document.createElement('div');
    btnBar.id = 'mouse-text-btn-bar';
    leftCol.appendChild(btnBar);

    const copyBtn = document.createElement('button');
    copyBtn.id = 'mouse-text-copy-btn';
    copyBtn.innerHTML = '&#128203; 复制';
    btnBar.appendChild(copyBtn);

    const translateBtn = document.createElement('button');
    translateBtn.id = 'mouse-text-translate-btn';
    translateBtn.innerHTML = '&#127760; 翻译';
    btnBar.appendChild(translateBtn);

    const autoBtn = document.createElement('button');
    autoBtn.id = 'mouse-text-auto-btn';
    autoBtn.innerHTML = '⚡ 自动翻译';
    btnBar.appendChild(autoBtn);

    const codecBtn = document.createElement('button');
    codecBtn.id = 'mouse-text-codec-btn';
    codecBtn.innerHTML = '&#128290; 编解码';
    btnBar.appendChild(codecBtn);

    const translationPanel = document.createElement('div');
    translationPanel.id = 'mouse-text-translation';
    body.appendChild(translationPanel);

    // --- Encode/decode panel ---
    const codecEncodePanel = document.createElement('div');
    codecEncodePanel.id = 'mouse-text-codec-encode';
    body.appendChild(codecEncodePanel);

    // --- Hash panel ---
    const codecHashPanel = document.createElement('div');
    codecHashPanel.id = 'mouse-text-codec-hash';
    body.appendChild(codecHashPanel);

    function makePanel(panel, title) {
        const h = document.createElement('div');
        h.className = 'codec-panel-header';
        h.textContent = title;
        panel.appendChild(h);
    }

    function makeDivider(panel) {
        const d = document.createElement('div');
        d.className = 'codec-divider';
        panel.appendChild(d);
    }

    function makeCodecRow(panel, label) {
        const row = document.createElement('div');
        row.className = 'codec-row';
        const lbl = document.createElement('span');
        lbl.className = 'codec-label';
        lbl.textContent = label;
        const val = document.createElement('span');
        val.className = 'codec-value';
        const btn = document.createElement('button');
        btn.className = 'codec-copy-btn';
        btn.textContent = '复制';
        row.appendChild(lbl);
        row.appendChild(val);
        row.appendChild(btn);
        panel.appendChild(row);
        return { valueEl: val, copyBtn: btn };
    }

    makePanel(codecEncodePanel, '编解码');
    const codecRows = {
        urlEncode:    makeCodecRow(codecEncodePanel, 'URL 编码'),
        urlEncodeAll: makeCodecRow(codecEncodePanel, 'URL 全编码'),
        urlDecode:    makeCodecRow(codecEncodePanel, 'URL 解码'),
    };
    makeDivider(codecEncodePanel);
    Object.assign(codecRows, {
        b64Encode: makeCodecRow(codecEncodePanel, 'B64 编码'),
        b64Decode: makeCodecRow(codecEncodePanel, 'B64 解码'),
    });
    makeDivider(codecEncodePanel);
    Object.assign(codecRows, {
        hexEncode: makeCodecRow(codecEncodePanel, 'Hex 编码'),
        hexDecode: makeCodecRow(codecEncodePanel, 'Hex 解码'),
    });
    makeDivider(codecEncodePanel);
    Object.assign(codecRows, {
        unicodeEscape:   makeCodecRow(codecEncodePanel, '\\uXXXX 转义'),
        unicodeUnescape: makeCodecRow(codecEncodePanel, '\\uXXXX 还原'),
    });
    makeDivider(codecEncodePanel);
    Object.assign(codecRows, {
        hexEscapeAscii: makeCodecRow(codecEncodePanel, '\\xXX 转义'),
        octEscapeAscii: makeCodecRow(codecEncodePanel, '\\0XX 转义'),
    });

    makePanel(codecHashPanel, '哈希');
    Object.assign(codecRows, {
        md5:    makeCodecRow(codecHashPanel, 'MD5'),
        sha1:   makeCodecRow(codecHashPanel, 'SHA-1'),
        sha256: makeCodecRow(codecHashPanel, 'SHA-256'),
        sha384: makeCodecRow(codecHashPanel, 'SHA-384'),
        sha512: makeCodecRow(codecHashPanel, 'SHA-512'),
    });

    const closeBtn = document.createElement('button');
    closeBtn.id = 'mouse-text-close-btn';
    closeBtn.textContent = '✕';
    overlay.appendChild(closeBtn);

    document.body.appendChild(overlay);

    const notification = document.createElement('div');
    notification.id = 'copy-notification';
    notification.textContent = 'Text copied to clipboard!';
    document.body.appendChild(notification);

    // --- State ---
    const CVE_REGEX = /CVE-\d{4}-\d{4,7}/gi;
    const translationCache = new Map();
    let currentHighlightedElement = null;
    let userEditing = false;
    let autoTranslate = false;
    let autoTranslateTimer = null;
    let currentStreamRequest = null;
    let lastEncodedText = '';
    let commandPressed = false;
    let shiftPressed = false;
    let justClosed = false;

    // Load persisted auto-translate setting
    (async () => {
        autoTranslate = !!(await GM_getValue('auto_translate', false));
        autoBtn.classList.toggle('active', autoTranslate);
    })();

    // --- Helpers ---
    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function renderWithCVE(text) {
        const escaped = escapeHtml(text);
        return escaped.replace(CVE_REGEX, match =>
            `<span class="cve-tag" data-cve="${match}">${match}</span>`
        );
    }

    function openOverlay() {
        overlay.style.display = 'block';
    }

    function closeOverlay() {
        overlay.style.display = 'none';
        translationPanel.style.display = 'none';
        codecEncodePanel.style.display = 'none';
        codecHashPanel.style.display = 'none';
        codecBtn.classList.remove('active');
        textContent.classList.remove('free-input');
    }

    function showTranslation(text) {
        collapseCodecPanel();
        codecBtn.classList.remove('active');
        translationPanel.textContent = text;
        translationPanel.style.display = 'block';
        overlay.style.display = 'flex';
    }

    function collapseTranslation() {
        translationPanel.style.display = 'none';
        if (overlay.style.display !== 'none') {
            overlay.style.display = 'block';
        }
    }

    function collapseCodecPanel() {
        codecEncodePanel.style.display = 'none';
        codecHashPanel.style.display = 'none';
        if (overlay.style.display !== 'none') {
            overlay.style.display = 'block';
        }
    }

    // --- Codec utility functions ---
    function codecUrlEncode(text) {
        return encodeURIComponent(text);
    }

    function codecUrlEncodeAll(text) {
        return Array.from(new TextEncoder().encode(text))
            .map(b => '%' + b.toString(16).padStart(2, '0').toUpperCase())
            .join('');
    }

    function codecUrlDecode(text) {
        try { return decodeURIComponent(text); } catch(e) { return null; }
    }

    function codecB64Encode(text) {
        try { return btoa(unescape(encodeURIComponent(text))); } catch(e) { return null; }
    }

    function codecB64Decode(text) {
        try { return decodeURIComponent(escape(atob(text))); } catch(e) { return null; }
    }

    function codecHexEncode(text) {
        return Array.from(new TextEncoder().encode(text))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    function codecHexDecode(text) {
        try {
            const clean = text.replace(/\s/g, '');
            if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) return null;
            const bytes = new Uint8Array(clean.match(/.{2}/g).map(h => parseInt(h, 16)));
            return new TextDecoder().decode(bytes);
        } catch(e) { return null; }
    }

    function codecUnicodeEscape(text) {
        return [...text].map(c => '\\u' + c.codePointAt(0).toString(16).padStart(4, '0')).join('');
    }

    function codecUnicodeUnescape(text) {
        try {
            return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
        } catch(e) { return null; }
    }

    function codecHexEscapeAscii(text) {
        return [...text].map(c => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    }

    function codecOctEscapeAscii(text) {
        return [...text].map(c => '\\' + c.charCodeAt(0).toString(8).padStart(3, '0')).join('');
    }

    // --- MD5 (public domain, Paul Johnston) ---
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
            for (let i = 0; i < len * 8; i += 32) blks[i >> 5] |= (s.charCodeAt(i / 8) & 0xFF) << (i % 32);
            blks[len * 8 >> 5] |= 0x80 << (len * 8 % 32);
            blks[(((len * 8 + 64) >>> 9) << 4) + 14] = len * 8;
            return blks;
        }
        function rhex(n) {
            let s = '';
            for (let j = 0; j < 4; j++) s += ('0' + ((n >>> (j * 8 + 4)) & 0xF).toString(16)) + ('0' + ((n >>> (j * 8)) & 0xF).toString(16));
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

    // --- Codec panel logic ---
    function setCodecRow(row, value) {
        if (value === null) {
            row.valueEl.textContent = '—';
            row.valueEl.className = 'codec-value codec-fail';
            row.copyBtn.style.display = 'none';
        } else {
            row.valueEl.textContent = value;
            row.valueEl.className = 'codec-value';
            row.copyBtn.style.display = '';
            row.copyBtn.dataset.value = value;
        }
    }

    async function showCodecPanel(text) {
        lastEncodedText = text;
        collapseTranslation();
        codecEncodePanel.style.display = 'block';
        codecHashPanel.style.display = 'block';
        overlay.style.display = 'flex';

        setCodecRow(codecRows.urlEncode,       codecUrlEncode(text));
        setCodecRow(codecRows.urlEncodeAll,    codecUrlEncodeAll(text));
        setCodecRow(codecRows.urlDecode,       codecUrlDecode(text));
        setCodecRow(codecRows.b64Encode,       codecB64Encode(text));
        setCodecRow(codecRows.b64Decode,       codecB64Decode(text));
        setCodecRow(codecRows.hexEncode,       codecHexEncode(text));
        setCodecRow(codecRows.hexDecode,       codecHexDecode(text));
        setCodecRow(codecRows.unicodeEscape,   codecUnicodeEscape(text));
        setCodecRow(codecRows.unicodeUnescape, codecUnicodeUnescape(text));
        setCodecRow(codecRows.hexEscapeAscii,  codecHexEscapeAscii(text));
        setCodecRow(codecRows.octEscapeAscii,  codecOctEscapeAscii(text));

        const hashKeys  = ['md5', 'sha1', 'sha256', 'sha384', 'sha512'];
        const hashAlgos = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
        for (const key of hashKeys) {
            codecRows[key].valueEl.textContent = '计算中…';
            codecRows[key].valueEl.className = 'codec-value codec-loading';
            codecRows[key].copyBtn.style.display = 'none';
        }

        const results = await Promise.allSettled(hashAlgos.map(algo => digestHex(algo, text)));
        results.forEach((r, i) => setCodecRow(codecRows[hashKeys[i]], r.status === 'fulfilled' ? r.value : null));
    }

    async function getApiKey() {
        let key = await GM_getValue('deepseek_api_key', '');
        if (!key) {
            key = prompt('请输入 DeepSeek API Key：');
            if (key) await GM_setValue('deepseek_api_key', key.trim());
        }
        return key || '';
    }

    function callDeepSeekStream(text, apiKey, onChunk) {
        return new Promise((resolve, reject) => {
            let processed = 0;
            let lineBuffer = '';

            function parseSSEChunk(raw) {
                lineBuffer += raw;
                const lines = lineBuffer.split('\n');
                lineBuffer = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const payload = line.slice(6).trim();
                    if (payload === '[DONE]') continue;
                    try {
                        const chunk = JSON.parse(payload);
                        const content = chunk.choices?.[0]?.delta?.content;
                        if (content) onChunk(content);
                    } catch(e) {}
                }
            }

            currentStreamRequest = GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.deepseek.com/chat/completions',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                data: JSON.stringify({
                    model: 'deepseek-chat',
                    stream: true,
                    messages: [
                        { role: 'system', content: '你是一个翻译助手，将用户提供的文本翻译成中文，只返回翻译结果，不要解释。' },
                        { role: 'user', content: text }
                    ]
                }),
                onprogress: (res) => {
                    const newData = res.responseText.slice(processed);
                    processed = res.responseText.length;
                    if (newData) parseSSEChunk(newData);
                },
                onload: (res) => {
                    const remaining = res.responseText.slice(processed);
                    if (remaining) parseSSEChunk(remaining);
                    resolve();
                },
                onerror: () => reject(new Error('网络请求失败'))
            });
        });
    }

    async function translateText(text, { showLoading = true } = {}) {
        if (!text) return;

        if (currentStreamRequest) {
            currentStreamRequest.abort();
            currentStreamRequest = null;
        }

        if (translationCache.has(text)) {
            showTranslation(translationCache.get(text));
            return;
        }

        const apiKey = await getApiKey();
        if (!apiKey) return;

        if (showLoading) {
            translateBtn.innerHTML = '⏳ 翻译中…';
            translateBtn.disabled = true;
        }

        collapseCodecPanel();
        codecBtn.classList.remove('active');
        translationPanel.textContent = '';
        translationPanel.style.display = 'block';
        overlay.style.display = 'flex';

        let fullText = '';

        try {
            await callDeepSeekStream(text, apiKey, (chunk) => {
                fullText += chunk;
                translationPanel.textContent = fullText;
            });
            if (fullText) translationCache.set(text, fullText);
        } catch(e) {
            translationPanel.textContent = '翻译失败：' + e.message;
        } finally {
            currentStreamRequest = null;
            if (showLoading) {
                translateBtn.innerHTML = '&#127760; 翻译';
                translateBtn.disabled = false;
            }
        }
    }

    // --- Event listeners ---
    textContent.addEventListener('focus', () => { userEditing = true; });
    textContent.addEventListener('blur', () => { userEditing = false; });

    autoBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        autoTranslate = !autoTranslate;
        autoBtn.classList.toggle('active', autoTranslate);
        GM_setValue('auto_translate', autoTranslate);
    });

    codecBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const currentText = textContent.innerText.trim();
        if (codecEncodePanel.style.display !== 'none') {
            if (currentText === lastEncodedText) {
                collapseCodecPanel();
                codecBtn.classList.remove('active');
            } else {
                showCodecPanel(currentText);
            }
        } else {
            codecBtn.classList.add('active');
            showCodecPanel(currentText);
        }
    });

    function handleCodecCopy(event) {
        event.stopPropagation();
        const btn = event.target.closest('.codec-copy-btn');
        if (!btn || !btn.dataset.value) return;
        navigator.clipboard.writeText(btn.dataset.value).then(() => {
            const orig = btn.textContent;
            btn.textContent = '✓';
            btn.classList.add('copied');
            setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
        }).catch(() => {});
    }

    codecEncodePanel.addEventListener('click', handleCodecCopy);
    codecHashPanel.addEventListener('click', handleCodecCopy);

    // Cmd+Shift+P → show overlay; Cmd+Shift (chord) → close overlay when visible
    window.addEventListener('keydown', (event) => {
        const prevCmd = commandPressed;
        const prevShift = shiftPressed;
        if (event.key === 'Meta') commandPressed = true;
        if (event.key === 'Shift') shiftPressed = true;

        // Cmd+Shift+P: show overlay if hidden
        if (event.key.toLowerCase() === 'p' && commandPressed && shiftPressed) {
            event.preventDefault();
            if (overlay.style.display === 'none') {
                openOverlay();
                if (!textContent.innerText.trim()) {
                    textContent.classList.add('free-input');
                }
            }
            return;
        }

        // Cmd+Shift chord completed (second of the two keys pressed) while overlay is visible → close
        const chordCompleted = (event.key === 'Shift' && prevCmd) || (event.key === 'Meta' && prevShift);
        if (chordCompleted && overlay.style.display !== 'none') {
            closeOverlay();
            justClosed = true;
            clearTimeout(autoTranslateTimer);
            if (currentHighlightedElement) {
                currentHighlightedElement.classList.remove('highlighted-element');
                currentHighlightedElement = null;
            }
        }
    });

    window.addEventListener('keyup', (event) => {
        if (event.key === 'Meta') commandPressed = false;
        if (event.key === 'Shift') shiftPressed = false;
        if (!commandPressed && !shiftPressed) justClosed = false;
    });

    // Hover capture: only while Cmd+Shift held and overlay is not visible
    document.addEventListener('mousemove', (event) => {
        if (!commandPressed || !shiftPressed || justClosed) return;
        if (overlay.style.display !== 'none') return;

        const element = document.elementFromPoint(event.clientX, event.clientY);
        if (!element || overlay.contains(element)) return;

        if (!userEditing) {
            const rawText = element.textContent || element.innerText || '';
            const trimmed = rawText.trim();

            if (trimmed) {
                textContent.innerHTML = renderWithCVE(trimmed);
                textContent.classList.remove('free-input');
                collapseTranslation();
                collapseCodecPanel();
                codecBtn.classList.remove('active');
                openOverlay();

                if (autoTranslate) {
                    clearTimeout(autoTranslateTimer);
                    autoTranslateTimer = setTimeout(() => {
                        translateText(trimmed);
                    }, 800);
                }
            }
        }

        if (currentHighlightedElement && currentHighlightedElement !== element) {
            currentHighlightedElement.classList.remove('highlighted-element');
        }
        element.classList.add('highlighted-element');
        currentHighlightedElement = element;

        const rect = element.getBoundingClientRect();
        const overlayWidth = overlay.offsetWidth;
        const overlayHeight = overlay.offsetHeight;

        if (rect.top < overlayHeight && rect.left < overlayWidth) {
            overlay.style.top = 'auto';
            overlay.style.bottom = '10px';
            overlay.style.left = '10px';
        } else {
            overlay.style.top = '10px';
            overlay.style.bottom = 'auto';
            overlay.style.left = '10px';
        }
    });

    document.addEventListener('mouseout', () => {
        if (currentHighlightedElement) {
            currentHighlightedElement.classList.remove('highlighted-element');
            currentHighlightedElement = null;
        }
    });

    closeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        closeOverlay();
        clearTimeout(autoTranslateTimer);
        if (currentHighlightedElement) {
            currentHighlightedElement.classList.remove('highlighted-element');
            currentHighlightedElement = null;
        }
    });

    textContent.addEventListener('click', (event) => {
        const tag = event.target.closest('.cve-tag');
        if (!tag) return;
        event.stopPropagation();
        const cve = tag.dataset.cve;
        navigator.clipboard.writeText(cve).then(() => {
            tag.textContent = '✓ ' + cve;
            tag.classList.add('cve-copied');
            setTimeout(() => {
                tag.textContent = cve;
                tag.classList.remove('cve-copied');
            }, 2000);
        }).catch(err => console.error('Failed to copy CVE: ', err));
    });

    copyBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const textToCopy = textContent.innerText;
        if (!textToCopy) return;
        navigator.clipboard.writeText(textToCopy).then(() => {
            copyBtn.innerHTML = '&#10003; 已复制';
            copyBtn.classList.add('copied');
            setTimeout(() => {
                copyBtn.innerHTML = '&#128203; 复制';
                copyBtn.classList.remove('copied');
            }, 2000);
            notification.style.display = 'block';
            setTimeout(() => { notification.style.display = 'none'; }, 2000);
        }).catch(err => console.error('Failed to copy text: ', err));
    });

    translateBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        translateText(textContent.innerText.trim());
    });
})();
