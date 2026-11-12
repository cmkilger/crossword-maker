import { jsPDF } from "jspdf";
import { cellsFor } from "./generator.js";
export const sizes = {
  letter: [612, 792],
  legal: [612, 1008],
  a4: [595.28, 841.89],
  a5: [419.53, 595.28],
};
const fontData = {};
export async function loadFont() {
  await Promise.all(
    ["Regular", "Bold"].map(async (weight) => {
      const response = await fetch(
        `${import.meta.env.BASE_URL}fonts/NotoSans-${weight}.ttf`,
      );
      if (!response.ok) throw new Error("Could not load the worksheet font.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      fontData[weight] = btoa(binary);
    }),
  );
}

function documentFor(size) {
  const doc = new jsPDF({
    unit: "pt",
    format: sizes[size],
    orientation: "portrait",
  });
  doc.addFileToVFS("Noto.ttf", fontData.Regular);
  doc.addFileToVFS("Noto-Bold.ttf", fontData.Bold);
  doc.addFont("Noto-Bold.ttf", "Noto", "bold");
  doc.addFont("Noto.ttf", "Noto", "normal");
  doc.setFont("Noto");
  return doc;
}
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
export function makePage(puzzle, answerKey = false) {
  const size = puzzle.options.size,
    [width, height] = sizes[size],
    margin = 32,
    usable = width - 2 * margin,
    doc = documentFor(size),
    cmds = [];
  const text = (value, x, y, size = 11, align = "left", bold = false) =>
    cmds.push({ kind: "text", value, x, y, size, align, bold });
  const line = (x, y, x2, y2, weight = 0.7) =>
    cmds.push({ kind: "line", x, y, x2, y2, weight });
  let y = margin + 11;
  const fields = [
    puzzle.options.classPeriod ? "Period" : null,
    puzzle.options.date ? "Date" : null,
    puzzle.options.name ? "Name" : null,
  ].filter(Boolean);
  if (fields.length) {
    const fw = (usable - 16 * (fields.length - 1)) / fields.length;
    fields.forEach((label, i) => {
      const x = margin + i * (fw + 16);
      text(label, x, y);
      doc.setFontSize(11);
      line(x + doc.getTextWidth(label) + 6, y + 1, x + fw, y + 1);
    });
    y += 29;
  }
  if (puzzle.options.title && puzzle.title.trim()) {
    doc.setFontSize(19);
    const lines = doc.splitTextToSize(puzzle.title.trim(), usable);
    for (const l of lines) {
      text(l, width / 2, y + 8, 19, "center");
      y += 24;
    }
    y += 8;
  }
  if (answerKey) {
    text("ANSWER KEY", width / 2, y + 4, 10, "center");
    y += 23;
  }
  const layout = puzzle.layout || { placed: [], width: 0, height: 0 };
  const placed = layout.placed.map((p) => ({
    ...p,
    clue: puzzle.entries.find((e) => e.id === p.id)?.clue || p.clue,
  }));
  function clueColumns(font, requestedCount) {
    doc.setFont("Noto", "normal");
    doc.setFontSize(font);
    const indent =
      doc.getTextWidth(`${Math.max(1, ...placed.map((p) => p.number))}.`) + 6;
    const count = Math.min(requestedCount, Math.max(1, placed.length)),
      gap = count === 2 ? 22 : 12,
      colWidth = (usable - gap * (count - 1)) / count,
      words = {
        across: placed
          .filter((p) => p.dir === "across")
          .sort((a, b) => a.number - b.number),
        down: placed
          .filter((p) => p.dir === "down")
          .sort((a, b) => a.number - b.number),
      },
      allocation = {
        across: words.across.length ? 1 : 0,
        down: words.down.length ? 1 : 0,
      };
    while (allocation.across + allocation.down < count) {
      const dir =
        words.across.length / (allocation.across || Infinity) >=
        words.down.length / (allocation.down || Infinity)
          ? "across"
          : "down";
      allocation[dir]++;
    }
    const columns = [];
    for (const dir of ["across", "down"]) {
      const parts = allocation[dir];
      for (let part = 0; part < parts; part++) {
        const start = Math.floor((part * words[dir].length) / parts),
          end = Math.floor(((part + 1) * words[dir].length) / parts),
          result = [];
        let cy = font + 9;
        for (const p of words[dir].slice(start, end)) {
          const lines = doc.splitTextToSize(p.clue, colWidth - indent);
          result.push({
            kind: "text",
            value: `${p.number}.`,
            x: indent - 6,
            y: cy,
            size: font,
            align: "right",
          });
          lines.forEach((l, i) =>
            result.push({
              kind: "text",
              value: l,
              x: indent,
              y: cy + i * font * 1.35,
              size: font,
            }),
          );
          cy += Math.max(1, lines.length) * font * 1.35;
          if (puzzle.options.answerLines) {
            cy += 12;
            result.push({
              kind: "line",
              x: indent,
              y: cy - 1,
              x2: colWidth,
              y2: cy - 1,
              weight: 0.6,
            });
            cy += font * 0.8;
          }
          cy += font * 0.4;
        }
        columns.push({
          heading:
            part === 0 ? (dir === "across" ? "Across" : "Down") : "",
          result,
          height: cy,
        });
      }
    }
    return { columns, gap, colWidth };
  }
  let chosen;
  for (let font = 12; font >= 9; font -= 0.5) {
    const options = [];
    for (let count = 2; count <= 4; count++) {
      const clueLayout = clueColumns(font, count),
        clueHeight = Math.max(...clueLayout.columns.map((c) => c.height)),
        available = height - margin - y - clueHeight - 39,
        cell = layout.width
          ? Math.min(
              27,
              usable / layout.width,
              available / Math.max(1, layout.height),
            )
          : 0;
      options.push({ font, ...clueLayout, cell });
    }
    const twoColumns = options[0],
      bestForFont =
        twoColumns.cell >= 19
          ? twoColumns
          : options.find((option) => option.cell >= 19) ||
            options.reduce((best, option) =>
              option.cell > best.cell ? option : best,
            );
    if (!chosen || bestForFont.cell > chosen.cell)
      chosen = bestForFont;
    if (bestForFont.cell >= 19) break;
  }
  let { font, columns, gap, colWidth, cell } = chosen;
  cell = Math.max(0, cell);
  const fits =
    !placed.length ||
    (cell >= 13 &&
      height - margin - y - Math.max(...columns.map((c) => c.height)) - 39 >=
        layout.height * cell - 0.01);
  if (placed.length) {
    const bodyStart = cmds.length,
      bodyTop = y;
    if (!fits) cell = Math.min(27, usable / layout.width, Math.max(13, cell));
    const gx = (width - layout.width * cell) / 2,
      gy = y + 3;
    const cells = cellsFor(placed),
      gridArea = layout.width * layout.height,
      emptyCells = gridArea - cells.size,
      useBlackBlocks = gridArea > 0 && emptyCells / gridArea <= 0.2;
    if (useBlackBlocks)
      for (let row = 0; row < layout.height; row++)
        for (let col = 0; col < layout.width; col++)
          if (!cells.has(`${col},${row}`))
            cmds.push({
              kind: "block",
              x: gx + col * cell,
              y: gy + row * cell,
              width: cell,
              height: cell,
            });
    for (const c of cells.values()) {
      const x = gx + c.x * cell,
        cy = gy + c.y * cell;
      cmds.push({ kind: "rect", x, y: cy, width: cell, height: cell });
      const starts = placed.filter((p) => p.x === c.x && p.y === c.y);
      if (starts.length)
        text(
          String(starts[0].number),
          x + 1.5,
          cy + Math.min(9, Math.max(6.5, cell * 0.32)) + 1.5,
          Math.min(9, Math.max(6.5, cell * 0.32)),
        );
      if (answerKey)
        text(c.letter, x + cell / 2, cy + cell * 0.77, cell * 0.57, "center");
    }
    y = gy + layout.height * cell + 28;
    columns.forEach((column, i) => {
      const x = margin + i * (colWidth + gap);
      if (column.heading) text(column.heading, x, y, font + 2, "left", true);
      for (const c of column.result)
        cmds.push({
          ...c,
          x: c.x + x,
          y: c.y + y,
          ...(c.kind === "line" ? { x2: c.x2 + x, y2: c.y2 + y } : {}),
        });
    });
    if (!fits) {
      const bodyHeight =
        3 +
        layout.height * cell +
        28 +
        Math.max(...columns.map((c) => c.height));
      const scale = Math.min(
        1,
        Math.max(1, height - margin - bodyTop) / bodyHeight,
      );
      for (let i = bodyStart; i < cmds.length; i++) {
        const c = cmds[i];
        c.x = width / 2 + (c.x - width / 2) * scale;
        c.y = bodyTop + (c.y - bodyTop) * scale;
        if (c.kind === "text") c.size *= scale;
        else if (c.kind === "rect" || c.kind === "block") {
          c.width *= scale;
          c.height *= scale;
        } else {
          c.x2 = width / 2 + (c.x2 - width / 2) * scale;
          c.y2 = bodyTop + (c.y2 - bodyTop) * scale;
          c.weight *= scale;
        }
      }
    }
  }
  return { width, height, cmds, fits, font, cell };
}
export function pageSVG(page) {
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Printable crossword worksheet" viewBox="0 0 ${page.width} ${page.height}" width="${page.width}" height="${page.height}"><rect width="100%" height="100%" fill="white"/>${page.cmds.map((c) => (c.kind === "text" ? `<text x="${c.x}" y="${c.y}" font-family="Worksheet, sans-serif" font-size="${c.size}" font-weight="${c.bold ? 700 : 400}" fill="black" text-anchor="${c.align === "center" ? "middle" : c.align === "right" ? "end" : "start"}">${escape(c.value)}</text>` : c.kind === "rect" ? `<rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" fill="white" stroke="black" stroke-width=".7"/>` : c.kind === "block" ? `<rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" fill="black"/>` : `<line x1="${c.x}" y1="${c.y}" x2="${c.x2}" y2="${c.y2}" stroke="black" stroke-width="${c.weight}"/>`)).join("")}</svg>`;
}
export function exportPDF(puzzle, answerKey = false) {
  const doc = documentFor(puzzle.options.size);
  const page = makePage(puzzle, answerKey);
  if (!page.fits)
    throw new Error(
      "This puzzle is too large for one readable page. Shorten it or choose larger paper.",
    );
  for (const c of page.cmds) {
    if (c.kind === "text") {
      doc.setFont("Noto", c.bold ? "bold" : "normal");
      doc.setFontSize(c.size);
      doc.text(c.value, c.x, c.y, { align: c.align || "left" });
    } else if (c.kind === "rect") {
      doc.setLineWidth(0.7);
      doc.rect(c.x, c.y, c.width, c.height);
    } else if (c.kind === "block") {
      doc.setFillColor(0);
      doc.rect(c.x, c.y, c.width, c.height, "F");
    } else {
      doc.setLineWidth(c.weight);
      doc.line(c.x, c.y, c.x2, c.y2);
    }
  }
  doc.save(
    `${puzzle.name.replace(/[^a-z0-9_-]/gi, "-") || "crossword"}${answerKey ? "-key" : ""}.pdf`,
  );
}
