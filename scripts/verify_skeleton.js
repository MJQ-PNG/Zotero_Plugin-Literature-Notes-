/**
 * verify_skeleton.js — 无需 GUI 的骨架逻辑验证
 *
 * 在 Node 里 mock 出 Zotero 7 的关键全局（ChromeUtils / Services / Zotero），
 * 然后加载 bootstrap.js + content/main.js，验证：
 *   1. bootstrap 生命周期能跑通、能挂载 main.js
 *   2. Zotero.LitNotes 暴露了 onExtractCommand / onExportCommand
 *   3. 导出逻辑（元数据 + PDF 全文）在 mock 数据下能生成正确的 txt
 *
 * 用法：node scripts/verify_skeleton.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

// ---------- Mock Zotero 7 全局 ----------
const _log = [];
globalThis.Zotero = {
  debug: (...a) => _log.push(a.join(" ")),
};
globalThis.Zotero.getActiveZoteroPane = () => pane;
globalThis.Zotero.getMainWindow = () => ({
  Cc: {},
  Ci: { nsIFilePicker: { modeSave: 2, returnOK: 0 } },
  browsingContext: {},
  alert: (m) => { _log.push("ALERT: " + m); },
});
globalThis.Zotero.initializationPromise = Promise.resolve();
globalThis.Zotero.ItemFields = {};

// mock IOUtils —— bootstrap 的 _log 用它写日志（沙箱里 IOUtils 是全局注入的）
let _ioBuf = "";
globalThis.IOUtils = {
  exists: () => _ioBuf.length > 0,
  readUTF8: () => _ioBuf,
  writeUTF8: (p, content) => { _ioBuf = content; },
};

// mock Zotero.Item (用于 A 版写子笔记)
let createdNotes = [];
globalThis.Zotero.Item = class {
  constructor(type) {
    this.type = type;
    this.parentID = null;
    this._fields = {};
  }
  setField(k, v) { this._fields[k] = v; }
  setNote(v) { this._fields.note = v; }
  async saveTx() { createdNotes.push({ parentID: this.parentID, libraryID: this.libraryID, type: this.type, ...this._fields }); }
};

// mock Zotero.Prefs
const prefStore = {};
globalThis.Zotero.Prefs = {
  get: (k) => prefStore[k],
  set: (k, v) => { prefStore[k] = v; },
};

// mock fetch —— 返回假 LLM JSON
let lastLlmCall = null;
globalThis.fetch = async (url, opts) => {
  lastLlmCall = { url, opts };
  // 依据 system prompt 分支：提取(含"三个维度")返回三块 JSON；总结(对比分析)返回 Markdown
  let sys = "";
  try { sys = JSON.parse(opts.body).messages[0].content || ""; } catch (_) {}
  let content = "";
  if (/综合分析师/.test(sys)) {
    content = "# 跨文献综合总结\n\n| 文献 | 侧重点 | 优点 | 缺点 |\n|---|---|---|---|\n| 文献一《A》 | 高精度线性化 | 精度高 | 成本高 |\n| 文献二《B》 | 低复杂度 | 结构简单 | 精度一般 |";
  } else {
    content = '{"标题翻译":"调频激光线性化研究","内容":"提出并验证了一种新的调频激光线性化方法，解决了啁啾非线性问题。","理论验证":"推导了误差模型并证明算法收敛，式(3)给出解。","实验":"在FMCW测试台上做了对比实验，使用不同扫频参数，精度提升40%，图5为平台。","创新点":"首次引入迭代学习控制改善线性度。","不足":"仅在特定测试台验证，未考虑更大带宽与成本。","图表":[{"图号":"图3.1","页码":"第29-33页","小节":"实验","说明":"测距仪实物结构"}]}';
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: { content },
      }],
    }),
  };
};

// A 版测试函数引用
globalThis.__lastLlmCall = () => lastLlmCall;

// mock PDFWorker.getFullText
let pdfText = "This is the mock PDF full text content of the paper.";
globalThis.Zotero.PDFWorker = {
  getFullText: async (id, maxPages) => ({ text: pdfText, extractedPages: 2, totalPages: 2 }),
};

// mock file picker save
let savedContent = null;
function makeFilePicker() {
  return {
    init() {},
    appendFilter() {},
    set defaultString(v) { this._d = v; },
    get defaultString() { return this._d; },
    open(cb) { cb(1); }, // returnOK
    file: { path: "/tmp/mock-out.txt" },
  };
}

// mock an item
function makeItem(opts) {
  return {
    getCreators: () => (opts.creators || []).map((c) =>
      Array.isArray(c) ? { lastName: c[0], firstName: c[1] || "" } : c),
    getField: (f) => opts.fields[f],
    isRegularItem: true,
    getBestAttachment: () => (opts.att ? makeAttachment(opts.att) : null),
    getCollections: () => (opts.collections || []),
    id: opts.id,
    libraryID: 1,
  };
}
// mock Zotero.Collections（用于跨文献总结标题的“所在文件夹”）
globalThis.Zotero.Collections = {
  get: (id) => ({ name: id === 7 ? "频率调制连续波" : "未知集", id }),
};
function makeAttachment(name) {
  return {
    getField: () => name,
    isPDFAttachment: () => true,
    id: 501,
  };
}

// ---------- mock Zotero.getActiveZoteroPane ----------
let pane = {
  getSelectedItems: () => [],
};

// ---- mock 一个"主窗口 document"，含 zotero-itemmenu，用于验证菜单注入 ----
const fakeDoc = {
  readyState: "complete",
  _byId: {},
  getElementById(id) { return this._byId[id] || null; },
  setElementById(id, el) { this._byId[id] = el; },
  createXULElement(tag) {
    const el = {
      tagName: tag,
      _attrs: {},
      setAttribute(k, v) { this._attrs[k] = v; },
      getAttribute(k) { return this._attrs[k]; },
      addEventListener(type, fn) { this._listener = fn; this._type = type; },
      appendChild() {},
    };
    // id 属性赋值时同步进 _byId，模拟真实 document.getElementById 行为
    Object.defineProperty(el, "id", {
      get() { return this._attrs.id; },
      set(v) { this._attrs.id = v; if (v) fakeDoc._byId[v] = this; },
    });
    return el;
  },
};
// zotero-itemmenu 预置为空 menupopup
const itemMenu = { appendChild() {}, _children: [] };
fakeDoc._byId["zotero-itemmenu"] = itemMenu;

// window manager mock
const openedListeners = [];
const wmMock = {
  getEnumerator() {
    // 枚举出一个"已打开的主窗口"
    let done = false;
    return {
      hasMoreElements: () => !done,
      getNext: () => { done = true; return wmMock._mockWindow; },
    };
  },
  addListener(l) { openedListeners.push(l); },
};
// 模拟一个已打开的主窗口
wmMock._mockWindow = {
  document: fakeDoc,
  addEventListener() {},
};

// ---------- load bootstrap + main ----------
async function load() {
  // 全局 Services：bootstrap 通过 ChromeUtils.import 取得，main.js 由 scope 注入
  globalThis.Services = {
    scriptloader: {
      loadSubScript: (uri, targetObj) => {
        // 模拟从 rootURI 加载 content/main.js
        const p = path.join(ROOT, uri.replace(/^.*?\/content\//, "content/"));
        const code = fs.readFileSync(p, "utf8");
        // 把 targetObj(scope) 里的 Zotero/Services 暴露给被加载脚本
        if (targetObj) {
          globalThis.Zotero = targetObj.Zotero || globalThis.Zotero;
          globalThis.Services = targetObj.Services || globalThis.Services;
          globalThis.IOUtils = targetObj.IOUtils || globalThis.IOUtils;
        }
        (0, eval)(code);
      },
    },
    wm: wmMock,
  };
  globalThis.ChromeUtils = {
    import: () => ({
      Services: globalThis.Services,
      IOUtils: globalThis.IOUtils || {},
    }),
  };

  // 执行 bootstrap.js（模拟 startup）
  const bcode = fs.readFileSync(path.join(ROOT, "bootstrap.js"), "utf8");
  // bootstrap 引用 ChromeUtils / Services / globalThis —— 已 mock
  (0, eval)(bcode);
  const ctx = {
    id: "zotero-literature-notes@mjq.local",
    version: "0.1.0",
    rootURI: "file:///mnt/d/zotero-literature-notes/",
    resourceURI: { spec: "file:///mnt/d/zotero-literature-notes/" },
  };
  await globalThis.startup(ctx, 1);
}

// ---------- assertions ----------
function assert(cond, msg) {
  if (!cond) { console.error("✗ FAIL:", msg); process.exitCode = 1; }
  else console.log("✓", msg);
}

(async () => {
  console.log("== 1. 加载 bootstrap + main ==");
  await load();
  assert(globalThis.Zotero.LitNotes, "Zotero.LitNotes 已挂载");
  assert(typeof globalThis.Zotero.LitNotes.onExtractCommand === "function", "onExtractCommand 存在");
  assert(typeof globalThis.Zotero.LitNotes.onExportCommand === "function", "onExportCommand 存在");
  assert(typeof globalThis.Zotero.LitNotes._extractPdfText === "function", "_extractPdfText (PDF读取) 存在");

  console.log("\n== 2. 无选中文献 -> 提示 ==");
  pane.getSelectedItems = () => [];
  await globalThis.Zotero.LitNotes.onExportCommand();
  assert(_log.some((l) => /未选中/.test(l)), "未选中时给出提示");

  console.log("\n== 3. 有选中文献 -> 导出元数据 + PDF 全文 ==");
  const item = makeItem({
    id: 7,
    creators: [["Zhao", "Xiaosheng"]],
    fields: {
      title: "Laser frequency sweep linearization",
      year: "2026",
      DOI: "10.1234/fmcw",
      abstractNote: "Abstract of the FMCW paper.",
    },
    att: "paper.pdf",
  });
  // 拦截 _saveTxt，捕获内容
  globalThis.Zotero.LitNotes._saveTxt = async (content) => { savedContent = content; return true; };
  pane.getSelectedItems = () => [item];
  await globalThis.Zotero.LitNotes.onExportCommand();
  assert(savedContent && /Laser frequency sweep linearization/.test(savedContent), "导出的 txt 含标题");
  assert(savedContent && /Zhao, Xiaosheng/.test(savedContent), "导出的 txt 含作者");
  assert(savedContent && /DOI\s*:\s*10\.1234\/fmcw/.test(savedContent), "导出的 txt 含 DOI");
  assert(savedContent && /mock PDF full text/.test(savedContent), "导出的 txt 含 PDF 全文");
  assert(savedContent && !/提取失败/.test(savedContent), "PDF 全文提取成功（无失败标记）");

  console.log("\n== dump 导出的 txt 前 12 行 ==");
  console.log(savedContent.split("\n").slice(0, 12).map((l) => "  " + l).join("\n"));

  console.log("\n== 4. 菜单注入（Zotero 7+/9 动态 DOM 方式） ==");
  // main.js 的 async IIFE 应在 initializationPromise 后调用过 installMenu()
  assert(fakeDoc._byId["litnotes-menu-sep"], "已注入菜单分隔符 (litnotes-menu-sep)");
  assert(fakeDoc._byId["litnotes-menu-extract"], "已注入「提取选中文献笔记」菜单项");
  assert(fakeDoc._byId["litnotes-menu-export"], "已注入「导出选中文献为 txt」菜单项");
  assert(openedListeners.length > 0, "已注册窗口监听（新开窗口也会注入菜单）");

  console.log("\n== 5. Zotero 9 onMainWindowLoad 钩子注入 ==");
  // 独立窗口工厂：元素 id 注册到该窗口自己的 _byId（模拟真实 document）
  function makeFakeWindow() {
    const doc = {
      readyState: "complete",
      _byId: {},
      getElementById(id) { return this._byId[id] || null; },
      setElementById(id, el) { this._byId[id] = el; },
      createXULElement(tag) {
        const el = {
          tagName: tag,
          _attrs: {},
          setAttribute(k, v) { this._attrs[k] = v; },
          getAttribute(k) { return this._attrs[k]; },
          addEventListener() {},
          appendChild() {},
        };
        Object.defineProperty(el, "id", {
          get() { return this._attrs.id; },
          set(v) { this._attrs.id = v; if (v) doc._byId[v] = this; },
        });
        return el;
      },
    };
    doc.setElementById("zotero-itemmenu", { appendChild() {} });
    return { location: { href: "chrome://zotero/content/zoteroPane.xhtml" }, document: doc };
  }

  // 直接调用 LitNotes._onMainWindowLoad，验证注入逻辑本身
  const w2 = makeFakeWindow();
  globalThis.Zotero.LitNotes._onMainWindowLoad(w2);
  assert(w2.document._byId["litnotes-menu-export"], "LitNotes._onMainWindowLoad 在新窗口注入了菜单项");

  // 通过 bootstrap 的 onMainWindowLoad（模拟 Zotero 调用插件钩子）走完整链路
  const w3 = makeFakeWindow();
  globalThis.onMainWindowLoad({ window: w3 }, 6);
  assert(w3.document._byId["litnotes-menu-export"], "bootstrap onMainWindowLoad 成功注入菜单");

  console.log("\n== 6. A 版：AI 四步提取 + 写 Zotero 子笔记 ==");
  // 配置 DeepSeek key
  globalThis.Zotero.Prefs.set("extensions.zotero.litnotes.provider", "deepseek");
  globalThis.Zotero.Prefs.set("extensions.zotero.litnotes.deepseekApiKey", "sk-test");
  // 用带 PDF 的 item 跑 _extractItem + _createNote
  const aItem = makeItem({
    id: 42,
    creators: [["Li", "Wei"]],
    fields: { title: "FMCW Lidar chirp linearization", year: "2026", DOI: "10.9/fmcw2", abstractNote: "An English abstract." },
    att: "paper.pdf",
    collections: [7],
  });
  const provider = globalThis.Zotero.LitNotes._getConfig("provider");
  const apiKey = globalThis.Zotero.LitNotes._getApiKey(provider);
  assert(provider === "deepseek" && apiKey === "sk-test", "配置读取到 provider + key");
  const fields = await globalThis.Zotero.LitNotes._extractItem(aItem, provider, apiKey);
  assert(fields && fields["内容"] && fields["创新点"] && fields["不足"] && fields["理论验证"] && fields["实验"], "_extractItem 解析出全部提取字段");
  assert(Array.isArray(fields["图表"]) && fields["图表"][0].图号 === "图3.1" && fields["图表"][0].页码 === "第29-33页" && fields["图表"][0].小节 === "实验", "_extractItem 解析出图表清单（图号/页码/小节）");
  assert(/[\u4e00-\u9fa5]/.test(fields["创新点"]) && /[\u4e00-\u9fa5]/.test(fields["内容"]), "提取结果内容为中文");
  const callHref = globalThis.__lastLlmCall().url;
  assert(/deepseek/.test(callHref), "LLM 调用打到 DeepSeek API 地址");
  const body = JSON.parse(globalThis.__lastLlmCall().opts.body);
  assert(body.messages[0].role === "system" && /简体中文/.test(body.messages[0].content), "prompt 要求中文输出");
  assert(body.model === "deepseek-chat", "默认 DeepSeek 模型为 deepseek-chat");
  // 模型选择：配置里设置自定义模型名后应生效
  globalThis.Zotero.Prefs.set("extensions.zotero.litnotes.model", "deepseek-v4-pro");
  assert(globalThis.Zotero.LitNotes._modelName("deepseek") === "deepseek-v4-pro", "_modelName 读取配置中的自定义模型");
  assert(globalThis.Zotero.LitNotes._modelOptions("deepseek").indexOf("deepseek-v4-pro") >= 0, "模型清单含 deepseek-v4-pro");
  assert(globalThis.Zotero.LitNotes._modelOptions("glm").indexOf("glm-4-flash") >= 0, "GLM 模型清单含 glm-4-flash");
  // 图号解析：识别笔记文本里的“图N/Figure N/Fig. N”
  const figRefs = globalThis.Zotero.LitNotes._figureRefs("如图5为系统平台，fig. 3 性能，Figure10曲线");
  assert(figRefs.length === 3 && figRefs[0].number === 5 && figRefs[1].number === 3 && figRefs[2].number === 10, "能识别笔记中的图号（图5/fig.3/Figure10）");
  // 自定义模型（与 DeepSeek/智谱并列的第三个提供方）
  globalThis.Zotero.Prefs.set("extensions.zotero.litnotes.provider", "custom");
  globalThis.Zotero.Prefs.set("extensions.zotero.litnotes.customBaseUrl", "https://myapi.example.com/v1/chat/completions");
  globalThis.Zotero.Prefs.set("extensions.zotero.litnotes.customModel", "My-Pro");
  globalThis.Zotero.Prefs.set("extensions.zotero.litnotes.customApiKey", "sk-custom");
  assert(globalThis.Zotero.LitNotes._providerName("custom") === "自定义模型", "自定义模型与 DeepSeek/智谱并列（provider 名）");
  assert(globalThis.Zotero.LitNotes._modelName("custom") === "my-pro", "自定义模型名转小写");
  assert(globalThis.Zotero.LitNotes._getApiKey("custom") === "sk-custom", "自定义模型读取独立 API Key");
  // 先用 deepseek 恢复 provider 供后续断言
  globalThis.Zotero.Prefs.set("extensions.zotero.litnotes.provider", "deepseek");
  const noteBody = body.messages[1].content || "";
  assert(/\u3010\u6b63\u6587\u5168\u6587\u3011/.test(noteBody), "喂给 LLM 的正文含 PDF 全文");
  assert(/不足/.test(body.messages[0].content), "prompt 含“不足”维度（研究核心模板）");
  const noteOk = await globalThis.Zotero.LitNotes._createNote(aItem, fields);
  assert(noteOk, "_createNote 返回成功");
  assert(createdNotes.length === 1 && createdNotes[0].parentID === 42, "创建了 parent=42 的子笔记");
  assert(/研究核心：/.test(createdNotes[0].note), "笔记标题为“研究核心：…”");
  assert(/调频激光线性化研究/.test(createdNotes[0].note), "英文标题自动加中文译注");
  assert(/<h1[^>]*font-size:26pt/.test(createdNotes[0].note), "文章标题为黑体一号(26pt)");
  assert(/<h2[^>]*font-size:22pt/.test(createdNotes[0].note) && /<p[^>]*font-size:22pt/.test(createdNotes[0].note), "内容小标题+正文为黑体二号(22pt)");
  assert(/font-family:黑体/.test(createdNotes[0].note), "使用黑体字体");
  assert(/主要做了哪些事有什么成果/.test(createdNotes[0].note) && /理论验证/.test(createdNotes[0].note) && /实验设置及做的实验/.test(createdNotes[0].note) && /创新点解决的问题/.test(createdNotes[0].note), "单篇笔记含跨文献四块标题（成果/理论验证/实验/创新点）");
  // 跨文献综合总结：传给 okResults 数组，生成独立顶层笔记（无 parentID），标题带所在文件夹名
  const okResults = [{ item: aItem, ok: true, fields }, { item: aItem, ok: true, fields }];
  const sOk = await globalThis.Zotero.LitNotes._createSummaryNote(okResults, provider, apiKey);
  assert(sOk, "_createSummaryNote 多篇时返回成功");
  assert(createdNotes.length === 2, "多篇时额外生成跨文献综合总结笔记");
  assert(createdNotes[1].parentID === null, "综合总结为独立笔记（不设 parentID，位置由用户决定）");
  assert(/频率调制连续波跨文献总结/.test(createdNotes[1].note), "综合总结标题为<文件夹名>跨文献总结");
  assert(/<h1[^>]*font-size:26pt[^>]*>频率调制连续波跨文献总结/.test(createdNotes[1].note), "综合总结标题黑体一号，与单篇一致");
  assert(/<td[^>]*font-size:22pt/.test(createdNotes[1].note), "综合总结表格单元格黑体二号，与单篇一致");
  const summarySys = JSON.parse(globalThis.__lastLlmCall().opts.body).messages[0].content;
  assert(/侧重点/.test(summarySys) && /优点/.test(summarySys) && /缺点/.test(summarySys) && /Markdown 表格/.test(summarySys), "综合总结 prompt 要求输出对比表格（侧重点/优点/缺点）");
  assert(/<table/.test(createdNotes[1].note) && /侧重点/.test(createdNotes[1].note), "综合总结笔记为 HTML 对比表格");
  assert(!globalThis.Zotero.LitNotes._buildSummaryTxt, "已移除 txt 导出（不再生成综合摘要 txt）");

  if (!process.exitCode) console.log("\\n✔ 全部验证通过");
  else console.log("\\n✗ 存在失败项");
})();
