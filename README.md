<img width="1752" height="1650" alt="ca138007f58691cf13f70ada4e230631" src="https://github.com/user-attachments/assets/6bc4bb7c-1f91-4bc1-b36e-65091069fbc1" /><img width="1716" height="1473" alt="c420531805b7104551e3aed62362ec8c" src="https://github.com/user-attachments/assets/e2b8ec1c-c8b5-4020-a546-c3050b3cc4b2" /># Zotero插件 —— Zotero Literature Notes（文献笔记提取插件）📚

> **English README → [`README_en.md`](README_en.md)**

> **读一篇英文文献，不用再自己翻半天、抓不住重点了。**
>
> 在 Zotero 里**一键选中文献 → AI 自动拆解 → 生成「研究核心」笔记 + 跨文献对比表**。
> 读文献、写综述、赶论文、打比赛，效率直接翻倍。**免费 · 开源 · 国内直连。**
![版本](https://img.shields.io/badge/版本-v0.5.1-blue) ![平台](https://img.shields.io/badge/Zotero-7%20%2F%209.x-green) ![许可](https://img.shields.io/badge/许可-MIT-brightgreen) ![作者](https://img.shields.io/badge/作者-MJQ-orange)

---

## 🎬 效果一眼懂

> 👉 **效果图占位**：这里放「研究核心」四步笔记截图，建议放图 1 和 1.gif（演示动图）
<img width="1752" height="1650" alt="ca138007f58691cf13f70ada4e230631" src="https://github.com/user-attachments/assets/94eeb3f6-7100-4d83-8031-38eee0ca3a05" />
<img width="1739" height="1543" alt="758252cd54647402ad5ea5e0a0bea99c" src="https://github.com/user-attachments/assets/2ccd0482-dbd7-4622-a06c-1fb91536af48" />

> 👉 **效果图占位**：这里放「跨文献总结」对比表截图（全片最惊艳画面）
<img width="1716" height="1473" alt="c420531805b7104551e3aed62362ec8c" src="https://github.com/user-attachments/assets/d55a26ec-2673-406e-be44-4bed54fd0986" />

---

## 🎯 这个插件解决什么问题

你是不是也这样：

- 英文文献一篇要读 1 小时，抓不住它到底解决了什么问题 ❌
- 写**文献综述**时，几十篇文献不知道怎么对比、归类 ❌
- **数学建模 / 竞赛**拿到题，要在 3 天里快速读透相关文献、写出像样的背景和综述 ❌
- 毕业论文开题，要快速搞懂一个方向的主流方法 ❌

**这个插件把这些全办了** —— 选中文献，AI 帮你结构化拆解，你要的答案 30 秒内呈现。

---

## ✨ 核心功能

| 功能 | 效果 |
|------|------|
| 🖱 **选中即提取** | 选中文献 → 右键一键触发，自动读标题/摘要/PDF 全文 |
| 📋 **四块结构笔记** | 每篇生成「研究核心」子笔记：①成果 ②理论验证 ③实验设置 ④创新点（可选⑤不足） |
| 📊 **跨文献对比表** | 选中 ≥2 篇自动生成对比表：`文献｜侧重点｜优点｜缺点`，写综述直接抄 |
| 🌏 **中英文献→中文** | 无论中英文，笔记始终为简体中文，输出无阅读障碍 |
| 🧠 **三家 AI 模型可换** | DeepSeek / 智谱 GLM / 自定义（OpenAI 兼容端点），自由切换，国内直连免代理 |
| 🖌 **黑体排版** | 笔记用黑体 + 一号标题/二号正文，符合正式论文排版习惯 |
| 🖼 **图表嵌入（实验性）** | 自动从 PDF 定位文献图表，嵌入到对应小节 |

---

## 🚀 30 秒快速安装

> 从 GitHub Releases 下载 `.xpi` 插件包（或 `build/` 目录下）：

1. 下载 `zotero-literature-notes-0.5.1.xpi`
2. 打开 Zotero → 菜单「工具」→「插件」→ 齿轮 ⚙ → **Install Plugin From File…**
3. 选中刚才下载的 `.xpi` → 重启 Zotero ✅

> 💡 开发者热加载：Zotero「工具」→「开发者」→ 开启调试 → 用「Reload」即时重载，改代码无需重装。

---

## 🔧 使用方法

1. 在 Zotero 中选中一篇或多篇文献
2. 右键 → 菜单中的**提取命令**（或选中后触发）
3. 首次使用到「设置」里填入 AI provider 的 API key 和模型名（见下表）
4. 等待提取 → 笔记自动写入对应文献下方；≥2 篇时额外生成一份「跨文献总结」对比表

## ⚙️ AI Provider 配置

| Provider | 端点 | 模型示例 | 说明 |
|----------|------|---------|------|
| DeepSeek | api.deepseek.com | deepseek-chat / deepseek-v4-flash | 文本强、中文好、便宜 |
| 智谱 GLM | open.bigmodel.cn | glm-4-flash / glm-4v-flash | 免费档 / 视觉模型 |
| 自定义模型 | 任意 OpenAI 兼容端点 | 自定义 | 可接内网/学校/镜像 |

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

## 🗺️ 路线 / 近期计划

- [x] v0.5.1 四步结构笔记 + 跨文献对比表 + 三家 provider + 图表嵌入
- [ ] 安装 / 使用保姆级教程（配合抖音推广）
- [ ] 更多 AI 模型支持 & 自定义提示词
- [ ] 中文界面语言包

---

## 📄 许可证

本项目基于 **MIT 许可证** 开源。

---

💙 **喜欢这个插件吗？** 给仓库点个 ⭐ Star，让更多读文献、写论文、打比赛的同学看到它！
