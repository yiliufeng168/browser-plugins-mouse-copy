# Mouse Move Text Extractor

一个 Tampermonkey 用户脚本，在任意网页上按住 **Command + Shift**（macOS）或 **Ctrl + Shift**（Windows / Linux）后，鼠标悬停即可提取元素文本内容，支持高亮、编辑、复制、CVE 识别与 DeepSeek AI 翻译。

## 功能

- **文本提取**：按住 Cmd/Ctrl + Shift，悬停页面元素实时提取完整文本
- **元素高亮**：当前悬停元素黄色背景高亮，移开自动取消
- **可滚动浮层**：内容过长时垂直滚动，浮层自动避让屏幕角落
- **内联编辑**：点击浮层内的文本可直接修改，编辑期间鼠标移动不覆盖内容
- **CVE 识别**：自动识别文本中的 CVE 编号并渲染为红色标签，点击单独复制
- **一键复制**：复制按钮将当前（含编辑后）文本写入剪贴板
- **AI 翻译**：调用 DeepSeek API 将文本翻译为中文，译文展示在原文右侧（横向扩展）
- **自动翻译**：开启后鼠标停留 800ms 自动触发翻译，内置内容判定——只翻译「中文极少、外文占绝对主导」的可理解文本（外文字母 ≥80%），自动跳过中文为主（含英文产品名/技术名词）、纯中文、数字、符号、代码、哈希/ID/URL 等内容；日文假名、韩文谚文出现即视为非中文并翻译
- **翻译缓存**：当前页面会话内相同文本不重复请求 API

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击 Tampermonkey 图标 → **创建新脚本**
3. 将 `main.js` 的内容完整粘贴并保存

> 首次安装时 Tampermonkey 会提示授权 `GM_xmlhttpRequest` 访问 `api.deepseek.com`，需要允许。

## 使用

| 操作 | 说明 |
|------|------|
| `Cmd+Shift+P`（macOS）/ `Ctrl+Shift+P`（Windows/Linux） | 主动显示浮层（空内容时进入自由输入模式） |
| 按住 `Cmd+Shift` / `Ctrl+Shift` + 鼠标悬停 | 激活悬停监听，实时提取元素文本 |
| 松开按键（鼠标静止时） | 关闭浮层 |
| 点击文本区域 | 进入编辑模式，可手动修改内容 |
| 点击 CVE 标签 | 复制单个 CVE 编号 |
| 点击 📋 复制 | 复制浮层内全部文本 |
| 点击 🌐 翻译 | 调用 DeepSeek 翻译，结果显示在右侧 |
| 点击 ⚡ 自动翻译 | 切换自动翻译开关（金黄色为开启） |
| 点击 ✕ | 关闭整个浮层（含译文） |

## DeepSeek API Key 配置

首次点击翻译时会弹框提示输入 API Key，输入后自动保存（通过 `GM_setValue`），后续不再提示。

如需更换 Key，在 Tampermonkey 控制台执行：

```js
GM_setValue('deepseek_api_key', '');
```

然后重新点击翻译按钮即可重新输入。

API Key 申请地址：[platform.deepseek.com](https://platform.deepseek.com/)

## 权限说明

脚本申请以下 Tampermonkey 权限：

| 权限 | 用途 |
|------|------|
| `GM_addStyle` | 注入浮层样式 |
| `GM_setValue / GM_getValue` | 持久化保存 API Key |
| `GM_xmlhttpRequest` | 跨域请求 DeepSeek API |
| `@connect api.deepseek.com` | 限定外部请求目标 |

## 版本历史

| 版本 | 变更 |
|------|------|
| 0.16 | 优化自动翻译判定：改为「中文极少、外文占绝对主导(≥80%)才翻译」，跳过中文为主(含英文名词)的内容；增加符号密度过滤识别代码；日韩文直接判为需翻译 |
| 0.15 | 自动翻译增加内容判定：仅在非中文字母占比 ≥30% 且为可理解文本时触发，跳过纯中文/数字/符号/代码/哈希/URL |
| 0.14 | 修复翻译响应一次性返回的问题，禁用压缩以实现逐字流式输出 |
| 0.13 | 跨平台支持：Windows/Linux 使用 Ctrl+Shift+P，macOS 保持 Cmd+Shift+P |
| 0.12 | 弹窗各面板宽度放大 1.5 倍 |
| 0.11 | 弹窗内容区高度放大 1.5 倍 |
| 0.10 | 新增 Markdown 转换面板（Turndown） |
| 0.9 | 翻译面板添加复制按钮、流式输出 |
| 0.8 | 增加自动翻译开关、翻译缓存、修复关闭按钮 bug |
| 0.7 | 增加 DeepSeek 翻译、去除字符限制、滚动条、可编辑文本 |
| 0.6 | 增加关闭按钮、CVE 标签点击复制 |
