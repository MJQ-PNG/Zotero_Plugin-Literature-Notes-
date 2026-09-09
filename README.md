# Zotero插件————Zotero Literature Notes（文献笔记提取插件）

在 Zotero 中选中若干篇中英文文献，自动用 AI 做**结构化四步提取**（成果 / 理论验证 / 实验 / 创新点），
生成每篇文献的 `研究核心` 子笔记；选中 ≥2 篇时还额外生成一份**跨文献对比总结**表格笔记。

> 版本：v0.5.1 · 作者：MJQ· 平台：Zotero 7 / 9.x（bootstrapped 插件）

---

## ✨ 功能特性

- **选中即提取**：选中文献 → 右键菜单一键触发，自动读取标题 / 摘要 / PDF 全文
- **四块结构笔记**：每篇生成 `研究核心：<标题>（<中文译名>）` 子笔记，包含
  ① 成果　② 理论验证　③ 实验设置　④ 创新点　（可选⑤不足）
- **跨文献对比表**：选中 ≥2 篇时，自动生成 `<文件夹名>跨文献总结` 独立笔记，
  用 Markdown 表格对比各文献的**侧重点 / 优点 / 缺点**
- **多语言文献 → 中文输出**：无论中英文，笔记始终为简体中文
- **三家 AI provider 并列**：DeepSeek / 智谱 GLM / 自定义模型（OpenAI 兼容端点），可自由切换
- **中文字体排版**：笔记用黑体 + 自定义字号（一号标题 / 二号正文），符合正式排版习惯
- **图表嵌入（实验性）**：自动从 PDF 定位文献图表并嵌入到对应小节

---

## 📦 安装

1. 用插件包：选择 `build/zotero-literature-notes-0.5.1.xpi`
2. Zotero 菜单「工具」→「插件」→ 齿轮 ⚙ → **Install Plugin From File…**
3. 选中 `.xpi` 文件，重启 Zotero

> 开发者热加载：Zotero「工具」→「开发者」→ 开启调试 → 用「Reload」即时重载，改代码无需重装。

---

## 🔧 使用方法

1. 在 Zotero 中选中一或多篇文献
2. 右键 → 菜单中的提取命令（或选中后触发）
3. 首次使用到「设置」里填入你选择的 AI provider 的 API key 和模型名
4. 等待提取 → 笔记自动写入对应文献下方

## ⚙️ AI Provider 配置

| Provider | 端点 | 模型示例 | 说明 |
|----------|------|---------|------|
| DeepSeek | api.deepseek.com | deepseek-chat / deepseek-v4-flash | 文本，中文好，便宜 |
| 智谱 GLM | open.bigmodel.cn | glm-4-flash / glm-4v-flash | 免费档 / 视觉模型 |
| 自定义模型 | 任意 OpenAI 兼容端点 | 自定义 | 可接内网/镜像 |

> 国内网络直连即可，无需代理。

---

## 🛠️ 开发 / 构建

```bash
# 打包 .xpi（输出到 build/）
npm run build        # 或 node scripts/build.js
```

项目结构概览：

```
zotero-literature-notes/
├── manifest.json       # Zotero 7 插件清单
├── bootstrap.js        # 生命周期（startup/shutdown）
├── chrome.manifest     # 资源映射
├── content/
│   ├── main.js         # 核心逻辑（菜单、提取、笔记、LLM 调用）
│   ├── overlay.xhtml   # UI
│   └── prefs.js        # 偏好
├── icons/              # 插件图标
├── prompts/            # AI 提取提示词模板
├── scripts/            # build.js / gen_icon.py 等
└── build/              # 构建产物（.xpi）
```

---

## 📄 许可证

本项目基于 MIT 许可证开源。
