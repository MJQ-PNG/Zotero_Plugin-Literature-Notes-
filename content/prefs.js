/**
 * prefs.js — 偏好设置骨架（A 版 AI 提取时使用）
 *
 * 这里定义插件默认偏好并注册到 Zotero.Prefs。
 * 阶段 3 接 AI 时会用到：API provider、模型、API key、提示词路径等。
 *
 * Zotero 7 推荐用 Zotero.Prefs.register 来管理插件偏好，
 * key 会自动带插件 ID 前缀，避免与其它插件冲突。
 */
"use strict";

(() => {
  // 注册插件默认偏好
  // 注意：不要在这里放明文 API key —— key 应走 Zotero 的 secure prefs
  // 或由用户在偏好设置面板里填，骨架阶段先给出占位。
  Zotero.Prefs.register({
    // A 版：AI provider 选择（"deepseek" | "glm" | "gemini" | ""）
    "ai.provider": "",
    // LLM 模型名
    "ai.model": "",
    // 四步提取提示词模板路径（相对插件根）
    "ai.promptFile": "prompts/extract_prompt.txt",
    // 是否开启详细日志
    "debug": true,
  });
})();
