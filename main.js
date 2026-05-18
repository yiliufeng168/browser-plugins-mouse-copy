// ==UserScript==
// @name         Mouse Move Text Extractor with Highlight, Selectable Text, Clipboard Copy, and Centered Notification (Command + Shift)
// @namespace    http://tampermonkey.net/
// @version      0.8
// @description  Extract text content from elements on mouse hover when Command + Shift key is pressed, with highlight, selectable text, clipboard copy, DeepSeek translation, and centered popup notification
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
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 24px 10px 8px 10px;
            font-size: 16px;
            border-radius: 5px;
            z-index: 9999;
            pointer-events: auto;
            user-select: text;
            max-width: 820px;
        }
        #mouse-text-body {
            display: flex;
            flex-direction: row;
            gap: 12px;
        }
        #mouse-text-left {
            flex: 0 0 380px;
            min-width: 0;
        }
        #mouse-text-content {
            user-select: text;
            word-break: break-word;
            outline: none;
            min-height: 1em;
            cursor: text;
            max-height: 300px;
            overflow-y: auto;
        }
        #mouse-text-content:focus {
            outline: 1px solid rgba(255,255,255,0.4);
            border-radius: 3px;
        }
        #mouse-text-translation {
            display: none;
            flex: 0 0 360px;
            min-width: 0;
            max-height: 340px;
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

    const translationPanel = document.createElement('div');
    translationPanel.id = 'mouse-text-translation';
    body.appendChild(translationPanel);

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
    let listening = false;
    let currentHighlightedElement = null;
    let userEditing = false;
    let autoTranslate = false;
    let autoTranslateTimer = null;
    let currentStreamRequest = null;

    // Load persisted auto-translate setting
    (async () => {
        autoTranslate = !!(await GM_getValue('auto_translate', false));
        autoBtn.classList.toggle('active', autoTranslate);
    })();
    let commandPressed = false;
    let shiftPressed = false;

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
    }

    function showTranslation(text) {
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
                lineBuffer = lines.pop(); // keep incomplete trailing line
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
                    // onprogress may not fire in all Tampermonkey environments;
                    // parse whatever responseText wasn't processed yet as fallback
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

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Meta') commandPressed = true;
        if (event.key === 'Shift') shiftPressed = true;

        if (commandPressed && shiftPressed) {
            if (overlay.style.display !== 'none') {
                listening = false;
                closeOverlay();
                clearTimeout(autoTranslateTimer);
                if (currentHighlightedElement) {
                    currentHighlightedElement.classList.remove('highlighted-element');
                    currentHighlightedElement = null;
                }
            } else {
                listening = true;
            }
        }
    });

    window.addEventListener('keyup', (event) => {
        if (event.key === 'Meta') commandPressed = false;
        if (event.key === 'Shift') shiftPressed = false;

        if (!(commandPressed && shiftPressed)) listening = false;
    });

    document.addEventListener('mousemove', (event) => {
        if (!listening) return;
        const element = document.elementFromPoint(event.clientX, event.clientY);
        if (!element) return;

        if (!userEditing) {
            const rawText = element.textContent || element.innerText || '';
            const trimmed = rawText.trim();

            if (trimmed) {
                textContent.innerHTML = renderWithCVE(trimmed);
                collapseTranslation();
                openOverlay();

                if (autoTranslate) {
                    clearTimeout(autoTranslateTimer);
                    autoTranslateTimer = setTimeout(() => {
                        translateText(trimmed);
                    }, 800);
                }
            } else {
                closeOverlay();
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
