// OFD（GB/T 33190-2016 电子文件版式格式）解析：把页面内容读成与格式无关的绘制列表。
// 支持：文字、路径（线、矩形、曲线、圆弧）、PNG / JPEG 图片、颜色、线宽、坐标变换（CTM）、模板页、图形参数（DrawParam）。
// 不支持（会计入 warnings）：电子签章与印章图像、注释、复合对象、渐变和底纹填充、裁剪区域、透明度、非 PNG / JPEG 图片、嵌入字体。
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export type Matrix = [number, number, number, number, number, number];
export type RGB = [number, number, number];
export type PathCmd = { op: 'M' | 'L'; p: [number, number] } | { op: 'B'; p: [number, number, number, number, number, number] } | { op: 'C' };

export type Item =
  | { kind: 'text'; m: Matrix; size: number; hscale: number; color: RGB; glyphs: { ch: string; x: number; y: number }[] }
  | { kind: 'path'; m: Matrix; cmds: PathCmd[]; stroke?: RGB; fill?: RGB; lineWidth: number; evenOdd: boolean }
  | { kind: 'image'; m: Matrix; data: Uint8Array; format: 'png' | 'jpg' };

export interface OfdPage { width: number; height: number; items: Item[] } // 单位：毫米
export interface OfdDoc { pages: OfdPage[]; warnings: string[] }

// ---------- 矩阵 ----------
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
/** 先应用 a，再应用 b */
export const mul = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];
export const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// ---------- XML ----------
type XNode = Record<string, unknown>;
const xml = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: false, parseTagValue: false, parseAttributeValue: false, removeNSPrefix: true });
const tagOf = (n: XNode) => Object.keys(n).find((k) => k !== ':@') ?? '';
const kids = (n: XNode): XNode[] => { const v = n[tagOf(n)]; return Array.isArray(v) ? (v as XNode[]) : []; };
const attr = (n: XNode, a: string): string | undefined => ((n[':@'] as Record<string, string> | undefined) ?? {})['@_' + a];
const textOf = (n: XNode) => kids(n).map((k) => (typeof k['#text'] === 'string' ? (k['#text'] as string) : '')).join('');
const child = (n: XNode, tag: string) => kids(n).find((k) => tagOf(k) === tag);
const children = (n: XNode, tag: string) => kids(n).filter((k) => tagOf(k) === tag);
const parse = (s: string) => xml.parse(s.replace(/^﻿/, '')) as XNode[];
const root = (nodes: XNode[]) => nodes.find((n) => tagOf(n) && !tagOf(n).startsWith('?')) as XNode;

const nums = (s: string | undefined): number[] => (s ?? '').trim().split(/\s+/).filter(Boolean).map(Number).filter((x) => Number.isFinite(x));

/** 「g 数量 值」是 OFD 对重复数字的缩写，例如 "g 3 5.0 4.2" 即 5.0 5.0 5.0 4.2 */
export function parseDeltas(s: string | undefined): number[] {
  const t = (s ?? '').trim().split(/\s+/).filter(Boolean);
  const out: number[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === 'g') {
      const n = Number(t[i + 1]), v = Number(t[i + 2]);
      if (Number.isFinite(n) && Number.isFinite(v)) for (let k = 0; k < n; k++) out.push(v);
      i += 2;
    } else if (Number.isFinite(Number(t[i]))) out.push(Number(t[i]));
  }
  return out;
}

export function parseColor(node: XNode | undefined, fallback: RGB | undefined): RGB | undefined {
  const v = node ? attr(node, 'Value') : undefined;
  if (!v) return fallback;
  const hex = v.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) return [parseInt(hex[1].slice(0, 2), 16), parseInt(hex[1].slice(2, 4), 16), parseInt(hex[1].slice(4), 16)];
  const n = nums(v);
  if (n.length === 1) return [n[0], n[0], n[0]];
  if (n.length === 3) return [n[0], n[1], n[2]];
  if (n.length === 4) { const k = 1 - (n[3] > 1 ? n[3] / 255 : n[3]); const c = (x: number) => Math.round(255 * (1 - (x > 1 ? x / 255 : x)) * k); return [c(n[0]), c(n[1]), c(n[2])]; }
  return fallback;
}

/** 缩写路径：S/M 起点，L 直线，Q 二次贝塞尔，B 三次贝塞尔，A 圆弧，C 闭合。统一成 M / L / B / C */
export function parsePath(d: string): PathCmd[] {
  const t = d.match(/[SMLQBAC]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const out: PathCmd[] = [];
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0;
  const num = () => Number(t[i++]);
  while (i < t.length) {
    const op = t[i++].toUpperCase();
    if (op === 'S' || op === 'M') { cx = sx = num(); cy = sy = num(); out.push({ op: 'M', p: [cx, cy] }); }
    else if (op === 'L') { cx = num(); cy = num(); out.push({ op: 'L', p: [cx, cy] }); }
    else if (op === 'Q') {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num();
      out.push({ op: 'B', p: [cx + (2 / 3) * (x1 - cx), cy + (2 / 3) * (y1 - cy), x2 + (2 / 3) * (x1 - x2), y2 + (2 / 3) * (y1 - y2), x2, y2] });
      cx = x2; cy = y2;
    } else if (op === 'B') {
      const p = [num(), num(), num(), num(), num(), num()] as [number, number, number, number, number, number];
      out.push({ op: 'B', p }); cx = p[4]; cy = p[5];
    } else if (op === 'A') {
      const rx = num(), ry = num(), rot = num(), large = num(), sweep = num(), x = num(), y = num();
      out.push(...arcToBeziers(cx, cy, rx, ry, rot, !!large, !!sweep, x, y));
      cx = x; cy = y;
    } else if (op === 'C') { out.push({ op: 'C' }); cx = sx; cy = sy; }
  }
  return out.filter((c) => c.op === 'C' || c.p.every(Number.isFinite));
}

/** SVG 风格圆弧（端点参数）转三次贝塞尔 */
function arcToBeziers(x1: number, y1: number, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): PathCmd[] {
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [{ op: 'L', p: [x2, y2] }];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = (rotDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dth > 0) dth -= 2 * Math.PI;
  if (sweep && dth < 0) dth += 2 * Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2)));
  const step = dth / segs, k = (4 / 3) * Math.tan(step / 4);
  const out: PathCmd[] = [];
  for (let s = 0; s < segs; s++) {
    const a1 = th1 + s * step, a2 = a1 + step;
    const pt = (a: number, dxk: number, dyk: number): [number, number] => {
      const ex = rx * (Math.cos(a) - dxk * Math.sin(a)), ey = ry * (Math.sin(a) + dyk * Math.cos(a));
      return [cp * ex - sp * ey + cx, sp * ex + cp * ey + cy];
    };
    const c1 = pt(a1, k, k), c2 = pt(a2, -k, -k), e = pt(a2, 0, 0);
    out.push({ op: 'B', p: [c1[0], c1[1], c2[0], c2[1], s === segs - 1 ? x2 : e[0], s === segs - 1 ? y2 : e[1]] });
  }
  return out;
}

// ---------- 包读取 ----------
const normPath = (p: string) => { const out: string[] = []; for (const s of p.split('/')) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); } return out.join('/'); };
const resolve = (baseDir: string, p: string) => normPath(p.startsWith('/') ? p : `${baseDir}/${p}`);

interface DrawParam { lineWidth?: number; fill?: RGB; stroke?: RGB; relative?: string }
interface Ctx {
  zip: JSZip;
  warnings: Set<string>;
  media: Map<string, { path: string; type: string }>;
  drawParams: Map<string, DrawParam>;
  imageCache: Map<string, Uint8Array>;
}

/** 按路径取压缩包里的文件；路径大小写不一致（实际文件里常见 Doc_0 与 DOC_0 混用）时忽略大小写再找一次 */
function zipFile(zip: JSZip, path: string): JSZip.JSZipObject | null {
  const exact = zip.file(path);
  if (exact) return exact;
  const lower = path.toLowerCase();
  return zip.file(new RegExp('.')).find((f) => f.name.toLowerCase() === lower) ?? null;
}

async function readFile(zip: JSZip, path: string, what: string) {
  const f = zipFile(zip, path);
  if (!f) throw new Error(`OFD 文件里缺少 ${what}（${path}），文件可能已损坏`);
  return f;
}

async function loadRes(ctx: Ctx, docDir: string, loc: string | undefined) {
  if (!loc) return;
  const path = resolve(docDir, loc);
  const f = zipFile(ctx.zip, path);
  if (!f) return;
  const r = root(parse(await f.async('string')));
  const resDir = resolve(path.split('/').slice(0, -1).join('/'), attr(r, 'BaseLoc') ?? '');
  for (const sec of kids(r)) {
    if (tagOf(sec) === 'MultiMedias') for (const m of children(sec, 'MultiMedia')) {
      const file = textOf(child(m, 'MediaFile') ?? {}).trim();
      if (attr(m, 'ID') && file) ctx.media.set(attr(m, 'ID')!, { path: resolve(resDir, file), type: (attr(m, 'Format') ?? attr(m, 'Type') ?? '').toLowerCase() });
    }
    if (tagOf(sec) === 'DrawParams') for (const d of children(sec, 'DrawParam')) {
      const id = attr(d, 'ID');
      if (!id) continue;
      ctx.drawParams.set(id, {
        lineWidth: attr(d, 'LineWidth') ? Number(attr(d, 'LineWidth')) : undefined,
        fill: parseColor(child(d, 'FillColor'), undefined), stroke: parseColor(child(d, 'StrokeColor'), undefined), relative: attr(d, 'Relative'),
      });
    }
  }
}

function drawParam(ctx: Ctx, id: string | undefined, depth = 0): DrawParam {
  const d = id ? ctx.drawParams.get(id) : undefined;
  if (!d) return {};
  const base = d.relative && depth < 5 ? drawParam(ctx, d.relative, depth + 1) : {};
  return { lineWidth: d.lineWidth ?? base.lineWidth, fill: d.fill ?? base.fill, stroke: d.stroke ?? base.stroke };
}

const sniff = (b: Uint8Array): 'png' | 'jpg' | null => (b[0] === 0x89 && b[1] === 0x50 ? 'png' : b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : null);

async function readObjects(ctx: Ctx, nodes: XNode[], base: Matrix, out: Item[]) {
  for (const n of nodes) {
    const tag = tagOf(n);
    if (tag === 'Layer' || tag === 'PageBlock') { await readObjects(ctx, kids(n), base, out); continue; }
    if (!['TextObject', 'PathObject', 'ImageObject', 'CompositeObject'].includes(tag)) continue;
    if (attr(n, 'Visible') === 'false') continue;
    if (tag === 'CompositeObject') { ctx.warnings.add('复合对象（Composite）未绘制'); continue; }
    const b = nums(attr(n, 'Boundary'));
    const ctmNums = nums(attr(n, 'CTM'));
    const ctm: Matrix | undefined = ctmNums.length === 6 ? (ctmNums as Matrix) : undefined;
    const origin: Matrix = [1, 0, 0, 1, b[0] ?? 0, b[1] ?? 0];
    const m = mul(ctm ?? IDENTITY, origin);
    const dp = drawParam(ctx, attr(n, 'DrawParam'));
    if (tag === 'TextObject') {
      const size = Number(attr(n, 'Size') ?? 0);
      if (!(size > 0)) continue;
      const color = parseColor(child(n, 'FillColor'), dp.fill) ?? [0, 0, 0];
      const glyphs: { ch: string; x: number; y: number }[] = [];
      for (const tc of children(n, 'TextCode')) {
        const text = textOf(tc);
        const dx = parseDeltas(attr(tc, 'DeltaX')), dy = parseDeltas(attr(tc, 'DeltaY'));
        let x = Number(attr(tc, 'X') ?? 0), y = Number(attr(tc, 'Y') ?? 0);
        const chars = [...text];
        chars.forEach((ch, i) => {
          glyphs.push({ ch, x, y });
          x += dx.length ? dx[Math.min(i, dx.length - 1)] : (ch.charCodeAt(0) < 256 ? size * 0.5 : size);
          y += dy.length ? dy[Math.min(i, dy.length - 1)] : 0;
        });
      }
      if (glyphs.length) out.push({ kind: 'text', m: mul(m, base), size, hscale: Number(attr(n, 'HScale') ?? 1) || 1, color, glyphs });
    } else if (tag === 'PathObject') {
      const data = textOf(child(n, 'AbbreviatedData') ?? {});
      const cmds = parsePath(data);
      if (!cmds.length) continue;
      const stroke = attr(n, 'Stroke') === 'false' ? undefined : parseColor(child(n, 'StrokeColor'), dp.stroke) ?? [0, 0, 0];
      const fill = attr(n, 'Fill') === 'true' ? parseColor(child(n, 'FillColor'), dp.fill) ?? [0, 0, 0] : undefined;
      out.push({ kind: 'path', m: mul(m, base), cmds, stroke, fill, lineWidth: Number(attr(n, 'LineWidth') ?? dp.lineWidth ?? 0.353), evenOdd: (attr(n, 'Rule') ?? '').toLowerCase().includes('even') });
    } else {
      const res = ctx.media.get(attr(n, 'ResourceID') ?? '');
      if (!res) { ctx.warnings.add('有图片找不到对应资源，已跳过'); continue; }
      let data = ctx.imageCache.get(res.path);
      if (!data) {
        const f = zipFile(ctx.zip, res.path);
        if (!f) { ctx.warnings.add('有图片文件缺失，已跳过'); continue; }
        data = await f.async('uint8array');
        ctx.imageCache.set(res.path, data);
      }
      const format = sniff(data);
      if (!format) { ctx.warnings.add(`有图片是 ${res.path.split('.').pop()?.toUpperCase() ?? '未知'} 格式（只支持 PNG、JPEG），已跳过`); continue; }
      const im: Matrix = ctm ?? [b[2] ?? 0, 0, 0, b[3] ?? 0, 0, 0]; // 没有 CTM 时，图片铺满边界框
      out.push({ kind: 'image', m: mul(mul(im, origin), base), data, format });
    }
  }
}

export async function parseOfd(bytes: Uint8Array): Promise<OfdDoc> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error('这不是有效的 OFD 文件（OFD 是一种压缩包），文件可能已损坏');
  }
  const ofdXml = zip.file('OFD.xml');
  if (!ofdXml) throw new Error('这不是有效的 OFD 文件：找不到 OFD.xml');
  const docBody = child(root(parse(await ofdXml.async('string'))), 'DocBody');
  const docRootLoc = docBody ? textOf(child(docBody, 'DocRoot') ?? {}).trim() : '';
  if (!docRootLoc) throw new Error('OFD.xml 里没有 DocRoot，文件可能已损坏');
  const docPath = normPath(docRootLoc);
  const docDir = docPath.split('/').slice(0, -1).join('/');
  const doc = root(parse(await (await readFile(zip, docPath, 'Document.xml')).async('string')));
  const common = child(doc, 'CommonData');
  const ctx: Ctx = { zip, warnings: new Set(), media: new Map(), drawParams: new Map(), imageCache: new Map() };
  if (common) {
    await loadRes(ctx, docDir, textOf(child(common, 'PublicRes') ?? {}).trim());
    await loadRes(ctx, docDir, textOf(child(common, 'DocumentRes') ?? {}).trim());
  }
  const box = (n: XNode | undefined) => { const a = child(n ?? {}, 'PageArea'); const p = a ? child(a, 'PhysicalBox') : undefined; const v = p ? nums(textOf(p)) : []; return v.length === 4 ? v : undefined; };
  const docBox = box(common) ?? [0, 0, 210, 297];
  const templates = new Map<string, string>();
  if (common) for (const t of children(common, 'TemplatePage')) if (attr(t, 'ID') && attr(t, 'BaseLoc')) templates.set(attr(t, 'ID')!, attr(t, 'BaseLoc')!);
  const pagesNode = child(doc, 'Pages');
  const pageRefs = pagesNode ? children(pagesNode, 'Page') : [];
  if (!pageRefs.length) throw new Error('这个 OFD 里没有页面');
  const pages: OfdPage[] = [];
  for (const ref of pageRefs) {
    const loc = attr(ref, 'BaseLoc');
    if (!loc) continue;
    const pagePath = resolve(docDir, loc);
    const content = root(parse(await (await readFile(zip, pagePath, '页面内容')).async('string')));
    const own = box(content);
    const pb = own ?? docBox;
    const items: Item[] = [];
    // 模板页（页眉、背景等）先画，页面内容盖在上面
    for (const t of children(content, 'Template')) {
      const tl = templates.get(attr(t, 'TemplateID') ?? '');
      if (!tl) continue;
      try {
        const tc = root(parse(await (await readFile(zip, resolve(docDir, tl), '模板页')).async('string')));
        await readObjects(ctx, children(tc, 'Content').flatMap((c) => kids(c)), IDENTITY, items);
      } catch { ctx.warnings.add('有模板页无法读取，已跳过'); }
    }
    await readObjects(ctx, children(content, 'Content').flatMap((c) => kids(c)), IDENTITY, items);
    pages.push({ width: pb[2], height: pb[3], items });
  }
  // 电子签章 / 印章 / 注释：这个版本不绘制
  if (zip.file(/(^|\/)Signs?\/|Signatures\.xml$/i).length) ctx.warnings.add('含电子签章，PDF 中不含印章、不能验签');
  if (zip.file(/(^|\/)Annots?\//i).length) ctx.warnings.add('文件含注释（Annotation），未绘制');
  return { pages, warnings: [...ctx.warnings] };
}
