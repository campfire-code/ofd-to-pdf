// 把 OFD 绘制列表写成 PDF（pdf-lib，MIT）。
// 文字用 PDF 标准中文字体 STSong-Light + UniGB-UCS2-H 编码，不嵌入字体文件，由阅读器用本机的宋体系字体显示。
// 因此：字形取决于阅读器所在电脑的字体，不会还原 OFD 里嵌入的字体；没有中文字体的环境里中文可能显示为方框。
import { PDFDocument, PDFHexString, PDFString, appendBezierCurve, beginText, closePath, concatTransformationMatrix, drawObject, endText, fill, fillAndStroke, PDFOperator, lineTo, moveTo, popGraphicsState, pushGraphicsState, setFillingRgbColor, setFontAndSize, setLineCap, setLineJoin, setLineWidth, setStrokingRgbColor, setTextMatrix, showText, stroke, type PDFRef } from 'pdf-lib';
import { apply, mul, type Matrix, type OfdDoc, type RGB } from './ofd';

const MM = 72 / 25.4; // 毫米转 PDF 点


const ucs2 = (s: string) => [...s].filter((ch) => ch.codePointAt(0)! <= 0xffff).map((ch) => ch.charCodeAt(0).toString(16).padStart(4, '0')).join('');
const rgb = (c: RGB) => [c[0] / 255, c[1] / 255, c[2] / 255] as const;
const n = (x: number) => Math.round(x * 1000) / 1000;

export async function ofdToPdf(doc: OfdDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const ctx = pdf.context;
  const fd = ctx.register(ctx.obj({ Type: 'FontDescriptor', FontName: 'STSong-Light', Flags: 6, FontBBox: [-25, -254, 1000, 880], ItalicAngle: 0, Ascent: 880, Descent: -120, CapHeight: 880, StemV: 93 }));
  const cid = ctx.register(ctx.obj({
    Type: 'Font', Subtype: 'CIDFontType0', BaseFont: 'STSong-Light', FontDescriptor: fd, DW: 1000, W: [1, 95, 500],
    CIDSystemInfo: ctx.obj({ Registry: PDFString.of('Adobe'), Ordering: PDFString.of('GB1'), Supplement: 2 }),
  }));
  const fontRef = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: 'STSong-Light', Encoding: 'UniGB-UCS2-H', DescendantFonts: [cid] }));
  const images = new Map<Uint8Array, PDFRef>();

  for (const p of doc.pages) {
    const H = p.height * MM;
    const page = pdf.addPage([p.width * MM, H]);
    const fontName = page.node.newFontDictionary('F1', fontRef);
    // 页面毫米坐标（Y 向下）转 PDF 点（Y 向上）
    const toPdf: Matrix = [MM, 0, 0, -MM, 0, H];
    let imgN = 0;
    for (const it of p.items) {
      if (it.kind === 'text') {
        const ops = [pushGraphicsState(), setFillingRgbColor(...rgb(it.color)), beginText(), setFontAndSize(fontName, 1)];
        const [a, b, c, d] = it.m;
        for (const g of it.glyphs) {
          if (!g.ch.trim()) continue;
          const [px, py] = apply(it.m, g.x, g.y);
          const s = it.size * MM;
          ops.push(setTextMatrix(n(a * s * it.hscale), n(-b * s * it.hscale), n(-c * s), n(d * s), n(px * MM), n(H - py * MM)), showText(PDFHexString.of(ucs2(g.ch))));
        }
        ops.push(endText(), popGraphicsState());
        page.pushOperators(...ops);
      } else if (it.kind === 'path') {
        const m = mul(it.m, toPdf);
        const pt = (x: number, y: number) => apply(m, x, y);
        const ops = [pushGraphicsState()];
        const scale = Math.sqrt(Math.abs(it.m[0] * it.m[3] - it.m[1] * it.m[2])) * MM;
        if (it.stroke) ops.push(setStrokingRgbColor(...rgb(it.stroke)), setLineWidth(n(Math.max(it.lineWidth * scale, 0.1))), setLineCap(0), setLineJoin(0));
        if (it.fill) ops.push(setFillingRgbColor(...rgb(it.fill)));
        for (const c of it.cmds) {
          if (c.op === 'M') ops.push(moveTo(...pt(c.p[0], c.p[1])));
          else if (c.op === 'L') ops.push(lineTo(...pt(c.p[0], c.p[1])));
          else if (c.op === 'B') ops.push(appendBezierCurve(...pt(c.p[0], c.p[1]), ...pt(c.p[2], c.p[3]), ...pt(c.p[4], c.p[5])));
          else ops.push(closePath());
        }
        if (it.fill && it.stroke) ops.push(it.evenOdd ? PDFOperator.of('B*' as never) : fillAndStroke());
        else if (it.fill) ops.push(it.evenOdd ? PDFOperator.of('f*' as never) : fill());
        else if (it.stroke) ops.push(stroke());
        else ops.push(closePath());
        ops.push(popGraphicsState());
        page.pushOperators(...ops);
      } else {
        let ref = images.get(it.data);
        if (!ref) {
          const img = it.format === 'png' ? await pdf.embedPng(it.data) : await pdf.embedJpg(it.data);
          ref = img.ref;
          images.set(it.data, ref);
        }
        const name = page.node.newXObject(`Im${imgN++}`, ref);
        // 图片左上角为原点、Y 向下；PDF 图片单位正方形左下角为原点
        const m = mul(mul([1, 0, 0, -1, 0, 1], it.m), toPdf);
        page.pushOperators(pushGraphicsState(), concatTransformationMatrix(n(m[0]), n(m[1]), n(m[2]), n(m[3]), n(m[4]), n(m[5])), drawObject(name), popGraphicsState());
      }
    }
  }
  return pdf.save();
}
