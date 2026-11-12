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
  const gap = 22,
    colWidth = (usable - gap) / 2;
  function clueColumns(font) {
    doc.setFont("Noto", "normal");
    doc.setFontSize(font);
    const indent =
      doc.getTextWidth(`${Math.max(1, ...placed.map((p) => p.number))}.`) + 6;
    return ["across", "down"].map((dir) => {
      const result = [];
      let cy = font + 9;
      for (const p of placed
        .filter((p) => p.dir === dir)
        .sort((a, b) => a.number - b.number)) {
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
      return { result, height: cy };
    });
  }
  let chosen;
  for (let font = 12; font >= 9; font -= 0.5) {
    const columns = clueColumns(font),
      clueHeight = Math.max(...columns.map((c) => c.height));
    const available = height - margin - y - clueHeight - 39;
    const cell = layout.width
      ? Math.min(
          27,
          usable / layout.width,
          available / Math.max(1, layout.height),
        )
      : 0;
    if (!chosen || cell > chosen.cell) chosen = { font, columns, cell };
    if (cell >= 19) break;
  }
  let { font, columns, cell } = chosen;
  cell = Math.max(0, cell);
  const fits =
    !placed.length ||
    (cell >= 13 &&
      height - margin - y - Math.max(...columns.map((c) => c.height)) - 39 >=
        layout.height * cell - 0.01);
  if (placed.length && fits) {
    const gx = (width - layout.width * cell) / 2,
      gy = y + 3;
    for (const c of cellsFor(placed).values()) {
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
    ["Across", "Down"].forEach((heading, i) => {
      const x = margin + i * (colWidth + gap);
      text(heading, x, y, font + 2, "left", true);
      for (const c of columns[i].result)
        cmds.push({
          ...c,
          x: c.x + x,
          y: c.y + y,
          ...(c.kind === "line" ? { x2: c.x2 + x, y2: c.y2 + y } : {}),
        });
    });
  }
  return { width, height, cmds, fits, font, cell };
}
export function pageSVG(page) {
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Printable crossword worksheet" viewBox="0 0 ${page.width} ${page.height}" width="${page.width}" height="${page.height}"><rect width="100%" height="100%" fill="white"/>${page.cmds.map((c) => (c.kind === "text" ? `<text x="${c.x}" y="${c.y}" font-family="Worksheet, sans-serif" font-size="${c.size}" font-weight="${c.bold ? 700 : 400}" fill="black" text-anchor="${c.align === "center" ? "middle" : c.align === "right" ? "end" : "start"}">${escape(c.value)}</text>` : c.kind === "rect" ? `<rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" fill="white" stroke="black" stroke-width=".7"/>` : `<line x1="${c.x}" y1="${c.y}" x2="${c.x2}" y2="${c.y2}" stroke="black" stroke-width="${c.weight}"/>`)).join("")}</svg>`;
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
    } else {
      doc.setLineWidth(c.weight);
      doc.line(c.x, c.y, c.x2, c.y2);
    }
  }
  doc.save(
    `${puzzle.name.replace(/[^a-z0-9_-]/gi, "-") || "crossword"}${answerKey ? "-key" : ""}.pdf`,
  );
}
