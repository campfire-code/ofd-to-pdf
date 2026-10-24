// 工具声明：OFD 转 PDF
import { FileOutput } from 'lucide-react';
import type { BatchTool } from '../kit/types';
import { parseOfd } from './ofd';
import { ofdToPdf } from './pdf';
import { Empty } from './Empty';
import { ResultBody } from './Result';

const tool: BatchTool = {
  id: 'o11',
  name: 'OFD 转 PDF',
  tagline: '把 OFD 版式文件（如电子发票、公文）转成 PDF，全部在本机处理。文字、线条、图形和 PNG / JPEG 图片可以转；电子签章不保留。',
  icon: FileOutput,
  category: '办公提效',
  type: 'data',
  mode: 'batch',
  resultView: 'list',
  concurrency: 1,
  Empty,
  ResultBody,
  accept: { label: 'OFD 文件', extensions: ['ofd'] },
  params: [{ key: 'out', label: '保存到', type: 'folder', default: '' }],

  async run(item, ctx) {
    const doc = await parseOfd(await ctx.readFile(item.path!));
    ctx.progress(0.4);
    const pdf = await ofdToPdf(doc);
    const path = await ctx.join(ctx.outputDir, item.name.replace(/\.ofd$/i, '') + '.pdf');
    await ctx.writeFile(path, pdf);
    const note = doc.warnings.length ? `；注意：${doc.warnings.join('；')}` : '';
    return { summary: `${doc.pages.length} 页${note}`, outputPath: path };
  },
};

export default tool;
