# 第三方开源组件

本工具使用了以下开源组件，许可证原文见各项目仓库。

| 组件 | 用途 | 许可证 |
|---|---|---|
| [Tauri](https://github.com/tauri-apps/tauri) 及官方插件 | 桌面应用框架 | MIT / Apache-2.0 |
| [React](https://github.com/facebook/react) | 界面 | MIT |
| [Lucide](https://github.com/lucide-icons/lucide) | 图标 | ISC |
| [Vite](https://github.com/vitejs/vite) | 构建 | MIT |
| [pdf-lib](https://github.com/Hopding/pdf-lib) | 生成 PDF | MIT |
| [JSZip](https://github.com/Stuk/jszip) | 解压 OFD（按 MIT 条款使用，该库为 MIT 与 GPL-3.0 双许可） | MIT OR GPL-3.0-or-later |
| [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) | 解析 OFD 里的 XML | MIT |

OFD 的解析和绘制逻辑为自行编写，依据国家标准 GB/T 33190-2016《电子文件存储与交换格式 版式文档》的结构；未复制任何开源 OFD 库的代码。

仅开发和测试使用：[pdf.js](https://github.com/mozilla/pdf.js)（pdfjs-dist，Apache-2.0，测试里读回 PDF 文字）、vitest、TypeScript。
