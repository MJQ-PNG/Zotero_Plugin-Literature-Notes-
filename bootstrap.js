/**
 * bootstrap.js — Zotero 9 插件生命周期入口（bootstrapped 模式）
 *
 * Zotero 9 通过 plugins.js 把本文件 loadSubScriptWithOptions 加载到一个
 * Cu.Sandbox（隔离作用域），scope 里注入了 Zotero / Services / IOUtils /
 * ChromeUtils / PathUtils 等为全局。然后调用 scope.startup(params, reason)、
 * 以及主窗口加载完成后调用 scope.onMainWindowLoad({ window })。
 *
 * 重要：Zotero 9 的沙箱已注入全局 Services / IOUtils / Zotero，因此【不要】
 * 在顶层 ChromeUtils.import(...Services.jsm) —— 那会在顶层抛错导致整个
 * bootstrap 崩溃、startup 永不执行。直接使用全局即可。
 */

/* eslint-disable no-unused-vars */

const PLUGIN_ID = "zotero-literature-notes@mjq.local";
const PLUGIN_NAME = "litnotes";
const G = globalThis;

// 日志文件（用户 Zotero profile 目录）
var LOGFILE = "C:\\Users\\LENOVO\\AppData\\Roaming\\Zotero\\Zotero\\Profiles\\0mucoux6.default\\litnotes-debug.log";
// 内存缓冲：IOUtils 写是非阻塞异步的，多次写会竞争覆盖；累积到缓冲后
// 每次把完整缓冲整体写出，最后一次写获胜、包含全部日志行。
var _logBuf = "";

function _log(msg) {
  var line = new Date().toISOString() + " " + msg + "\n";
  _logBuf += line;
  try {
    IOUtils.writeUTF8(LOGFILE, _logBuf, { tmpPath: LOGFILE + ".tmp" });
  } catch (e) {
    try { Zotero.debug("[_log fail] " + e + " | " + line); } catch (__) {}
  }
}

// 顶层立即执行 —— 证明 bootstrap 文件被加载
_log("[B] bootstrap top-level loaded");

function install(data, reason) {
  _log("[B] install");
}

function uninstall(data, reason) {
  _log("[B] uninstall");
}

function startup({ id, version, resourceURI, rootURI }, reason) {
  _log("[B] startup CALLED, rootURI=" + rootURI);
  if (!rootURI) {
    rootURI = resourceURI.spec;
  }
  try {
    // 不带 target：main.js 在沙箱（当前 scope）执行，能访问注入的
    // Zotero / Services / IOUtils，并把 Zotero.LitNotes 挂到真实 Zotero 上。
    Services.scriptloader.loadSubScript(rootURI + "content/main.js");
    _log("[B] loadSubScript ok, LitNotes=" + (Zotero.LitNotes ? "object" : typeof Zotero.LitNotes));
  } catch (e) {
    _log("[B] loadSubScript ERROR: " + e + " | " + (e && e.stack));
    try { Zotero.logError("[" + PLUGIN_ID + "] loadSubScript error: " + e + "\n" + (e && e.stack)); } catch (_) {}
  }

  G[PLUGIN_NAME] = {
    id,
    version,
    rootURI,
    get root() {
      return rootURI;
    },
  };
  _log("[B] startup done");
}

/**
 * Zotero 9 官方生命周期钩子：zoteroPane 主窗口加载完成后调用，
 * 是注入右键菜单最可靠的时机（Zotero 保证窗口与 itemmenu 就绪）。
 *
 * 健壮化：首次安装后启动时，主窗口 load 可能早于 main.js 完成挂载
 * （Zotero.LitNotes 未就绪），导致钩子空跑、菜单丢失、需二次重启才正常。
 * 这里若 LitNotes 未就绪则轮询等待（最多约 10s）再注入，保证第一次就能挂上。
 */
function onMainWindowLoad({ window }, reason) {
  _log("[B] onMainWindowLoad CALLED, href=" + (window && window.location && window.location.href));
  function inject() {
    try {
      if (Zotero.LitNotes && typeof Zotero.LitNotes._onMainWindowLoad === "function") {
        Zotero.LitNotes._onMainWindowLoad(window);
        _log("[B] onMainWindowLoad -> injected");
        return true;
      }
    } catch (e) {
      _log("[B] onMainWindowLoad ERROR: " + e);
    }
    return false;
  }
  if (inject()) return;
  // 未就绪：轮询等待 LitNotes（首次启动时序补偿）
  var waited = 0;
  var timer = setInterval(function () {
    waited += 250;
    if (inject() || waited > 10000) {
      clearInterval(timer);
      if (waited > 10000) _log("[B] onMainWindowLoad gave up after 10s (LitNotes missing)");
    }
  }, 250);
}

function shutdown(data, reason) {
  _log("[B] shutdown reason=" + reason);
  if (G[PLUGIN_NAME] && typeof G[PLUGIN_NAME].shutdown === "function") {
    try {
      G[PLUGIN_NAME].shutdown();
    } catch (e) {
      Zotero.debug("[" + PLUGIN_ID + "] shutdown error: " + e);
    }
  }
  if (G[PLUGIN_NAME]) {
    delete G[PLUGIN_NAME];
  }
}
