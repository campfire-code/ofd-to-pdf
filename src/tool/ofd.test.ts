import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { apply, mul, parseColor, parseDeltas, parseOfd, parsePath } from './ofd';
import { ofdToPdf } from './pdf';
import { makeOfd } from './build';
import { openPdf } from './pdfjs';

describe('基础解析函数', () => {
  it('DeltaX 的 g 缩写展开', () => {
    expect(parseDeltas('g 3 5 4.2')).toEqual([5, 5, 5, 4.2]);
    expect(parseDeltas('1 2 g 2 3')).toEqual([1, 2, 3, 3]);
    expect(parseDeltas(undefined)).toEqual([]);
  });
  it('颜色：RGB、灰度、十六进制、CMYK，缺省用回退色', () => {
    const c = (v: string) => parseColor({ FillColor: [], ':@': { '@_Value': v } } as never, undefined);
    expect(c('255 0 10')).toEqual([255, 0, 10]);
    expect(c('128')).toEqual([128, 128, 128]);
    expect(c('#00FF80')).toEqual([0, 255, 128]);
    expect(c('0 0 0 255')).toEqual([0, 0, 0]);
    expect(parseColor(undefined, [1, 2, 3])).toEqual([1, 2, 3]);
  });
  it('路径：S/M/L/C 与二次曲线转三次曲线', () => {
    expect(parsePath('M 0 0 L 10 0 L 10 5 C')).toEqual([{ op: 'M', p: [0, 0] }, { op: 'L', p: [10, 0] }, { op: 'L', p: [10, 5] }, { op: 'C' }]);
    const q = parsePath('S 0 0 Q 3 3 6 0');
    expect(q[1]).toMatchObject({ op: 'B' });
    expect((q[1] as { p: number[] }).p.slice(4)).toEqual([6, 0]);
  });
  it('圆弧转曲线，终点与指定终点一致', () => {
    const a = parsePath('M 0 0 A 5 5 0 0 1 10 0');
    const last = a[a.length - 1] as { op: string; p: number[] };
    expect(last.op).toBe('B');
    expect(last.p.slice(-2)).toEqual([10, 0]);
  });
  it('圆弧形状：四分之一圆的曲线中点落在圆上（圆心 0,5，半径 5）', () => {
    const [, b] = parsePath('M 0 0 A 5 5 0 0 1 5 5') as { p: number[] }[];
    const [c1x, c1y, c2x, c2y, ex, ey] = b.p;
    const mx = (0 + 3 * c1x + 3 * c2x + ex) / 8, my = (0 + 3 * c1y + 3 * c2y + ey) / 8; // t=0.5 时的三次贝塞尔点
    expect(Math.hypot(mx - 0, my - 5)).toBeCloseTo(5, 1);
    expect(mx).toBeGreaterThan(3); // 向外鼓出（右上方），不是向内凹
  });
  it('矩阵先后顺序', () => {
    expect(apply(mul([2, 0, 0, 2, 0, 0], [1, 0, 0, 1, 5, 5]), 1, 1)).toEqual([7, 7]);
  });
});

describe('解析 OFD', () => {
  it('读出页面尺寸、模板页、文字、路径、图片', async () => {
    const doc = await parseOfd(await makeOfd());
    expect(doc.pages).toHaveLength(1);
    const p = doc.pages[0];
    expect([p.width, p.height]).toEqual([210, 297]);
    const texts = p.items.filter((i) => i.kind === 'text');
    expect(texts[0].kind === 'text' && texts[0].glyphs.map((g) => g.ch).join('')).toBe('示例页眉文字'); // 模板页先画
    expect(p.items.filter((i) => i.kind === 'path')).toHaveLength(3);
    expect(p.items.filter((i) => i.kind === 'image')).toHaveLength(1);
    expect(doc.warnings).toEqual([]);
  });
  it('DrawParam 提供线宽和颜色', async () => {
    const doc = await parseOfd(await makeOfd());
    const grid = doc.pages[0].items.find((i) => i.kind === 'path' && i.stroke && !i.fill);
    expect(grid).toMatchObject({ stroke: [128, 128, 128] });
  });
  it('字距：g 缩写与最后一个值延续', async () => {
    const doc = await parseOfd(await makeOfd());
    const t = doc.pages[0].items.filter((i) => i.kind === 'text')[1];
    if (t.kind !== 'text') throw new Error();
    expect(t.glyphs.slice(0, 3).map((g) => g.x)).toEqual([0, 7, 14]);
    expect(apply(t.m, t.glyphs[0].x, t.glyphs[0].y)).toEqual([20, 30 + 8 + 0]); // 边界框原点 (20,30) + 基线 Y=8
  });
  it('不支持的内容给出提示：签章、非 PNG/JPEG 图片', async () => {
    const doc = await parseOfd(await makeOfd({ withSeal: true, bmpImage: true }));
    expect(doc.warnings.join('|')).toContain('电子签章');
    expect(doc.warnings.join('|')).toContain('BMP');
  });
  it('不是 OFD 时给出能看懂的错误', async () => {
    await expect(parseOfd(new TextEncoder().encode('hello'))).rejects.toThrow('这不是有效的 OFD');
    const z = new JSZip(); z.file('a.txt', 'x');
    await expect(parseOfd(await z.generateAsync({ type: 'uint8array' }))).rejects.toThrow('找不到 OFD.xml');
  });
  it('压缩包里路径大小写与引用不一致时仍能找到图片', async () => {
    const z = await JSZip.loadAsync(await makeOfd());
    z.file('DOC_0/Res/Image_0.png', await z.file('Doc_0/Res/Image_0.png')!.async('uint8array'));
    z.remove('Doc_0/Res/Image_0.png');
    const doc = await parseOfd(await z.generateAsync({ type: 'uint8array' }));
    expect(doc.pages[0].items.filter((i) => i.kind === 'image')).toHaveLength(1);
    expect(doc.warnings).toEqual([]);
  });
  it('缺少页面文件时说明缺什么', async () => {
    const z = await JSZip.loadAsync(await makeOfd());
    z.remove('Doc_0/Pages/Page_0/Content.xml');
    await expect(parseOfd(await z.generateAsync({ type: 'uint8array' }))).rejects.toThrow('缺少 页面内容');
  });
});

describe('转成 PDF', () => {
  it('页数、页面尺寸（A4）、图片都对', async () => {
    const pdf = await ofdToPdf(await parseOfd(await makeOfd({ pages: 3 })));
    const d = await PDFDocument.load(pdf);
    expect(d.getPageCount()).toBe(3);
    const { width, height } = d.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(841.89, 1);
    expect(new TextDecoder('latin1').decode(pdf)).toMatch(/\/Subtype \/Image/);
  });
  it('奇偶填充规则写成 f* / B* 操作符', async () => {
    const path = (stroke?: [number, number, number]) => ({ kind: 'path' as const, m: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number], cmds: parsePath('M 0 0 L 10 0 L 10 10 C'), fill: [0, 0, 0] as [number, number, number], stroke, lineWidth: 0.3, evenOdd: true });
    const pdf = await ofdToPdf({ pages: [{ width: 50, height: 50, items: [path(), path([1, 2, 3])] }], warnings: [] });
    const d = await PDFDocument.load(pdf);
    const streams = d.context.enumerateIndirectObjects().map(([, o]) => o).filter((o) => o instanceof PDFRawStream) as PDFRawStream[];
    const src = streams.map((s) => new TextDecoder('latin1').decode(decodePDFRawStream(s).decode())).join('\n');
    expect(src).toMatch(/\nf\*\n/);
    expect(src).toMatch(/\nB\*\n/);
  });
  it('文字能被 PDF 阅读器提取（用 pdf.js 读回）', async () => {
    const pdf = await ofdToPdf(await parseOfd(await makeOfd()));
    const task = openPdf(pdf);
    const page = await (await task.promise).getPage(1);
    const text = (await page.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join('');
    await task.destroy();
    for (const s of ['示例页眉文字', '示例电子发票', '金额合计', '1,234.50', '示例']) expect(text).toContain(s);
  });
  it('文字位置：毫米坐标换算成点，Y 方向翻转', async () => {
    const pdf = await ofdToPdf(await parseOfd(await makeOfd()));
    const task = openPdf(pdf);
    const page = await (await task.promise).getPage(1);
    const items = (await page.getTextContent()).items.filter((i) => 'str' in i && i.str.includes('示例电子发票')) as { transform: number[] }[];
    await task.destroy();
    // 边界框 (20,30)、基线偏移 Y=8 -> 页面 (20mm, 38mm)；PDF 左下角为原点
    expect(items[0].transform[4]).toBeCloseTo(20 * 72 / 25.4, 0);
    expect(items[0].transform[5]).toBeCloseTo(841.89 - 38 * 72 / 25.4, 0);
  });
});
