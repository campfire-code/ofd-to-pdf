// 单个 OFD 的转换结果：页数用大字，配一叠 PDF 页面示意；没转出来的内容用橙色提醒逐条列出
import { Check, TriangleAlert } from 'lucide-react';
import type { InputItem, ItemResult } from '../kit/types';
import './tool.css';

/** 从说明「3 页；注意：含电子签章…；有图片…」里取出页数和提醒 */
export function parseSummary(summary: string | undefined): { pages: number; warnings: string[] } {
  const m = /^(\d+) 页(?:；注意：(.*))?$/.exec(summary ?? '');
  return { pages: m ? Number(m[1]) : 0, warnings: m?.[2] ? m[2].split('；').filter(Boolean) : [] };
}

export function ResultBody({ result }: { item: InputItem; result: ItemResult }) {
  const { pages, warnings } = parseSummary(result.summary);
  if (!pages) return <p className="of-sub">{result.summary}</p>;
  const out = result.outputPath?.split(/[\\/]/).pop();
  return (
    <div className="of-body">
      <div className="of-top">
        <div className="of-stack" aria-hidden="true">
          {Array.from({ length: Math.min(pages, 3) }, (_, i) => <i key={i} style={{ ['--i' as string]: Math.min(pages, 3) - 1 - i }} />)}
          <span>PDF</span>
        </div>
        <div className="of-big"><b className="k-num">{pages}</b><span>页 PDF</span></div>
      </div>
      {out && <p className="of-out k-ellipsis" title={out}>{out}</p>}
      {warnings.length ? (
        <ul className="of-warn">{warnings.map((w) => <li key={w}><TriangleAlert size={14} /><span>{w}</span></li>)}</ul>
      ) : (
        <p className="of-ok"><Check size={14} />没有发现没转出来的内容</p>
      )}
    </div>
  );
}
