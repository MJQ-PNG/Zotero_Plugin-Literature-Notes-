// ===== LitNotes 诊断脚本 =====
// 在 Zotero: 工具 → 开发者 → Run JavaScript... 里执行，把输出贴回来
(async () => {
  const out = [];
  const log = (s) => out.push(s);

  // 1. main.js 是否加载成功（Zotero.LitNotes 是否存在）
  log("1) Zotero.LitNotes = " + (typeof Zotero.LitNotes));

  // 2. 主窗口 document 是否就绪
  let win;
  try {
    win = Zotero.getMainWindow();
    log("2) getMainWindow OK, readyState=" + win.document.readyState);
  } catch (e) {
    log("2) getMainWindow ERR: " + e);
  }

  // 3. itemmenu 里是否已有我们的菜单项
  if (win && win.document) {
    const doc = win.document;
    log("3) zotero-itemmenu exists = " + !!doc.getElementById("zotero-itemmenu"));
    log("3) litnotes-menu-sep = " + !!doc.getElementById("litnotes-menu-sep"));
    log("3) litnotes-menu-extract = " + !!doc.getElementById("litnotes-menu-extract"));
    // 列出 itemmenu 现有全部菜单项 label
    const popup = doc.getElementById("zotero-itemmenu");
    if (popup) {
      const labels = [];
      for (const c of popup.childNodes) {
        if (c && c.getAttribute) labels.push(c.getAttribute("label") || c.getAttribute("id") || c.tagName);
      }
      log("3) itemmenu children = " + JSON.stringify(labels));
    }
  }

  // 4. Services.wm 在该脚本作用域是否可用
  try {
    const n = Services.wm;
    log("4) Services.wm OK = " + !!n);
  } catch (e) {
    log("4) Services.wm ERR: " + e);
  }

  // 5. 手动尝试注入一次，看是否报错
  try {
    const doc = win.document;
    const popup = doc.getElementById("zotero-itemmenu");
    if (popup && !doc.getElementById("litnotes-menu-sep")) {
      const sep = doc.createXULElement ? doc.createXULElement("menuseparator") : doc.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "menuseparator");
      sep.id = "litnotes-menu-sep";
      const mi = doc.createXULElement ? doc.createXULElement("menuitem") : doc.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "menuitem");
      mi.id = "litnotes-menu-extract";
      mi.setAttribute("label", "提取选中文献笔记(测试)");
      mi.addEventListener("command", () => Zotero.debug("litnotes test clicked"));
      popup.appendChild(sep);
      popup.appendChild(mi);
      log("5) 手动注入成功，id=litnotes-menu-extract");
    } else {
      log("5) 未注入(可能已存在或 popup 为 null)");
    }
  } catch (e) {
    log("5) 手动注入 ERR: " + e);
  }

  alert(out.join("\n"));
  Zotero.debug("[LitNotes] DIAG:\n" + out.join("\n"));
})();
