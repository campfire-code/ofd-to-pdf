// 测试与示例用：按 GB/T 33190 的目录结构生成一个虚构的 OFD 文件（版式依据标准的常见写法，未用真实 OFD 对照）。
import JSZip from 'jszip';
import { crc32, deflateSync } from 'node:zlib';

/** 生成纯色 PNG（RGB 8 位） */
export function makePng(w: number, h: number, rgb: [number, number, number]): Uint8Array {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

/** 把中文内容包一层，保持生成的文件内容不变 */
const Z = (s: string) => s;
const NS = 'xmlns:ofd="http://www.ofdspec.org/2016"';
const H = '<?xml version="1.0" encoding="UTF-8"?>\n';

export interface MakeOfdOptions { pages?: number; withSeal?: boolean; bmpImage?: boolean; noPrefix?: boolean }

/** 一份「示例发票」样式的单页（可多页）OFD：模板页（页眉）、中英文文字、表格线、实心矩形、圆角路径、图片 */
export async function makeOfd(o: MakeOfdOptions = {}): Promise<Uint8Array> {
  const z = new JSZip();
  const pages = o.pages ?? 1;
  z.file('OFD.xml', `${H}<ofd:OFD ${NS} Version="1.0" DocType="OFD"><ofd:DocBody><ofd:DocInfo><ofd:DocID>demo</ofd:DocID></ofd:DocInfo><ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot></ofd:DocBody></ofd:OFD>`);
  z.file('Doc_0/Document.xml', `${H}<ofd:Document ${NS}><ofd:CommonData><ofd:MaxUnitID>100</ofd:MaxUnitID><ofd:PageArea><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:PageArea><ofd:PublicRes>PublicRes.xml</ofd:PublicRes><ofd:TemplatePage ID="2" BaseLoc="Tpls/Tpl_0/Content.xml"/></ofd:CommonData><ofd:Pages>${Array.from({ length: pages }, (_, i) => `<ofd:Page ID="${10 + i}" BaseLoc="Pages/Page_${i}/Content.xml"/>`).join('')}</ofd:Pages></ofd:Document>`);
  z.file('Doc_0/PublicRes.xml', `${H}<ofd:Res ${NS} BaseLoc="Res"><ofd:Fonts><ofd:Font ID="3" FontName="${Z('宋体')}"/></ofd:Fonts><ofd:MultiMedias><ofd:MultiMedia ID="4" Type="Image"><ofd:MediaFile>Image_0.png</ofd:MediaFile></ofd:MultiMedia>${o.bmpImage ? '<ofd:MultiMedia ID="5" Type="Image"><ofd:MediaFile>Image_1.bmp</ofd:MediaFile></ofd:MultiMedia>' : ''}</ofd:MultiMedias><ofd:DrawParams><ofd:DrawParam ID="6" LineWidth="0.5"><ofd:StrokeColor Value="128 128 128"/></ofd:DrawParam></ofd:DrawParams></ofd:Res>`);
  z.file('Doc_0/Res/Image_0.png', makePng(4, 2, [220, 40, 40]));
  if (o.bmpImage) z.file('Doc_0/Res/Image_1.bmp', Buffer.from('BM0000'));
  z.file('Doc_0/Tpls/Tpl_0/Content.xml', `${H}<ofd:Page ${NS}><ofd:Content><ofd:Layer ID="20"><ofd:TextObject ID="21" Boundary="20 10 100 8" Font="3" Size="4"><ofd:FillColor Value="128 128 128"/><ofd:TextCode X="0" Y="5" DeltaX="g 5 4">${Z('示例页眉文字')}</ofd:TextCode></ofd:TextObject></ofd:Layer></ofd:Content></ofd:Page>`);
  for (let i = 0; i < pages; i++) {
    z.file(`Doc_0/Pages/Page_${i}/Content.xml`, `${H}<ofd:Page ${NS}><ofd:Template TemplateID="2" ZOrder="Background"/><ofd:Content><ofd:Layer ID="30">
<ofd:TextObject ID="31" Boundary="20 30 120 12" Font="3" Size="7"><ofd:FillColor Value="0 0 0"/><ofd:TextCode X="0" Y="8" DeltaX="g 6 7">${Z('示例电子发票')}</ofd:TextCode></ofd:TextObject>
<ofd:TextObject ID="32" Boundary="20 50 120 8" Font="3" Size="3.5"><ofd:TextCode X="0" Y="5" DeltaX="g 6 3.5 g 4 1.9 3.5">${Z('金额合计')} No.1024 ${Z('第')}${i + 1}${Z('页')}</ofd:TextCode></ofd:TextObject>
<ofd:PathObject ID="33" Boundary="20 65 170 30" LineWidth="0.4" Stroke="true" Fill="false" DrawParam="6"><ofd:AbbreviatedData>M 0 0 L 170 0 L 170 30 L 0 30 C M 0 15 L 170 15 M 85 0 L 85 30</ofd:AbbreviatedData></ofd:PathObject>
<ofd:PathObject ID="34" Boundary="20 100 40 10" Stroke="false" Fill="true"><ofd:FillColor Value="30 90 200"/><ofd:AbbreviatedData>M 0 0 L 40 0 L 40 10 L 0 10 C</ofd:AbbreviatedData></ofd:PathObject>
<ofd:PathObject ID="35" Boundary="70 100 40 10" LineWidth="0.5" Stroke="true" Fill="true"><ofd:StrokeColor Value="0 120 0"/><ofd:FillColor Value="200 240 200"/><ofd:AbbreviatedData>M 5 0 L 35 0 A 5 5 0 0 1 40 5 L 40 5 A 5 5 0 0 1 35 10 L 5 10 A 5 5 0 0 1 0 5 A 5 5 0 0 1 5 0 C</ofd:AbbreviatedData></ofd:PathObject>
<ofd:ImageObject ID="36" Boundary="120 100 30 15" ResourceID="4" CTM="30 0 0 15 0 0"/>
${o.bmpImage ? '<ofd:ImageObject ID="37" Boundary="160 100 20 10" ResourceID="5"/>' : ''}
<ofd:TextObject ID="38" Boundary="20 120 120 8" Font="3" Size="3.5"><ofd:TextCode X="0" Y="5">Amount: 1,234.50 CNY（${Z('示例）')}</ofd:TextCode></ofd:TextObject>
</ofd:Layer></ofd:Content></ofd:Page>`);
  }
  if (o.withSeal) z.file('Doc_0/Signs/Sign_0/Signature.xml', `${H}<ofd:Signature ${NS}/>`);
  return z.generateAsync({ type: 'uint8array' });
}
