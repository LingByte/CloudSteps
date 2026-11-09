/** 生成可被 Excel / WPS 打开的 SpreadsheetML（.xls），无需第三方依赖 */
import i18n from "../i18n";
export function downloadExcelRows(
  filename: string,
  sheetName: string,
  rows: Array<Array<string | number>>,
  opts?: { equalColumns?: boolean }
) {
  const escapeXml = (v: string | number) =>
    String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const equalW = Math.round(220 / Math.max(1, colCount));
  const colDefs =
    opts?.equalColumns && colCount > 0
      ? Array.from({ length: colCount }, () => `<Column ss:AutoFitWidth="0" ss:Width="${equalW}"/>`).join("")
      : "";

  const body = rows
    .map(
      (row) =>
        `<Row ss:AutoFitHeight="0" ss:Height="22">${row
          .map((cell) => {
            const isNum = typeof cell === "number" && Number.isFinite(cell);
            return `<Cell><Data ss:Type="${isNum ? "Number" : "String"}">${escapeXml(cell)}</Data></Cell>`;
          })
          .join("")}</Row>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="${escapeXml(sheetName)}">
  <Table>${colDefs}${body}</Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob(["\ufeff", xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xls") || filename.endsWith(".xlsx") ? filename.replace(/\.xlsx$/i, ".xls") : `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** @deprecated 保留兼容；新导出请用 downloadPdfTable */
export function openPrintableTable(opts: {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  void downloadPdfTable({
    filename: `${opts.title}.pdf`,
    title: opts.title,
    headers: opts.headers,
    rows: opts.rows,
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const raw = String(text ?? "").replace(/\r/g, "");
  if (!raw) return [""];
  const paragraphs = raw.split("\n");
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (!para) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const ch of para) {
      const next = line + ch;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [""];
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function colAlign(header: string): CanvasTextAlign {
  const leftHeaders = new Set([
    i18n.t("export.col_chinese"),
    i18n.t("export.col_meaning"),
    i18n.t("training_records.header_note"),
    "Chinese",
    "Meaning",
    "Notes",
    "笔记",
  ]);
  if (leftHeaders.has(header)) return "left";
  return "center";
}

function canvasToJpegBytes(canvas: HTMLCanvasElement, quality = 0.92): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error(i18n.t("export.image_failed")));
          return;
        }
        const buf = await blob.arrayBuffer();
        resolve(new Uint8Array(buf));
      },
      "image/jpeg",
      quality
    );
  });
}

/** 用页面图片拼成可下载的 PDF（支持中文，无第三方依赖） */
function buildPdfFromJpegPages(
  pages: Array<{
    bytes: Uint8Array;
    width: number;
    height: number;
    pageWidth: number;
    pageHeight: number;
  }>
): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let pos = 0;

  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    pos += bytes.length;
  };

  push("%PDF-1.4\n");

  const objStarts: number[] = [];
  const beginObj = (n: number) => {
    objStarts[n] = pos;
    push(`${n} 0 obj\n`);
  };
  const endObj = () => push("\nendobj\n");

  beginObj(1);
  push("<< /Type /Catalog /Pages 2 0 R >>");
  endObj();

  const pageCount = pages.length;
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
  beginObj(2);
  push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);
  endObj();

  pages.forEach((page, i) => {
    const pageObj = 3 + i * 3;
    const contentObj = pageObj + 1;
    const imageObj = pageObj + 2;
    const w = page.width;
    const h = page.height;
    const pw = page.pageWidth;
    const ph = page.pageHeight;

    beginObj(pageObj);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Contents ${contentObj} 0 R /Resources << /XObject << /Im${i} ${imageObj} 0 R >> >> >>`
    );
    endObj();

    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im${i} Do Q`;
    beginObj(contentObj);
    push(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);
    endObj();

    beginObj(imageObj);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`
    );
    push(page.bytes);
    push("\nendstream");
    endObj();
  });

  const xrefPos = pos;
  const maxObj = 2 + pageCount * 3;
  push(`xref\n0 ${maxObj + 1}\n`);
  push("0000000000 65535 f \n");
  for (let i = 1; i <= maxObj; i++) {
    push(`${String(objStarts[i] ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return new Blob([out], { type: "application/pdf" });
}

/**
 * 将表格渲染为打印风格 PDF：居中标题、右上角 logo、细黑框表格。
 * 序号 / 英文 / 音标居中，中文左对齐。
 */
export type PdfAttachment = {
  title: string;
  text?: string;
  image?: HTMLImageElement | null;
};

export async function downloadPdfTable(opts: {
  filename: string;
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  logoUrl?: string;
  attachments?: PdfAttachment[];
}) {
  const { headers, rows } = opts;
  const filename = opts.filename.endsWith(".pdf") ? opts.filename : `${opts.filename}.pdf`;
  const heading = (opts.title || "").trim() || i18n.t("export.default_title");
  const logo = await loadImage(opts.logoUrl || "/logo.png");

  const pageW = 595;
  const pageH = 842;
  const scale = 2.5;
  const margin = 40;
  const usable = pageW - margin * 2;
  const padX = 8;

  const colWidths = (() => {
    const n = headers.length;
    const indexHeader = i18n.t("export.col_index");
    const phoneticHeader = i18n.t("export.col_phonetic");
    const hasIndex = headers[0] === indexHeader || headers[0] === "序号";
    if (hasIndex && n === 5) {
      const idx = 36;
      const rest = usable - idx;
      return [idx, rest * 0.2, rest * 0.2, rest * 0.24, rest * 0.36];
    }
    if (hasIndex && n === 4) {
      const idx = 36;
      const rest = usable - idx;
      return [idx, rest * 0.26, rest * 0.32, rest * 0.42];
    }
    if (hasIndex && n === 3) {
      const idx = 36;
      const rest = usable - idx;
      const mid = headers.includes(phoneticHeader) || headers.includes("音标") ? rest * 0.42 : rest * 0.38;
      return [idx, mid, rest - mid];
    }
    if (!hasIndex && n === 3) {
      return [usable * 0.24, usable * 0.32, usable * 0.44];
    }
    const w = usable / Math.max(1, n);
    return headers.map(() => w);
  })();

  const aligns = headers.map(colAlign);
  const lineH = 16;
  const rowPad = 12;
  const font = '13px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
  const titleFont = 'bold 16px "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';

  const measureCtx = document.createElement("canvas").getContext("2d")!;
  measureCtx.font = font;

  const rowLineSets = rows.map((row) =>
    headers.map((_, ci) => wrapText(measureCtx, String(row[ci] ?? ""), Math.max(12, colWidths[ci] - padX * 2)))
  );
  const rowHeights = rowLineSets.map((cells) =>
    Math.max(28, ...cells.map((ls) => ls.length * lineH + rowPad))
  );

  const pages: Array<{
    bytes: Uint8Array;
    width: number;
    height: number;
    pageWidth: number;
    pageHeight: number;
  }> = [];
  let rowIdx = 0;

  while (rowIdx < rows.length || pages.length === 0) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(pageW * scale);
    canvas.height = Math.round(pageH * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageW, pageH);

    const headerTop = margin;
    const titleY = headerTop + 16;
    const logoH = 28;
    const logoW = logo ? logoH * (logo.width / Math.max(1, logo.height)) : 0;
    if (logo) {
      ctx.drawImage(logo, pageW - margin - logoW, titleY - logoH / 2, logoW, logoH);
    }

    ctx.fillStyle = "#111111";
    ctx.font = titleFont;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(heading, pageW / 2, titleY, usable - logoW - 8);

    let y = headerTop + 40;
    const tableTop = y;
    const pageStart = rowIdx;
    ctx.font = font;
    ctx.fillStyle = "#111111";
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 0.7;

    while (rowIdx < rows.length) {
      const rh = rowHeights[rowIdx];
      if (y + rh > pageH - margin) break;
      y += rh;
      rowIdx += 1;
    }

    const tableBottom = y;
    const tableH = tableBottom - tableTop;
    ctx.strokeRect(margin, tableTop, usable, tableH);

    let vx = margin;
    for (let ci = 0; ci < headers.length - 1; ci++) {
      vx += colWidths[ci];
      ctx.beginPath();
      ctx.moveTo(vx, tableTop);
      ctx.lineTo(vx, tableBottom);
      ctx.stroke();
    }

    let hy = tableTop;
    for (let ri = pageStart; ri < rowIdx; ri++) {
      const rh = rowHeights[ri];
      const cells = rowLineSets[ri];
      let x = margin;
      cells.forEach((lines, ci) => {
        const w = colWidths[ci];
        const align = aligns[ci];
        const blockH = lines.length * lineH;
        const startY = hy + (rh - blockH) / 2 + lineH / 2;
        ctx.textAlign = align;
        ctx.textBaseline = "middle";
        const tx = align === "center" ? x + w / 2 : x + padX;
        lines.forEach((ln, li) => {
          ctx.fillText(ln, tx, startY + li * lineH);
        });
        x += w;
      });
      hy += rh;
      if (ri < rowIdx - 1) {
        ctx.beginPath();
        ctx.moveTo(margin, hy);
        ctx.lineTo(margin + usable, hy);
        ctx.stroke();
      }
    }

    const bytes = await canvasToJpegBytes(canvas, 0.95);
    pages.push({
      bytes,
      width: canvas.width,
      height: canvas.height,
      pageWidth: pageW,
      pageHeight: pageH,
    });

    if (rowIdx >= rows.length) break;
  }

  for (const attachment of opts.attachments || []) {
    if (!attachment.image && !attachment.text?.trim()) continue;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(pageW * scale);
    canvas.height = Math.round(pageH * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageW, pageH);
    ctx.fillStyle = "#111111";
    ctx.font = titleFont;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(attachment.title || heading, pageW / 2, margin + 16, usable);
    const top = margin + 40;
    const boxH = pageH - margin - top;
    if (attachment.image && attachment.image.width > 0 && attachment.image.height > 0) {
      const ratio = Math.min(usable / attachment.image.width, boxH / attachment.image.height);
      const dw = attachment.image.width * ratio;
      const dh = attachment.image.height * ratio;
      ctx.drawImage(attachment.image, margin + (usable - dw) / 2, top, dw, dh);
    } else if (attachment.text) {
      ctx.font = font;
      ctx.textAlign = "left";
      const lines = wrapText(ctx, attachment.text, usable);
      lines.forEach((line, index) => {
        const y = top + index * lineH;
        if (y < pageH - margin) ctx.fillText(line, margin, y);
      });
    }
    const bytes = await canvasToJpegBytes(canvas, 0.95);
    pages.push({
      bytes,
      width: canvas.width,
      height: canvas.height,
      pageWidth: pageW,
      pageHeight: pageH,
    });
  }

  const blob = buildPdfFromJpegPages(pages);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
