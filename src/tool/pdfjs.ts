// pdf.js（Apache-2.0）的加载封装：用兼容旧系统的 legacy 版本。
// 中文 PDF 常用 Adobe 预定义字体编码，需要 CMap 文件才能正确显示和取字；
// 打包后这些文件随程序一起发布，从本地读取，不联网。
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

// 浏览器（桌面程序窗口）里：worker 与 CMap / 解码库都由 Vite 作为静态资源打包
if (isBrowser) pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const assets: Record<string, string> = isBrowser
  ? {
      ...prefix('cMapUrl', import.meta.glob('/node_modules/pdfjs-dist/cmaps/*.bcmap', { query: '?url', import: 'default', eager: true })),
      ...prefix('wasmUrl', import.meta.glob(['/node_modules/pdfjs-dist/wasm/openjpeg.wasm', '/node_modules/pdfjs-dist/wasm/jbig2.wasm', '/node_modules/pdfjs-dist/wasm/qcms_bg.wasm'], { query: '?url', import: 'default', eager: true })),
    }
  : {};

function prefix(kind: string, files: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(files).map(([p, url]) => [`${kind}:${p.split('/').pop()}`, String(url)]));
}

class LocalDataFactory {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const url = assets[`${kind}:${filename}`];
    if (!url) throw new Error(`缺少 ${filename}`);
    return new Uint8Array(await (await fetch(url)).arrayBuffer());
  }
}

/** 打开 PDF（只读），返回加载任务：用 task.promise 取文档，用完调用 task.destroy() 释放 */
export function openPdf(data: Uint8Array) {
  const copy = data.slice();
  if (isBrowser) return pdfjs.getDocument({ data: copy, useWorkerFetch: false, BinaryDataFactory: LocalDataFactory, cMapPacked: true });
  const base = `${process.cwd()}/node_modules/pdfjs-dist/`;
  return pdfjs.getDocument({ data: copy, cMapUrl: base + 'cmaps/', cMapPacked: true, wasmUrl: base + 'wasm/' });
}

export { pdfjs };
