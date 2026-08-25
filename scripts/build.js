/**
 * build.js — 把插件源文件打包成 .xpi
 *
 * 用法：node scripts/build.js
 * 输出：build/zotero-literature-notes-<version>.xpi
 *
 * .xpi 本质是 zip 包，需包含：
 *   manifest.json, bootstrap.js, chrome.manifest,
 *   content/, icons/, prompts/
 *
 * 用 Python 内置 zipfile 打包，避免依赖系统 zip 命令（Windows 常见缺 zip）。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BUILD_DIR = path.join(ROOT, "build");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const XPI = path.join(BUILD_DIR, `zotero-literature-notes-${manifest.version}.xpi`);

// 需要打包进 .xpi 的文件（相对根目录，zip 内保持此相对路径）
const FILES = [
  "manifest.json",
  "bootstrap.js",
  "chrome.manifest",
  "content/main.js",
  "content/overlay.xhtml",
  "content/prefs.js",
  "prompts/extract_prompt.txt",
  "icons/icon.png",
];

const missing = FILES.filter((f) => !fs.existsSync(path.join(ROOT, f)));
if (missing.length) {
  console.error("缺少文件，无法打包:", missing.join(", "));
  process.exit(1);
}

if (!fs.existsSync(BUILD_DIR)) fs.mkdirSync(BUILD_DIR, { recursive: true });
if (fs.existsSync(XPI)) fs.rmSync(XPI);

// 生成一个临时 Python 脚本打包（规避 Windows 无 zip 命令）
const py = [
  "import zipfile, sys",
  `root = ${JSON.stringify(ROOT)}`,
  `xpi = ${JSON.stringify(XPI)}`,
  `files = ${JSON.stringify(FILES)}`,
  "with zipfile.ZipFile(xpi, 'w', zipfile.ZIP_DEFLATED) as z:",
  "    for f in files:",
  "        z.write(root + '/' + f, f)",
  "print('PACKED_OK', len(files))",
].join("\n");

const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
if (r.status !== 0 || !/PACKED_OK/.test(r.stdout || "")) {
  console.error("打包失败:", (r.stderr || r.stdout || "").trim());
  process.exit(1);
}

console.log(`✔ 打包完成: ${XPI}`);
