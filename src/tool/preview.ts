// 截图与预览用的示例数据（不会进入正式运行）
import type { Row } from '../kit/runner';

const files: [string, number, Row['status'], string?][] = [
  ['示例单页.ofd', 21_000, 'ok', '1 页'],
  ['示例多页.ofd', 38_000, 'ok', '3 页'],
  ['示例含签章.ofd', 22_000, 'ok', '1 页；注意：含电子签章，PDF 中不含印章、不能验签'],
  ['示例公文.ofd', 154_000, 'run'],
  ['示例报表.ofd', 96_000, 'wait'],
  ['示例损坏.ofd', 1_200, 'err', '这不是有效的 OFD 文件（OFD 是一种压缩包），文件可能已损坏'],
];

export const rows = (state: string): Row[] =>
  state === 'empty' ? [] : files.map(([name, size, status, text], i) => {
    const st = state === 'done' && status !== 'err' ? 'ok' : status;
    return {
      item: { id: `p${i}`, name, path: `/示例/${name}`, size },
      status: st,
      progress: st === 'run' ? 0.5 : st === 'ok' ? 1 : 0,
      error: st === 'err' ? text : undefined,
      result: st === 'ok' ? { summary: text ?? '2 页', outputPath: `/示例/输出/${name.replace(/\.ofd$/, '.pdf')}` } : undefined,
    };
  });

export const params = {};
export const notice = { kind: 'err' as const, text: '完成 5 个，失败 1 个，失败原因见列表' };
