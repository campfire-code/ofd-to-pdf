// 空状态：画出「一份 OFD 发票 → 一份 PDF」，并写清哪些内容能转、哪些不转
import { Check, Upload, X } from 'lucide-react';
import './tool.css';

function Page({ x, kind }: { x: number; kind: 'ofd' | 'pdf' }) {
  const hot = kind === 'pdf';
  return (
    <g>
      <rect x={x} y="10" width="120" height="156" rx="6" className={hot ? 'of-page hot' : 'of-page'} />
      <rect x={x + 14} y="26" width="60" height="8" rx="4" className="of-ink" />
      <rect x={x + 14} y="46" width="92" height="4" rx="2" className="of-ln" />
      <rect x={x + 14} y="58" width="78" height="4" rx="2" className="of-ln" />
      <rect x={x + 14} y="76" width="92" height="30" rx="3" className="of-box" />
      <line x1={x + 14} x2={x + 106} y1="91" y2="91" className="of-rule" />
      <line x1={x + 60} x2={x + 60} y1="76" y2="106" className="of-rule" />
      <rect x={x + 14} y="118" width="36" height="22" rx="3" className="of-qr" />
      {kind === 'ofd'
        ? <circle cx={x + 86} cy="128" r="16" className="of-seal" />
        : <text x={x + 86} y="132" textAnchor="middle" className="of-sealno">无印章</text>}
      <rect x={x + 78} y="146" width="36" height="14" rx="3" className={hot ? 'of-badge hot' : 'of-badge'} />
      <text x={x + 96} y="157" textAnchor="middle" className={hot ? 'of-badget hot' : 'of-badget'}>{hot ? 'PDF' : 'OFD'}</text>
    </g>
  );
}

export function Empty({ hover }: { hover: boolean }) {
  return (
    <div className="of-empty">
      <svg viewBox="0 0 400 176" role="img" aria-label="一份 OFD 电子发票转成一份 PDF，文字、线条、图片保留，印章不保留">
        <Page x={10} kind="ofd" />
        <path d="M146 88 H238 M228 78 L240 88 L228 98" className="of-arrow" />
        <text x="193" y="72" textAnchor="middle" className="of-cap">本机转换</text>
        <Page x={270} kind="pdf" />
      </svg>
      <div className="of-can">
        <ul className="yes">
          <li><Check size={14} />文字，转出后可选中复制</li>
          <li><Check size={14} />线条、表格和图形</li>
          <li><Check size={14} />PNG、JPEG 图片，如二维码</li>
        </ul>
        <ul className="no">
          <li><X size={14} />电子签章和印章，不保留</li>
          <li><X size={14} />嵌入字体，改用宋体系字体</li>
        </ul>
      </div>
      <h2 className="of-title">{hover ? '松开鼠标，开始添加' : '把 OFD 文件拖进来'}</h2>
      <p className="of-act"><Upload size={15} />一个 OFD 对应一个同名 PDF，也可以拖入整个文件夹</p>
    </div>
  );
}
