/**
 * content/main.js — Zotero 文献笔记提取插件 · 核心逻辑
 *
 * 由 bootstrap.js 的 startup 通过 Services.scriptloader.loadSubScript 注入。
 * 挂到 Zotero.LitNotes 命名空间。
 *
 * ⚠️ Zotero 7+/9 不支持 XUL overlay，右键菜单必须用原生 DOM API 动态注入
 *    （监听 zotero-itemmenu 的 popupshowing，动态 append 菜单项）。
 *    见下方 installItemMenu()。并通过 Zotero 9 官方 onMainWindowLoad 钩子注入。
 *
 * 「先 B 后 A」：
 *   - B 版：选中文献 → 读元数据/PDF → 导出 txt（不依赖 AI）—— 已打通
 *   - A 版：调 LLM API（DeepSeek/智谱 GLM 可切换）→ 四步提取（中文）→
 *           写 Zotero 子笔记 + 跨文献综合 txt
 */

"use strict";

(async () => {
  // only attach once
  if (Zotero.LitNotes) {
    return;
  }

  const DEBUG = true;
  function log(...args) {
    if (DEBUG) Zotero.debug("[LitNotes] " + args.join(" "));
  }

  // 偏好 key 前缀
  const PREF = "extensions.zotero.litnotes.";

  // //////////////////////////////////////////////////////////////////////////
  // 公开 API
  // //////////////////////////////////////////////////////////////////////////
  const LitNotes = {
    /**
     * A 版入口：对选中文献做 AI 四步提取（中文）→ 写 Zotero 子笔记 +
     * 跨文献综合摘要 txt。
     */
    async onExtractCommand() {
      await Zotero.initializationPromise;
      const items = this._getSelectedItems();
      if (!items.length) {
        this._alert("未选中任何文献。请先在 Zotero 中勾选若干条文献。");
        return;
      }
      log("onExtractCommand: " + items.length + " item(s)");

      const provider = this._getConfig("provider") || "deepseek";
      const apiKey = this._getApiKey(provider);
      if (!apiKey) {
        this._alert(`尚未配置 ${this._providerName(provider)} 的 API Key。\n请先使用右键菜单 →「插件设置…」填写。`);
        return;
      }
      log("using provider=" + provider + " model=" + this._modelName(provider));

      const results = []; // { item, ok, fields, error?, noteOk? }
      for (const item of items) {
        const res = await this._extractItem(item, provider, apiKey);
        if (res && res.error) {
          results.push({ item, ok: false, error: res.error });
          continue;
        }
        const noteOk = await this._createNote(item, res);
        if (!noteOk) {
          // 提取成功但笔记写入失败 —— 也要如实报告
          results.push({ item, ok: false, error: "AI 提取成功，但写入 Zotero 笔记失败（见错误控制台）" });
          continue;
        }
        results.push({ item, ok: true, fields: res, noteOk: true });
        log("extracted + note -> " + (item.getField("title") || item.id));
      }

      // 多篇成功时：生成一条"跨文献综合总结"笔记（所有文献要点合在一起）
      let summaryOk = false;
      const okItems = results.filter((r) => r.ok && r.fields);
      if (okItems.length >= 2) {
        summaryOk = await this._createSummaryNote(okItems, provider, apiKey);
      }

      // 只写 Zotero 子笔记，不导出 txt（用户需求：笔记存进 Zotero 自己的笔记）
      const ok = results.filter((r) => r.ok).length;
      const fail = results.length - ok;
      let msg = `完成！已为 ${ok} 篇文献生成 Zotero 笔记，失败 ${fail} 篇。`;
      if (summaryOk) msg += "\n另生成 1 条「跨文献综合总结」独立笔记（所有文献要点合在一起，放置位置可在 Zotero 中自行安排）。";
      if (fail) {
        // 显示前几条失败原因，便于定位（API/网络错误通常是共性的）
        const reasons = results.filter((r) => !r.ok).slice(0, 2)
          .map((r) => "· " + ((r.item.getField && r.item.getField("title")) || r.item.id) + "：\n  " + (r.error || "未知错误"));
        msg += "\n\n失败原因（前 2 条）：\n" + reasons.join("\n\n");
      }
      this._alert(msg);
    },

    /** 插件设置：选择 provider（DeepSeek / 智谱 / 自定义模型）+ 填对应配置。 */
    async onSettingsCommand() {
      const win = Zotero.getMainWindow();
      const prompt = Services.prompt;
      // 第一层（最外）：三个并列的提供方
      const providers = ["DeepSeek", "智谱 GLM (zai)", "自定义模型"];
      const curP = this._getConfig("provider") || "deepseek";
      const curIdx = curP === "glm" ? 1 : (curP === "custom" ? 2 : 0);
      const sel = { value: curIdx };
      const okSel = prompt.select(win, "AI 提供方", "选择要使用的 LLM 提供方：", providers, sel);
      if (!okSel || sel.value < 0) return;
      const provider = sel.value === 2 ? "custom" : (sel.value === 1 ? "glm" : "deepseek");
      this._setConfig("provider", provider);

      if (provider === "custom") {
        // 自定义模型：需要 API 地址 + 模型名 + API Key
        const urlIn = { value: this._getConfig("customBaseUrl") || "https://api.deepseek.com/chat/completions" };
        const uOk = prompt.prompt(win, "自定义 API 地址", "OpenAI 兼容的 chat/completions 接口地址：", urlIn, null, { value: false });
        if (!uOk || !urlIn.value) return;
        this._setConfig("customBaseUrl", urlIn.value.trim());

        const mIn = { value: this._getConfig("customModel") || "" };
        const mOk = prompt.prompt(win, "自定义模型名", "输入模型名（如 deepseek-v4-pro）：", mIn, null, { value: false });
        if (!mOk || !mIn.value) return;
        this._setConfig("customModel", String(mIn.value).trim().toLowerCase());

        const kIn = { value: this._getConfig("customApiKey") || "" };
        const kOk = prompt.prompt(win, "自定义 API Key", "该接口的 API Key，留空保持不变：", kIn, null, { value: false });
        if (kOk && kIn.value) this._setConfig("customApiKey", kIn.value.trim());

        this._alert(`设置已保存。当前：自定义模型 / ${this._modelName(provider)}`);
        return;
      }

      // 内置提供方：选具体模型（含"自定义模型…"末尾项）
      const opts = this._modelOptions(provider);
      const curModel = this._modelName(provider);
      let curMIdx = opts.indexOf(curModel);
      if (curMIdx < 0) curMIdx = 0;
      const mSel = { value: curMIdx };
      const okModel = prompt.select(win, "AI 模型", "选择要使用的模型（末尾可自定义）：", opts, mSel);
      let model = opts[mSel.value] || "deepseek-chat";
      if (okModel && mSel.value < 0) return;
      if (model === "自定义模型…" || model === undefined) {
        const cIn = { value: curModel };
        const cOk = prompt.prompt(win, "自定义模型名", "输入模型名（如 deepseek-v4-pro）：", cIn, null, { value: false });
        if (cOk && cIn.value) model = cIn.value.trim();
        else return;
      }
      this._setConfig("model", String(model).trim().toLowerCase());

      // 填对应 API Key
      if (provider === "deepseek") {
        const dsIn = { value: this._getConfig("deepseekApiKey") || "" };
        const dsOk = prompt.prompt(win, "DeepSeek API Key", "DeepSeek（api.deepseek.com）API Key，留空保持不变：", dsIn, null, { value: false });
        if (dsOk && dsIn.value) this._setConfig("deepseekApiKey", dsIn.value.trim());
      } else {
        const glmIn = { value: this._getConfig("glmApiKey") || "" };
        const glmOk = prompt.prompt(win, "智谱 GLM API Key", "智谱（open.bigmodel.cn）API Key，留空保持不变：", glmIn, null, { value: false });
        if (glmOk && glmIn.value) this._setConfig("glmApiKey", glmIn.value.trim());
      }

      this._alert(`设置已保存。当前：${this._providerName(provider)} / 模型 ${this._modelName(provider)}`);
    },

    /**
     * B 版入口：把选中文献的元数据 + PDF 全文导出为 txt。
     */
    async onExportCommand() {
      await Zotero.initializationPromise;
      const items = this._getSelectedItems();
      if (!items.length) {
        this._alert("未选中任何文献。请先在 Zotero 中勾选若干条文献。");
        return;
      }
      const lines = [];
      for (const item of items) {
        lines.push(...await this._formatItemForTxt(item));
      }
      const txt = lines.join("\n");
      const ok = await this._saveTxt(txt);
      if (ok) this._alert(`已导出 ${items.length} 条文献信息。`);
      log("onExportCommand done, " + lines.length + " lines");
    },

    // ////////////////////////////////////////////////////////////////////////
    // 内部实现
    // ////////////////////////////////////////////////////////////////////////

    /** 获取当前 Zotero 窗口中选中的条目。 */
    _getSelectedItems() {
      const pane = Zotero.getActiveZoteroPane();
      if (!pane) return [];
      return pane.getSelectedItems() || [];
    },

    // ----- 配置 -----
    _getConfig(key) {
      try { return Zotero.Prefs.get(PREF + key); } catch (e) { return undefined; }
    },
    _setConfig(key, value) {
      try { Zotero.Prefs.set(PREF + key, value); } catch (e) { log("setConfig error: " + e); }
    },
    _providerName(p) {
      return p === "glm" ? "智谱 GLM" : (p === "custom" ? "自定义模型" : "DeepSeek");
    },
    _getApiKey(provider) {
      const k = provider === "glm" ? "glmApiKey" : (provider === "custom" ? "customApiKey" : "deepseekApiKey");
      return this._getConfig(k) || "";
    },
    _modelName(provider) {
      if (provider === "custom") {
        const cm = this._getConfig("customModel");
        return cm ? String(cm).trim().toLowerCase() : "";
      }
      const m = this._getConfig("model");
      if (m) return String(m).trim().toLowerCase();
      return provider === "glm" ? "glm-4-flash" : "deepseek-chat";
    },
    /** 该提供方可选模型清单（含"自定义模型…"末尾项）。 */
    _modelOptions(provider) {
      return provider === "glm"
        ? ["glm-4-flash", "glm-4", "glm-4-plus", "glm-4-long", "自定义模型…"]
        : ["deepseek-chat", "deepseek-reasoner", "deepseek-v4-pro", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp", "自定义模型…"];
    },

    // ----- LLM 调用 -----
    /**
     * 调 OpenAI 兼容 chat completions。返回 assistant 文本内容；失败抛错。
     */
    async _callLLM(provider, apiKey, system, user) {
      const isGlm = provider === "glm";
      const url = provider === "custom"
        ? (this._getConfig("customBaseUrl") || "https://api.deepseek.com/chat/completions")
        : (isGlm
            ? "https://open.bigmodel.cn/api/paas/v4/chat/completions"
            : "https://api.deepseek.com/chat/completions");
      // 模型名统一去掉首尾空格并转小写，避免大小写不一致导致 DeepSeek 400
      const model = String(this._modelName(provider)).trim().toLowerCase();
      const body = {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.3,
        max_tokens: 8192,
      };
      log("LLM call -> " + provider + "/" + model);
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey,
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error("HTTP " + resp.status + " " + errText.substring(0, 300));
      }
      const data = await resp.json();
      const msg = data && data.choices && data.choices[0] && data.choices[0].message;
      // 兼容推理型模型：思考内容在 reasoning_content，正文在 content
      let content = msg && (msg.content || msg.reasoning_content || "");
      content = String(content || "").trim();
      if (!content) {
        // 把正在请求的 model、HTTP 状态与服务器真实响应带回，便于定位
        let snippet = "";
        try { snippet = JSON.stringify(data).substring(0, 400); } catch (_) {}
        throw new Error("LLM 返回为空：正在请求 model=「" + model + "」, HTTP " + resp.status
          + "。若服务器没有返回正文，通常是因为该模型名在平台不存在。服务器响应：" + (snippet || "(无可打印响应)"));
      }
      return content;
    },

    // ----- 三块提取（研究核心模板）-----
    /**
     * 对单篇文献做 AI 提取，返回 {内容, 创新点, 不足} 或 {error}。
     * 结构对齐"研究核心"笔记模板：做了什么/解决什么问题、创新点、不足。一律中文。
     */
    async _extractItem(item, provider, apiKey) {
      try {
        const meta = this._collectMetadata(item);
        const pdfText = await this._extractBestPdf(item);
        const content = [
          "【文献元数据】",
          `标题: ${meta.title}`,
          `作者: ${meta.creators}`,
          `年份: ${meta.year}`,
          `DOI: ${meta.doi}`,
          "【摘要】",
          meta.abstract || "(无)",
          "【正文全文】",
          pdfText ? pdfText.substring(0, 8000) : "(无 PDF 全文)",
        ].filter((l) => l !== undefined).join("\n");

        const system =
          "你是一位严谨的学术文献分析助手。请阅读用户提供的文献（可能是中文或英文），" +
          "严格按照以下维度做结构化提取，并且【一律用简体中文输出】：" +
          "\n0. 标题翻译：把这篇文献的标题翻译成简体中文（若标题本就是中文则原样返回中文；若是英文则给出准确中文译名）。" +
          "\n1. 内容：这篇文献主要做了哪些事情，解决了什么问题，采用了什么主要方法，取得了哪些结果/成果，要具体、完整。此项为“主要工作与成果”的概括。" +
          "\n2. 理论验证：【要详细】写明作者做了哪些理论推导、建模、分析或仿真验证，写出推导逻辑与关键步骤；若论文中出现理论公式，逐个说明其标号、含义与作用（用文字描述公式内容，如“式(3)给出…的解析表达式”）。" +
          "\n3. 实验：【要详细】写明实验/仿真设置、实验环境与器材、变量、数据来源、对比对象，以及做的每一步实验是怎么进行的（流程、步骤、结果）；若论文中有实验框图/结果图，用文字描述其内容（如“图5为系统实验平台组成示意图”），并说明每张关键图展示了什么。" +
          "\n【重要】凡是论文里你认为值得让读者直观看到的图（框图、原理图、实验结果图等）或公式，都要在对应小节中用「图N（第X页）」或「式(N)（第X页）」的写法标出它的图号/式号和其在 PDF 中的页码，便于后续从 PDF 中定位插入。若无法确定页码可只写图号。" +
          "\n4. 创新点：主要创新点是什么，解决了什么问题，与已有工作相比有什么不同/优势。" +
          "\n5. 不足：这篇文献存在什么局限、不足或未来可改进之处。若原文未明确提及，请基于方法合理推断。" +
          "\n6. 图表清单：把这篇文献里所有【值得读者直观看到、应该被截图放入笔记】的图与关键公式整理成一个数组，每项含：图号（如：图3.1）、页码（该图/公式所在页码或页码范围，尽量精确，如：第29-33页）、小节（该图出现在“内容/理论验证/实验”哪一部分，三选一）、说明（一句话：它展示/表达什么）。公式也可收录（图号用：式(N)）。纯装饰性图可忽略；没有值得收录的图/公式时数组可为空。\n" +
          "请只输出一个 JSON 对象，不要任何额外文字，格式：" +
          '{"标题翻译":"<中文标题>","内容":"<内容>","理论验证":"<详细内容，含公式描述>","实验":"<详细内容，含图与实验流程描述>","创新点":"<创新点>","不足":"<不足>","图表":[{"图号":"图3.1","页码":"第29页","小节":"实验","说明":"单光子测距仪实物结构"}]}';

        const raw = await this._callLLM(provider, apiKey, system, content);
        const fields = this._parseJsonLoose(raw);
        if (!fields || typeof fields !== "object" || !("内容" in fields)) {
          // 把原始返回内容带出来，便于判断是 JSON 截断/格式还是字段命名问题
          const rawSnip = String(raw || "").replace(/\s+/g, " ").substring(0, 300);
          throw new Error("无法解析 LLM 输出为提取 JSON。返回内容开头：" + (rawSnip || "(空)"));
        }
        // 图表清单：规范化数组，供标注/截图嵌入使用
        let figs = [];
        if (Array.isArray(fields["图表"])) figs = fields["图表"];
        else if (fields["图表"] && typeof fields["图表"] === "object") figs = [fields["图表"]];
        const normFigs = figs.map((f) => ({
          图号: String((f && f["图号"]) || "").trim(),
          页码: String((f && f["页码"]) || "").trim(),
          小节: String((f && f["小节"]) || "").trim(),
          说明: String((f && f["说明"]) || "").trim(),
        })).filter((f) => f.图号);
        return {
          标题翻译: String(fields["标题翻译"] || "").trim(),
          内容: String(fields["内容"] || "").trim(),
          理论验证: String(fields["理论验证"] || "").trim(),
          实验: String(fields["实验"] || "").trim(),
          创新点: String(fields["创新点"] || "").trim(),
          不足: String(fields["不足"] || "").trim(),
          图表: normFigs,
        };
      } catch (e) {
        const msg = String((e && e.message) || e);
        log("_extractItem error for " + (item.getField && item.getField("title") || item.id) + ": " + msg);
        return { error: msg };
      }
    },

    /** 收集单篇文献元数据。 */
    _collectMetadata(item) {
      const creators = (item.getCreators ? item.getCreators() : [])
        .map((c) => (c.firstName ? `${c.lastName}, ${c.firstName}` : c.lastName))
        .join("; ");
      return {
        title: item.getField("title") || "(无标题)",
        creators: creators || "(未知)",
        year: item.getField("year") || "",
        doi: item.getField("DOI") || "",
        abstract: (item.getField("abstractNote") || "").replace(/\s+/g, " "),
      };
    },

    /** 提取单篇文献最佳 PDF 全文；无则返回 null。 */
    async _extractBestPdf(item) {
      const att = await this._getBestPdfAttachment(item);
      if (!att) return null;
      return this._extractPdfText(att);
    },

    /** 宽容解析 LLM 返回的 JSON：容忍 ```json 围栏与前后杂质。 */
    _parseJsonLoose(text) {
      if (!text) return null;
      let t = text.trim();
      // 去掉 markdown 围栏
      const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (fence) t = fence[1].trim();
      // 截取第一个 { 到最后一个 }
      const s = t.indexOf("{");
      const e = t.lastIndexOf("}");
      if (s >= 0 && e > s) t = t.substring(s, e + 1);
      try {
        return JSON.parse(t);
      } catch (e1) {
        try {
          return JSON.parse(t.replace(/([{,]\s*)(["']?)(\w+)\2\s*:/g, '$1"$3":'));
        } catch (e2) {
          return null;
        }
      }
    },

    // ----- 写 Zotero 子笔记 -----
    /**
     * 在文献 item 下创建一条 Markdown 笔记。返回 true/false。
     * 模板对齐"研究核心"：标题=研究核心：<文献标题>；Tips 行；内容/创新点/不足 三小节。
     * 注意：Zotero 创建笔记必须显式设 libraryID，并用 setNote() 写入内容。
     */
    async _createNote(parentItem, fields) {
      try {
        const item = new Zotero.Item("note");
        item.libraryID = parentItem.libraryID;
        item.parentID = parentItem.id;
        const title = parentItem.getField("title") || "文献笔记";
        // 英文标题加中文注释：研究核心：<英文标题>（<中文译名>）
        const hasLatin = /[A-Za-z]/.test(title);
        const cn = (fields["标题翻译"] || "").trim();
        const heading = hasLatin && cn
          ? "研究核心：" + title + "（" + cn + "）"
          : "研究核心：" + title;
        // HTML 排版：文章标题黑体一号(26pt)；内容(小标题+正文)黑体二号(22pt)
        const F = "font-family:黑体,'SimHei';";
        // 单篇笔记采用与跨文献总结一致的四块结构
        const html = [
          '<h1 style="' + F + 'font-size:26pt;margin:0 0 8px;">' + this._esc(heading) + '</h1>',
          this._sec(F, "1、主要做了哪些事有什么成果", fields["内容"]),
          this._sec(F, "2、理论验证", fields["理论验证"]),
          this._sec(F, "3、实验设置及做的实验", fields["实验"]),
          this._sec(F, "4、主要创新点解决的问题", fields["创新点"]),
          this._sec(F, "5、不足", fields["不足"]),
        ].join("\n");
        // 尝试按笔记中提到的图号/式号从 PDF 定位并嵌入图片；失败则保留文字描述，不阻断生成。
        const finalHtml = await this._embedFigures(parentItem, item, html, fields);
        item.setNote(finalHtml);
        await item.saveTx();
        log("created note under item " + parentItem.id + " (library " + item.libraryID + ")");
        return true;
      } catch (e) {
        log("_createNote error: " + e + " | " + (e && e.stack));
        return false;
      }
    },

    /** 生成本文小节：小标题(黑体二号) + 正文(黑体二号)，各自换行。 */
    _sec(F, label, body) {
      const txt = this._esc(String(body || "(未提取)").replace(/\n+/g, "\n"));
      return '<h2 style="' + F + 'font-size:22pt;margin:0 0 4px;">' + label + "</h2>\n" +
        '<p style="' + F + 'font-size:22pt;margin:0 0 12px;">' + txt.replace(/\n/g, "<br>") + "</p>";
    },

    /**
     * 尽力把笔记中 AI 提到的图（图N/Figure N/Fig. N）从该文献 PDF 中定位并嵌入笔记。
     * 优先用 AI 给出的结构化「图表」清单（图号+页码+小节+说明）；取不到时回退为扫描正文里的图号。
     * 依赖真实 Zotero 的 pdf.js/Reader 渲染，我本机无法自测取图效果，
     * 因此全程 try/catch：任何一步失败都原样返回 html（保留文字描述），绝不阻断笔记生成。
     * 返回处理后的笔记 HTML。
     */
    async _embedFigures(parentItem, item, html, fields) {
      try {
        // 1) 收集要嵌入的图：优先结构化「图表」清单（含页码），否则回退扫描正文图号
        const refs = [];
        const figs = (Array.isArray(fields["图表"]) ? fields["图表"] : []).filter((f) => f && f.图号);
        if (figs.length) {
          for (const f of figs) {
            const page = this._parseFirstNum(f.页码);
            refs.push({
              label: f.图号,
              page: page,              // 可能为 null
              section: (f.小节 || "").trim(),
              note: (f.说明 || "").trim(),
            });
          }
        } else {
          const texts = [fields["实验"], fields["理论验证"], fields["内容"]].filter(Boolean).join("\n");
          for (const ref of this._figureRefs(texts)) {
            refs.push({ label: ref.label, page: null, section: "", note: "" });
          }
        }
        if (!refs.length) return html; // 没有图，直接返回

        // 2) 取该文献 PDF 的本地路径
        let pdfPath = null;
        const att = await this._getBestPdfAttachment(parentItem);
        if (att && Zotero.File && att.getFilePath) {
          pdfPath = await att.getFilePath();
        }
        if (!pdfPath) {
          log("embedFigures: no pdf path; 保留文字描述");
          return html;
        }

        // 3) 打开 pdf（优先用已打开的 Reader 的 pdf.js 文档）
        const doc = await this._openPdf(pdfPath);
        if (!doc) return html;

        // 4) 逐图定位页面并渲染该页为 PNG，按所属小节插到对应标题之后；无小节/无法定位则追加到末尾
        let outHtml = html;
        const inserted = [];
        for (const ref of refs) {
          let page = ref.page;
          if (page == null || page < 1) page = await this._locateFigurePage(doc, this._firstFigNum(ref.label));
          if (page == null || page < 1) continue;
          const dataUrl = await this._renderPageDataUrl(doc, page);
          if (!dataUrl) continue;
          inserted.push({ label: ref.label, section: ref.section, note: ref.note, block: this._figureBlock(dataUrl, ref.label, ref.note) });
        }
        if (!inserted.length) return html;
        // 按小节归类，插到对应小节标题之后；无小节/无法定位则追加到末尾
        const bySection = { "内容": [], "理论验证": [], "实验": [], "_other": [] };
        for (const it of inserted) {
          const key = (bySection[it.section] ? it.section : "_other");
          bySection[key].push(it.block);
        }
        let result = html;
        const secMap = [
          ["1、主要做了哪些事有什么成果", "内容"],
          ["2、理论验证", "理论验证"],
          ["3、实验设置及做的实验", "实验"],
          ["4、主要创新点解决的问题", "内容"],
        ];
        for (const [label, key] of secMap) {
          const blocks = bySection[key].splice(0);
          if (!blocks.length) continue;
          // 在该小节标题 </h2> 之后插入图块
          const marker = label + "</h2>";
          const idx = result.indexOf(marker);
          if (idx >= 0) {
            const insertAt = idx + marker.length;
            result = result.slice(0, insertAt) + "\n" + blocks.join("\n") + result.slice(insertAt);
          } else {
            result += "\n" + blocks.join("\n");
          }
        }
        const rest = bySection["_other"].concat(bySection["内容"], bySection["理论验证"], bySection["实验"]);
        if (rest.length) result += "\n" + rest.join("\n");
        return result;
      } catch (e) {
        log("embedFigures error (degraded): " + e);
        return html;
      }
    },

    /** 从文本里解析出「图N」类引用：返回 [{number, label, context}]，去重、按出现顺序。 */
    _figureRefs(text) {
      const seen = new Map();
      const re = /(?:图|Figure|Fig\.?)\s*(\d+)/gi;
      let m;
      while ((m = re.exec(text))) {
        const n = parseInt(m[1], 10);
        if (!seen.has(n)) {
          seen.set(n, { number: n, label: "图" + n });
        }
      }
      return Array.from(seen.values());
    },

    /**
     * 打开 PDF：优先用 Zotero 已打开的 Reader 的 pdf.js 文档，否则用 Zotero 内置 pdf.js 直接加载。
     * 返回一个类似 pdf.js PDFDocumentProxy 的接口（getPage/render）。失败返回 null。
     */
    async _openPdf(pdfPath) {
      try {
        const { pathToFileURL } = await import("resource://zotero/../modules/pdfjs/PdfStreamConverter.js");
        void pathToFileURL;
      } catch (_) {}
      // 方案 A：通过 Zotero.PDFWorker 拿 pdf.js 文档（若有 _getDocument）
      try {
        if (Zotero.PDFWorker && Zotero.PDFWorker._pdfjs && Zotero.PDFWorker._pdfjs.getDocument) {
          const loadingTask = Zotero.PDFWorker._pdfjs.getDocument({ url: pdfPath, disableFontFace: true });
          return await loadingTask.promise;
        }
      } catch (e) { log("embedFigures openPdf(A): " + e); }
      // 方案 B：已打开的 Reader
      try {
        const readers = Zotero.Reader && Zotero.Reader._readers;
        if (readers) {
          for (const r of Object.values(readers)) {
            if (r && r._pdfDoc && r._pdfDoc.getPage) return r._pdfDoc;
          }
        }
      } catch (e) { log("embedFigures openPdf(B): " + e); }
      return null;
    },

    /** 定位包含「图N」字样的页面（1 基页码）；找不到返回该图号与前一次页面猜测，失败 null。 */
    async _locateFigurePage(doc, figNum) {
      try {
        const total = doc.numPages || 0;
        for (let p = 1; p <= total; p++) {
          const page = await doc.getPage(p);
          const tc = await page.getTextContent();
          const txt = (tc.items || []).map((it) => it.str || "").join(" ");
          if (new RegExp("(图\\s*" + figNum + "|Figure\\s*" + figNum + "|Fig\\.?\\s*" + figNum + ")", "i").test(txt)) {
            return p;
          }
        }
      } catch (e) { log("locateFigurePage: " + e); }
      return null;
    },

    /**
     * 用 pdf.js 把第 pageNum 页渲染成 PNG dataURL。
     * 在 Zotero 特权(chrome)上下文里，可用 OffscreenCanvas + page.render 实现无 DOM 渲染，
     * 再 convertToBlob 转 dataURL。doc 须为真实 pdf.js PDFDocumentProxy（含 getPage，页有 render）。
     * 失败返回 null（调用方降级为文字描述）。
     */
    async _renderPageDataUrl(doc, pageNum) {
      try {
        const page = await doc.getPage(pageNum);
        if (!page || typeof page.render !== "function") return null;
        const scale = 1.5;
        const viewport = page.getViewport({ scale });
        const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await canvas.convertToBlob({ type: "image/png" });
        if (!blob) return null;
        const dataUrl = await new Promise((resolve) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = () => resolve(null);
          fr.readAsDataURL(blob);
        });
        return dataUrl;
      } catch (e) { log("renderPageDataUrl: " + e); return null; }
    },

    /** 生成插入笔记的图块：仅当拿到可用的图片 dataURL 才调用。 */
    _figureBlock(dataUrl, label, note) {
      const F = "font-family:黑体,'SimHei';";
      const cap = note ? (label + "：" + note) : ("插入 " + label + "，见原 PDF");
      return '<div style="' + F + 'margin:6px 0 12px;">' +
        '<img src="' + dataUrl + '" style="max-width:100%;height:auto;border:1px solid #ccc;"/>' +
        '<div style="font-size:14pt;color:#444;margin-top:2px;">' + this._esc(cap) + "</div></div>";
    },

    /** 从“第29-33页”/“29”/“29-33页”等文本里提取第一个数字页码；取不到返回 null。 */
    _parseFirstNum(text) {
      const s = String(text || "");
      const m = s.match(/(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    },

    /** 从“图3.1”/“式(2)”/“Figure 10”里提取第一个纯数字（即图号/式号数字前缀）；取不到返回 null。 */
    _firstFigNum(label) {
      const s = String(label || "");
      const m = s.match(/(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    },

    /** 把 Uint8Array 转 base64。 */
    _toBase64(u8) {
      let bin = "";
      for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
      return btoa(bin);
    },

    /** HTML 转义，避免笔记内容里的特殊字符破坏排版。 */
    _esc(s) {
      return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },

    /**
     * 把 LLM 输出的结构化 Markdown 转成 HTML，套用与单篇"研究核心"一致的排版：
     * # → 黑体一号；## → 黑体二号小标题；- 列表 → 黑体二号；正文 → 黑体二号；
     * GFM 表格（|…|…|）→ 黑体二号 HTML 表格（表头行加粗）。
     */
    _mdToStyledHtml(md, F) {
      const esc = (s) => this._esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
      const lines = String(md || "").split("\n");
      const out = [];
      let listOpen = false;
      const closeList = () => { if (listOpen) { out.push("</ul>"); listOpen = false; } };
      const isTableRow = (s) => /^\s*\|/.test(s) && s.includes("|");
      const isSepRow = (s) => /^\s*\|?[\s:|-]+\|?\s*$/.test(s) && /-/.test(s);
      const cells = (s) => s.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => esc(c.trim()));
      const tds = (cs, tag) => cs.map((c) => "<" + tag + ' style="' + F + 'font-size:22pt;border:1px solid #888;padding:4px 8px;text-align:left;vertical-align:top;">' + c + "</" + tag + ">").join("");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].replace(/\r$/, "");
        if (!line.trim()) { closeList(); continue; }
        const m = line.match(/^(#{1,3})\s+(.*)$/);
        if (m) {
          closeList();
          const level = m[1].length;
          if (level === 1) {
            out.push('<h1 style="' + F + 'font-size:26pt;margin:0 0 8px;">' + esc(m[2]) + "</h1>");
          } else {
            out.push('<h2 style="' + F + 'font-size:22pt;margin:0 0 4px;">' + esc(m[2]) + "</h2>");
          }
          continue;
        }
        // 表格：收集连续以 | 开头的行
        if (isTableRow(line)) {
          closeList();
          const rows = [];
          while (i < lines.length && isTableRow(lines[i].replace(/\r$/, ""))) {
            const r = lines[i].replace(/\r$/, "");
            if (!isSepRow(r)) rows.push(cells(r));
            i++;
          }
          i--;
          if (!rows.length) continue;
          let tbl = '<table style="' + F + 'border-collapse:collapse;margin:0 0 14px;">';
          // 第一行为表头
          const head = rows[0].map((c) => "<th>" + c + "</th>").join("");
          tbl += "<thead><tr>" + head + "</tr></thead><tbody>";
          for (let ri = 1; ri < rows.length; ri++) tbl += "<tr>" + tds(rows[ri], "td") + "</tr>";
          tbl += "</tbody></table>";
          out.push(tbl);
          continue;
        }
        const li = line.match(/^[-*]\s+(.*)$/) || line.match(/^\d+[.、]\s+(.*)$/);
        if (li) {
          if (!listOpen) { out.push('<ul style="' + F + 'font-size:22pt;margin:0 0 12px 20px;padding:0;list-style:disc;">'); listOpen = true; }
          out.push("<li>" + esc(li[1]) + "</li>");
          continue;
        }
        closeList();
        out.push('<p style="' + F + 'font-size:22pt;margin:0 0 12px;">' + esc(line) + "</p>");
      }
      closeList();
      return out.join("\n");
    },

    /**
     * 跨文献综合总笔记：把所有成功提取的文献要点【合在一起】生成一份综合笔记，
     * 含每篇的 内容/创新点/不足 汇总 + 各方法优缺点对比。
     * 作为【独立顶层笔记】创建（不设 parentID）→ 由用户自己在 Zotero 里
     * 决定放到哪里（拖进某个集合/某篇文献下等）。
     * 单篇成功时不创建。返回 true/false。
     */
    async _createSummaryNote(okResults, provider, apiKey) {
      try {
        if (okResults.length < 2) return false; // 单篇不总结
        const joined = okResults.map((r, i) => {
          const t = (r.item.getField && r.item.getField("title")) || "文献" + (i + 1);
          return `文献${i + 1}：《${t}》\n方法/内容：${(r.fields["内容"] || "").slice(0, 300)}\n理论验证：${(r.fields["理论验证"] || "").slice(0, 200)}\n实验：${(r.fields["实验"] || "").slice(0, 200)}\n创新点：${(r.fields["创新点"] || "").slice(0, 200)}\n不足：${(r.fields["不足"] || "").slice(0, 200)}`;
        }).join("\n\n");

        const system =
          "你是一位学术文献综合分析师。请把以下多篇文献的提取结果整合成一份【跨文献对比表格】，一律用简体中文。" +
          "不要逐篇详细展开写成条目，也不要写总体评价段。" +
          "只输出一个 Markdown 表格，列固定为：| 文献 | 侧重点 | 优点 | 缺点 |" +
          "其中“侧重点”指该方法的研究重点/切入角度/适用场景；每种文献一行，内容精炼、要点式，不要冗长。" +
          "第一行用分隔行（如 |---|）。不要输出表格以外的多余文字。" +
          "\n示例：\n| 文献 | 侧重点 | 优点 | 缺点 |\n|---|---|---|---|\n| 文献一《标题》 | … | … | … |";

        const raw = await this._callLLM(provider, apiKey, system,
          "以下是要整合的若干文献的提取结果：\n\n" + joined);
        const md = String(raw || "").trim();

        // 标题：取这些文献共同所在文件夹(集)名 + "跨文献总结"
        const folderName = this._collectionName(okResults);
        const summaryTitle = folderName + "跨文献总结";
        // 把 LLM 输出首行 # 标题替换为 <文件夹名>跨文献总结
        const body = md.replace(/^#\s+.*$/m, "# " + summaryTitle);
        // 统一排版：与单篇"研究核心"一致（h1 黑体一号，##/正文 黑体二号）
        const F = "font-family:黑体,'SimHei';";
        const html = this._mdToStyledHtml(body || "# " + summaryTitle, F);

        // 独立顶层笔记，不设 parentID —— 位置由用户自己决定
        const item = new Zotero.Item("note");
        item.libraryID = okResults[0].item.libraryID;
        item.setNote(html);
        await item.saveTx();
        log("created standalone cross-literature note, folder=" + folderName);
        return true;
      } catch (e) {
        log("_createSummaryNote error: " + e);
        return false;
      }
    },

    /**
     * 取若干文献共同所在的文件夹(collection)名；无共同集则用第一篇的集；都没有返回"未分类"。
     */
    _collectionName(okResults) {
      try {
        let shared = null; // Set<collectionID>
        for (const r of okResults) {
          const ids = (r.item.getCollections && r.item.getCollections()) || [];
          const idSet = new Set(ids);
          if (shared === null) shared = idSet;
          else if (shared.size && idSet.size) shared = new Set([...shared].filter((x) => idSet.has(x)));
          else shared = new Set();
        }
        let bestId = null;
        if (shared && shared.size) bestId = [...shared][0];
        if (bestId == null && okResults[0]) {
          const first = (okResults[0].item.getCollections && okResults[0].item.getCollections()) || [];
          bestId = first[0] || null;
        }
        if (bestId != null && Zotero.Collections && Zotero.Collections.get) {
          const col = Zotero.Collections.get(bestId);
          if (col && col.name) return String(col.name).trim();
        }
      } catch (e) {
        log("_collectionName error: " + e);
      }
      return "未分类";
    },

    // ----- Zotero 子笔记只在 _createNote/_createSummaryNote 里写入，不导出 txt -----

    // ////////////////////////////////////////////////////////////////////////
    // B 版保留：元数据/PDF 读取、txt 导出
    // ////////////////////////////////////////////////////////////////////////

    /** 把单条文献格式化成 txt 行（B 版导出用）。 */
    async _formatItemForTxt(item) {
      const creators = (item.getCreators() || [])
        .map((c) => (c.firstName ? `${c.lastName}, ${c.firstName}` : c.lastName))
        .join("; ");
      const title = item.getField("title") || "(无标题)";
      const year = item.getField("year") || "";
      const doi = item.getField("DOI") || "";
      const abstractNote = (item.getField("abstractNote") || "").replace(/\s+/g, " ");

      const out = [];
      out.push(`【${title}】`);
      out.push(`  作者: ${creators || "(未知)"}`);
      out.push(`  年份: ${year}`);
      out.push(`  DOI : ${doi || "(无)"}`);
      if (abstractNote) out.push(`  摘要: ${abstractNote}`);
      out.push("");

      const att = await this._getBestPdfAttachment(item);
      if (att) {
        out.push(`  PDF 附件: ${att.getField("title") || "有"}`);
        const pdfText = await this._extractPdfText(att);
        if (pdfText) {
          const clean = pdfText.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
          out.push(`  --- 全文提取 (${clean.length} 字符) ---`);
          out.push(clean.substring(0, 2000));
          if (clean.length > 2000) out.push("[全文过长，已截断前 2000 字符]");
        } else {
          out.push("  全文: 提取失败或无可提取文本");
        }
      } else {
        out.push("  PDF 附件: 无");
      }
      out.push("");
      return out;
    },

    /** 返回条目最佳 PDF 附件，否则 null。 */
    async _getBestPdfAttachment(item) {
      try {
        if (item.isRegularItem && item.getBestAttachment) {
          const att = item.getBestAttachment();
          if (att && (typeof att.isPDFAttachment === "function" ? att.isPDFAttachment() : true)) {
            return att;
          }
        }
      } catch (e) {
        log("_getBestPdfAttachment error: " + e);
      }
      return null;
    },

    /** 用 Zotero 内置 PDFWorker 提取 PDF 全文；失败返回 null。 */
    async _extractPdfText(attachment) {
      try {
        if (!Zotero.PDFWorker || !attachment.isPDFAttachment || !attachment.isPDFAttachment()) {
          return null;
        }
        const { text } = await Zotero.PDFWorker.getFullText(attachment.id, null);
        return typeof text === "string" ? text : null;
      } catch (e) {
        log("_extractPdfText error: " + e);
        return null;
      }
    },

    /** 保存 txt：用 Zotero 文件选择器（注意 Zotero 9 要 browsingContext）。 */
    async _saveTxt(content, defaultName = "文献笔记.txt") {
      try {
        const win = Zotero.getMainWindow();
        const fp = win.Cc["@mozilla.org/filepicker;1"]
          .createInstance(win.Ci.nsIFilePicker);
        fp.init(win.browsingContext, "保存文献笔记", win.Ci.nsIFilePicker.modeSave);
        fp.defaultString = defaultName;
        fp.appendFilter("文本文件 (*.txt)", "*.txt");
        const rv = await new Promise((resolve) => {
          fp.open(resolve);
        });
        if (rv !== win.Ci.nsIFilePicker.returnOK) return false;
        const { path } = fp.file || {};
        if (!path) return false;
        await IOUtils.writeUTF8(path, content, { tmpPath: path + ".tmp" });
        return true;
      } catch (e) {
        log("_saveTxt error: " + e);
        this._alert("保存 txt 失败: " + e);
        return false;
      }
    },

    /** 简单弹窗提示。 */
    _alert(msg) {
      const win = Zotero.getMainWindow();
      win.alert(msg);
    },

    /**
     * Zotero 9 官方 onMainWindowLoad 钩子入口。
     */
    _onMainWindowLoad(window) {
      try {
        registerItemMenu(window);
        log("menu injected via onMainWindowLoad");
      } catch (e) {
        log("_onMainWindowLoad error: " + e);
      }
    },
  };

  // 挂到 Zotero 命名空间
  Zotero.LitNotes = LitNotes;

  // //////////////////////////////////////////////////////////////////////////
  // 菜单注入（Zotero 7+/9：动态 DOM）
  // //////////////////////////////////////////////////////////////////////////

  /**
   * 向指定 Zotero 窗口的文献右键菜单（zotero-itemmenu）添加菜单项。幂等。
   */
  function registerItemMenu(window) {
    let doc;
    try {
      doc = window.document;
    } catch (e) {
      return;
    }
    const menuPopup = doc.getElementById("zotero-itemmenu");
    if (!menuPopup) return;
    if (doc.getElementById("litnotes-menu-sep")) return;

    const sep = doc.createXULElement("menuseparator");
    sep.id = "litnotes-menu-sep";

    const miExtract = doc.createXULElement("menuitem");
    miExtract.id = "litnotes-menu-extract";
    miExtract.setAttribute("label", "提取选中文献笔记 (AI)…");
    miExtract.addEventListener("command", () => {
      Zotero.LitNotes.onExtractCommand().catch((e) => {
        Zotero.debug("[LitNotes] onExtractCommand: " + e);
        try { Zotero.LitNotes._alert("提取出错: " + e); } catch (_) {}
      });
    });

    const miExport = doc.createXULElement("menuitem");
    miExport.id = "litnotes-menu-export";
    miExport.setAttribute("label", "导出选中文献为 txt…");
    miExport.addEventListener("command", () => {
      Zotero.LitNotes.onExportCommand().catch((e) => {
        Zotero.debug("[LitNotes] onExportCommand: " + e);
        try { Zotero.LitNotes._alert("导出出错: " + e); } catch (_) {}
      });
    });

    const miSettings = doc.createXULElement("menuitem");
    miSettings.id = "litnotes-menu-settings";
    miSettings.setAttribute("label", "插件设置 (AI)…");
    miSettings.addEventListener("command", () => {
      Zotero.LitNotes.onSettingsCommand().catch((e) => {
        Zotero.debug("[LitNotes] onSettingsCommand: " + e);
        try { Zotero.LitNotes._alert("设置出错: " + e); } catch (_) {}
      });
    });

    menuPopup.appendChild(sep);
    menuPopup.appendChild(miExtract);
    menuPopup.appendChild(miExport);
    menuPopup.appendChild(miSettings);
    log("item menu injected into zotero-itemmenu");
  }

  /** 为现存 + 未来主窗口挂菜单。 */
  function registerWindow(win) {
    let doc;
    try {
      doc = win.document;
      if (doc.readyState !== "complete" && doc.readyState !== "interactive") {
        win.addEventListener("load", () => registerItemMenu(win), { once: true });
        return;
      }
    } catch (e) {
      return;
    }
    registerItemMenu(win);
  }

  function installMenu() {
    try {
      const wm = Services.wm;
      const wins = wm.getEnumerator(null);
      while (wins.hasMoreElements()) {
        const win = wins.getNext();
        registerWindow(win);
      }
    } catch (e) {
      log("installMenu existing windows error: " + e);
    }
    try {
      const wm = Services.wm;
      const listener = {
        onOpenWindow(xulWin) {
          const domWin = xulWin.docShell && xulWin.docShell.domWindow;
          if (!domWin) return;
          domWin.addEventListener("load", () => {
            registerItemMenu(domWin);
          }, { once: true });
          try {
            if (domWin.document && domWin.document.readyState === "complete") {
              registerItemMenu(domWin);
            }
          } catch (e) {}
        },
        onCloseWindow() {},
        onWindowTitleChange() {},
      };
      wm.addListener(listener);
    } catch (e) {
      log("installMenu listener error: " + e);
    }
  }

  try {
    await Zotero.initializationPromise;
    installMenu();
    log("main.js loaded & menu installed");
  } catch (e) {
    log("init error: " + e);
  }
})();
