import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import tool from './index';
import { makeOfd } from './build';
import type { InputItem, Params, RunContext } from '../kit/types';

function fakeCtx(files: Map<string, Uint8Array>, params: Params): RunContext {
  return {
    params, outputDir: '/out', signal: new AbortController().signal, progress: () => {},
    readFile: async (p) => files.get(p)!,
    readText: async (p) => new TextDecoder().decode(files.get(p)!),
    writeFile: async (p, d) => void files.set(p, d),
    writeText: async (p, t) => void files.set(p, new TextEncoder().encode(t)),
    mkdir: async () => {},
    join: async (...parts) => parts.join('/'),
    llm: async () => '', sidecar: async () => '',
  };
}
const item = (name: string): InputItem => ({ id: name, name, path: '/in/' + name });

describe('OFD 转 PDF 流程', () => {
  it('输出同名 .pdf，页数写进说明', async () => {
    const files = new Map([['/in/发票.OFD', await makeOfd({ pages: 2 })]]);
    const r = await tool.run(item('发票.OFD'), fakeCtx(files, {}));
    expect(r.outputPath).toBe('/out/发票.pdf');
    expect(r.summary).toBe('2 页');
    expect((await PDFDocument.load(files.get('/out/发票.pdf')!)).getPageCount()).toBe(2);
  });
  it('含签章或不支持的图片时，说明里写明哪些没转', async () => {
    const files = new Map([['/in/a.ofd', await makeOfd({ withSeal: true })]]);
    expect((await tool.run(item('a.ofd'), fakeCtx(files, {}))).summary).toContain('电子签章');
  });
  it('坏文件报错', async () => {
    const files = new Map([['/in/a.ofd', new TextEncoder().encode('x')]]);
    await expect(tool.run(item('a.ofd'), fakeCtx(files, {}))).rejects.toThrow('这不是有效的 OFD');
  });
  it('samples/ 里的示例文件都能转', async () => {
    for (const [n, pages] of [['示例单页.ofd', 1], ['示例多页.ofd', 3], ['示例含签章.ofd', 1]] as const) {
      const files = new Map([['/in/' + n, new Uint8Array(readFileSync('samples/' + n))]]);
      const r = await tool.run(item(n), fakeCtx(files, {}));
      expect(r.summary).toContain(`${pages} 页`);
    }
  });
});
