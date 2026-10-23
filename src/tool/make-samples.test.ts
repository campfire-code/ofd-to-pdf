// 生成 samples/ 里的示例 OFD（只在设置了 MAKE_SAMPLES=1 时运行）。内容全部是虚构的示例。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { makeOfd } from './build';

it.runIf(process.env.MAKE_SAMPLES === '1')('生成示例文件', async () => {
  writeFileSync('samples/示例单页.ofd', await makeOfd());
  writeFileSync('samples/示例多页.ofd', await makeOfd({ pages: 3 }));
  writeFileSync('samples/示例含签章.ofd', await makeOfd({ withSeal: true }));
});
