// 前后端桥接：
// - Tauri 桌面模式：window.__TAURI__.core.invoke（tauri.conf.json 开启了 withGlobalTauri）
// - 浏览器降级模式：自动切换为 demo.js（localStorage 持久化），方便预览/调试

import * as demo from './demo.js';

const tauri = typeof window !== 'undefined' && window.__TAURI__ ? window.__TAURI__ : null;

export const isTauri = !!tauri;

/** 调用后端命令（浏览器降级模式下由 demo 实现）。 */
export async function invoke(cmd, args = {}) {
  if (tauri) return tauri.core.invoke(cmd, args);
  return demo.invoke(cmd, args);
}
