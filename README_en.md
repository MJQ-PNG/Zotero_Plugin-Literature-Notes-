# Zotero Literature Notes 📚 · AI Literature Extraction Plugin

> **Stop spending an hour on a single paper and still missing the point.**
>
> In Zotero, **one-click select papers → AI auto-extracts → generates a structured "Research Core" note + a cross-paper comparison table.**
> Read papers, write literature reviews, draft your thesis, or prep for competitions — work at double speed. **Free · Open-source · No proxy needed in CN.**

[![Version](https://img.shields.io/badge/version-v0.5.1-blue)](https://github.com/MJQ-PNG/-Zotero-Literature-Notes-) [![Platform](https://img.shields.io/badge/Zotero-7%20%2F%209.x-green)](https://www.zotero.org/) [![License](https://img.shields.io/badge/license-MIT-brightgreen)](LICENSE) ![Author](https://img.shields.io/badge/author-MJQ-orange)

> **中文版 README → [`README.md`](README.md)**

---

## 🎬 See It in Action

> **Screenshot placeholder:** the "Research Core" 4-block note — see it and the demo GIF
![4-block note demo](docs/screenshots/note-demo.png)

> **Screenshot placeholder:** the "cross-paper comparison" table (the wow moment)
![cross-paper comparison table](docs/screenshots/compare-table.png)

---

## 🎯 What Problem Does It Solve?

Sound familiar?

- You spend **an hour on one English paper** and still can't say what problem it actually solves ❌
- Writing a **literature review**, you have dozens of papers but don't know how to compare or organize them ❌
- In a **math modeling / Hackathon / competition**, you have 3 days to read all relevant literature and write a decent background & survey ❌
- Starting your **graduation thesis**, you need to quickly map out the mainstream methods in a field ❌

**This plugin handles all of it** — select your papers, let AI break them down, and get the answers in ~30 seconds.

---

## ✨ Core Features

| Feature | What it does |
|---------|--------------|
| 🖱 **Select & extract** | Select papers → right-click → one-click trigger, auto-reads title / abstract / full PDF text |
| 📋 **4-block structured note** | Each paper gets a "Research Core" child note: ①Results ②Theoretical validation ③Experimental setup ④Innovations (optional ⑤Limitations) |
| 📊 **Cross-paper comparison table** | Select ≥2 papers to auto-generate a comparison table: `Paper ｜ Focus ｜ Strengths ｜ Weaknesses` — copy straight into your review |
| 🌏 **Multi-language → Chinese** | Works for both Chinese & English papers, always outputs Simplified Chinese |
| 🧠 **Three AI providers** | DeepSeek / Zhipu GLM / Custom (any OpenAI-compatible endpoint), freely switchable, direct connection in CN, no proxy |
| 🖌 **Formal typesetting** | Notes use Heiti (SimHei) with custom sizes (heading #1 / body #2), matching thesis formatting habits |
| 🖼 **Figure embedding (experimental)** | Auto-locates figures/tables in the PDF and embeds them under the matching section |

---

## 🚀 Quick Install (30 seconds)

> Download the `.xpi` package from [GitHub Releases](https://github.com/MJQ-PNG/-Zotero-Literature-Notes-/releases) (or the `build/` folder):

1. Download `zotero-literature-notes-0.5.1.xpi`
2. In Zotero: **Tools** → **Plugins** → gear ⚙ → **Install Plugin From File…**
3. Select the `.xpi` → restart Zotero ✅

> 💡 Dev hot-reload: Zotero **Tools → Developer → Debug Output Logging → Reload** to apply code changes without reinstalling.

---

## 🔧 Usage

1. Select one or more papers in Zotero
2. Right-click → the **extract command** in the menu (or trigger it from the selection)
3. On first use, open **Settings** and enter your AI provider's API key and model name (see table below)
4. Wait for extraction → notes are written under each paper; with ≥2 papers, an extra "cross-paper summary" comparison table is generated

## ⚙️ AI Provider Configuration

| Provider | Endpoint | Example models | Notes |
|----------|----------|----------------|-------|
| DeepSeek | api.deepseek.com | deepseek-chat / deepseek-v4-flash | Strong text, great Chinese, cheap |
| Zhipu GLM | open.bigmodel.cn | glm-4-flash / glm-4v-flash | Free tier / vision model |
| Custom model | Any OpenAI-compatible endpoint | Custom | Bring your own in-house / campus / mirror |

> Direct connection works in mainland China — no proxy needed.

---

## 🛠️ Development / Build

```bash
# Build the .xpi (output to build/)
npm run build        # or node scripts/build.js
```

Project structure:

```
zotero-literature-notes/
├── manifest.json       # Zotero 7 plugin manifest
├── bootstrap.js        # Lifecycle (startup/shutdown)
├── chrome.manifest     # Resource mapping
├── content/
│   ├── main.js         # Core logic (menu, extract, notes, LLM calls)
│   ├── overlay.xhtml   # UI
│   └── prefs.js        # Preferences
├── icons/              # Plugin icons
├── prompts/            # AI extraction prompt templates
├── scripts/            # build.js / gen_icon.py, etc.
└── build/              # Build artifacts (.xpi)
```

---

## 🗺️ Roadmap / Upcoming

- [x] v0.5.1 — 4-block structured notes + cross-paper comparison table + 3 providers + figure embedding
- [ ] Step-by-step install / usage tutorials
- [ ] More AI model support & custom prompts
- [ ] Chinese UI language pack

---

## 📄 License

This project is open-sourced under the **MIT License**.

---

💙 **Enjoy this plugin?** Give the repo a ⭐ **Star** so more students reading papers, writing theses, and competing in contests can find it!
