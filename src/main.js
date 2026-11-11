import "./style.css";
import {
  defaults,
  openDB,
  readState,
  writeState,
  newPuzzle,
  parseBulk,
  validateBackup,
} from "./storage.js";
import {
  validateEntries,
  disconnectedGroups,
  canPlace,
  cellsFor,
  numberLayout,
} from "./generator.js";
import { loadFont, makePage, pageSVG, exportPDF } from "./page.js";
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let state = {
    puzzles: [],
    defaults: { ...defaults },
    theme: "auto",
    active: null,
  },
  worker,
  timer,
  saving = Promise.resolve(),
  generating = false,
  previewKey = false,
  storageOK = true;
const current = () => state.puzzles.find((p) => p.id === state.active);
const blankEntry = () => ({ id: crypto.randomUUID(), answer: "", clue: "" });
function notice(message) {
  $("#notice").textContent = message;
  $("#notice").hidden = !message;
}
function save() {
  const snapshot = structuredClone(state);
  $("#save-status").textContent = "Saving…";
  saving = saving
    .catch(() => {})
    .then(() => writeState(snapshot))
    .then(() => {
      $("#save-status").textContent = "Saved in this browser";
      storageOK = true;
    })
    .catch(() => {
      storageOK = false;
      $("#save-status").textContent = "Not saved";
      notice(
        "Browser storage is unavailable or full. Export a backup to keep your work.",
      );
    });
}
function appearance() {
  document.documentElement.dataset.theme = state.theme;
  $("#theme").value = state.theme;
}
function shell() {
  $("#app").innerHTML = `
<header class="app-header"><a class="brand" href="./" aria-label="Crossword Maker home"><span class="brand-mark" aria-hidden="true">✛</span><span>Crossword <strong>Maker</strong></span></a><div class="header-right"><span class="local-label">Made here. Stays here.</span><label class="theme-label"><span class="sr-only">Appearance</span><select id="theme"><option value="auto">◐ Auto</option><option value="light">☀ Light</option><option value="dark">☾ Dark</option></select></label></div></header>
<div id="notice" class="notice" role="alert" hidden></div>
<main class="workspace"><aside class="editor"><div class="library-heading"><div><span class="eyebrow">YOUR WORKSPACE</span><h1>A little wordplay.</h1></div><button id="new" class="icon-button" aria-label="New puzzle" title="New puzzle">＋</button></div><label class="field-label" for="puzzles">Saved puzzles</label><select id="puzzles"></select><div class="library-actions"><button id="duplicate" class="text-button">Duplicate</button><button id="export" class="text-button">Back up all</button><button id="import" class="text-button">Import</button><button id="delete" class="text-button danger">Delete</button></div><input type="file" id="import-file" accept=".json,application/json" hidden>
<div class="divider"></div><div class="section-heading"><span class="step">01</span><h2>Make it yours</h2></div><label class="field-label" for="puzzle-name">Puzzle name <span>Only for your library</span></label><input id="puzzle-name" maxlength="200" placeholder="e.g. Chapter 4 vocabulary"><div class="option-grid"><label><input type="checkbox" data-option="title"> Title</label><label><input type="checkbox" data-option="name"> Name</label><label><input type="checkbox" data-option="classPeriod"> Class period</label><label><input type="checkbox" data-option="date"> Date</label></div><div id="title-field"><label class="field-label" for="title">Worksheet title</label><input id="title" maxlength="500" placeholder="Give your worksheet a title"></div><label class="check-row"><input type="checkbox" data-option="answerLines"> Answer line after each clue</label>
<div class="divider"></div><div class="section-heading"><span class="step">02</span><h2>Add your words</h2><button id="bulk" class="text-button">Bulk paste ↗</button></div><p class="helper">Answers use A–Z. We’ll find the intersections.</p><div id="entries"></div><button id="add" class="add-button">＋ Add a word</button><button id="example" class="text-button example">Try a vocabulary example</button><div class="editor-footer"><span id="save-status" role="status">Saved in this browser</span><p>Stored on this device. Back up to move browsers.</p></div></aside>
<section class="preview-panel" aria-label="Worksheet preview"><div class="preview-toolbar"><div class="preview-title"><span class="eyebrow">THE FINISHED PAGE</span><h2>Print a little possibility.</h2></div><label class="paper-select"><span class="sr-only">Paper size</span><select id="paper"><option value="letter">Letter · 8.5 × 11 in</option><option value="legal">Legal · 8.5 × 14 in</option><option value="a4">A4 · 210 × 297 mm</option><option value="a5">A5 · 148 × 210 mm</option></select></label></div><div class="preview-controls"><div class="segmented" aria-label="Preview type"><button id="worksheet" aria-pressed="true">Worksheet</button><button id="answer-key" aria-pressed="false">Answer key</button></div><button id="regenerate" class="text-button">⟳ Regenerate layout</button></div><div class="generation-line"><span class="status-dot"></span><span id="generation-status" role="status" aria-live="polite"></span></div><div id="issues" class="issues" hidden></div><div class="paper-stage"><div id="paper-preview" class="paper"></div><div id="empty-preview"><span class="empty-cross" aria-hidden="true">✛</span><h3>Good puzzles start<br>with a few good words.</h3><p>Add your answers and clues.<br>Your worksheet will come together here.</p></div></div><div class="output-bar"><label><span class="sr-only">Pages to export</span><select id="output-mode"><option value="worksheet">Worksheet only</option><option value="key">Answer key only</option><option value="both">Worksheet + answer key</option></select></label><div><button id="print" class="secondary">Print</button><button id="pdf" class="primary">Download PDF <span aria-hidden="true">↓</span></button></div></div><p class="preview-note">One page. Ready for the classroom. <span id="page-detail"></span></p></section></main>
<dialog id="bulk-dialog"><form method="dialog"><div class="dialog-heading"><h2>A quicker way to add words</h2><button class="icon-button" value="cancel" aria-label="Close">×</button></div><p>Copy two columns from a spreadsheet: <strong>answer</strong>, then <strong>clue</strong>. One pair per row, without a header. These will be added to your existing words.</p><label class="field-label" for="bulk-input">Answers and clues</label><textarea id="bulk-input" rows="10" placeholder="PLANET&#9;A world orbiting a star"></textarea><p id="bulk-error" class="error" role="alert"></p><button id="bulk-add" type="button" class="primary">Add words</button></form></dialog>
<dialog id="delete-dialog"><form method="dialog"><h2>Delete this puzzle?</h2><p id="delete-message"></p><div class="dialog-actions"><button value="cancel" class="secondary">Keep puzzle</button><button value="delete" class="destructive">Delete puzzle</button></div></form></dialog><div id="print-pages"></div>`;
}
function library() {
  const p = current();
  $("#puzzles").innerHTML = state.puzzles
    .map(
      (p) =>
        `<option value="${esc(p.id)}">${esc(p.name || "Untitled puzzle")}</option>`,
    )
    .join("");
  $("#puzzles").value = p.id;
}
function renderPuzzle() {
  const p = current();
  library();
  $("#puzzle-name").value = p.name;
  $("#title").value = p.title;
  document
    .querySelectorAll("[data-option]")
    .forEach((el) => (el.checked = p.options[el.dataset.option]));
  $("#title-field").hidden = !p.options.title;
  $("#paper").value = p.options.size;
  renderEntries();
  renderPreview();
}
function renderEntries() {
  const p = current(),
    checked = validateEntries(p.entries.filter((e) => e.answer || e.clue));
  $("#entries").innerHTML = p.entries
    .map((e, i) => {
      const error = checked.find((v) => v.id === e.id)?.error;
      return `<div class="entry" data-id="${esc(e.id)}"><div class="entry-index">${String(i + 1).padStart(2, "0")}</div><div class="entry-fields"><label class="sr-only" for="answer-${esc(e.id)}">Answer ${i + 1}</label><input id="answer-${esc(e.id)}" data-entry="answer" value="${esc(e.answer)}" maxlength="60" placeholder="ANSWER" autocomplete="off" spellcheck="false" aria-describedby="error-${esc(e.id)}"><label class="sr-only" for="clue-${esc(e.id)}">Clue ${i + 1}</label><textarea id="clue-${esc(e.id)}" data-entry="clue" rows="2" maxlength="2000" placeholder="Write a clue…">${esc(e.clue)}</textarea><p class="entry-error" id="error-${esc(e.id)}">${esc(error || "")}</p></div><button class="remove-entry" aria-label="Remove word ${i + 1}" data-remove="${esc(e.id)}">×</button></div>`;
    })
    .join("");
}
function valid() {
  return validateEntries(current().entries.filter((e) => e.answer || e.clue));
}
function renderPreview() {
  const p = current(),
    layout = p.layout,
    entries = valid(),
    invalid = entries.filter((e) => e.error),
    unplaced = layout?.unplaced || [],
    hasWords = !!layout?.placed.length;
  const page = makePage(p, previewKey);
  $("#paper-preview").innerHTML = pageSVG(page);
  $("#paper-preview").style.aspectRatio = `${page.width}/${page.height}`;
  $("#empty-preview").hidden = hasWords;
  $("#paper-preview").style.opacity = "1";
  $("#generation-status").textContent = generating
    ? "Finding a great fit…"
    : hasWords
      ? `${layout.placed.length} of ${entries.length} words placed · ${layout.width} × ${layout.height} grid`
      : "Your page is ready for words";
  $(".status-dot").classList.toggle("working", generating);
  const messages = [];
  if (invalid.length)
    messages.push(
      `${invalid.length} ${invalid.length === 1 ? "entry needs" : "entries need"} attention. Use A–Z answers and add every clue.`,
    );
  if (!generating && unplaced.length)
    messages.push(
      `Not placed in this layout: ${unplaced.map((id) => entries.find((e) => e.id === id)?.answer || "word").join(", ")}. Try regenerating or changing these answers.`,
    );
  const groups = disconnectedGroups(entries.filter((e) => !e.error));
  if (groups.length > 1)
    messages.push(
      "Some answers form separate groups with no shared letters. Change or add an answer to connect them.",
    );
  if (!page.fits)
    messages.push(
      "This puzzle cannot fit readably on one page. Use larger paper or shorten the puzzle or clues.",
    );
  $("#issues").hidden = !messages.length;
  $("#issues").textContent = messages.join(" ");
  const mode = $("#output-mode").value;
  const outputFits =
    (mode === "worksheet" || mode === "both"
      ? makePage(p, false).fits
      : true) &&
    (mode === "key" || mode === "both" ? makePage(p, true).fits : true);
  if (!outputFits && page.fits) {
    $("#issues").hidden = false;
    $("#issues").textContent +=
      " The selected output cannot fit readably on one page. Use larger paper or shorten the puzzle.";
  }
  const disabled =
    generating ||
    !hasWords ||
    !!invalid.length ||
    !!unplaced.length ||
    !page.fits ||
    !outputFits;
  $("#pdf").disabled = disabled;
  $("#print").disabled = disabled;
  $("#regenerate").disabled = !entries.some((e) => !e.error);
  $("#page-detail").textContent =
    hasWords && page.fits ? `${page.font} pt clues.` : "";
  $("#worksheet").setAttribute("aria-pressed", String(!previewKey));
  $("#answer-key").setAttribute("aria-pressed", String(previewKey));
  document.querySelectorAll(".entry-error").forEach((el) => {
    const id = el.id.slice(6);
    el.textContent = entries.find((e) => e.id === id)?.error || "";
  });
}
function stopSearch() {
  clearTimeout(timer);
  worker?.terminate();
  worker = null;
  generating = false;
}
function queueGenerate() {
  stopSearch();
  current().layout = null;
  generating = true;
  renderPreview();
  timer = setTimeout(startSearch, 450);
}
function startSearch() {
  stopSearch();
  const p = current(),
    entries = valid().filter((e) => !e.error);
  if (!entries.length) {
    p.layout = null;
    save();
    renderPreview();
    return;
  }
  generating = true;
  renderPreview();
  const id = p.id;
  worker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }) => {
    if (current().id !== id) return;
    p.layout = data.layout;
    if (data.done) {
      generating = false;
      worker.terminate();
      worker = null;
      save();
    }
    renderPreview();
  };
  worker.onerror = () => {
    stopSearch();
    notice("Puzzle generation failed. Try regenerating the layout.");
    renderPreview();
  };
  worker.postMessage({ entries, budget: 1600 });
}
function switchTo(id) {
  stopSearch();
  state.active = id;
  save();
  renderPuzzle();
  if (!current().layout && valid().some((e) => !e.error)) startSearch();
}
function download(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function checkedLayout(p) {
  if (!p.layout) return null;
  try {
    const entries = validateEntries(p.entries).filter((e) => !e.error),
      placed = [];
    if (
      !Array.isArray(p.layout.placed) ||
      p.layout.placed.length > entries.length
    )
      return null;
    for (const raw of p.layout.placed) {
      const e = entries.find((e) => e.id === raw.id);
      if (
        !e ||
        placed.some((p) => p.id === e.id) ||
        !["across", "down"].includes(raw.dir) ||
        !Number.isInteger(raw.x) ||
        !Number.isInteger(raw.y) ||
        Math.abs(raw.x) > 12000 ||
        Math.abs(raw.y) > 12000
      )
        return null;
      const next = { ...e, x: raw.x, y: raw.y, dir: raw.dir };
      if (placed.length && canPlace(next, cellsFor(placed)) < 1) return null;
      placed.push(next);
    }
    return {
      ...numberLayout(placed),
      unplaced: entries
        .filter((e) => !placed.some((p) => p.id === e.id))
        .map((e) => e.id),
    };
  } catch {
    return null;
  }
}
function wire() {
  $("#theme").onchange = (e) => {
    state.theme = e.target.value;
    appearance();
    save();
  };
  $("#puzzles").onchange = (e) => switchTo(e.target.value);
  $("#new").onclick = () => {
    const p = newPuzzle(state.defaults);
    p.entries = [blankEntry()];
    state.puzzles.push(p);
    switchTo(p.id);
    $("#puzzle-name").focus();
  };
  $("#duplicate").onclick = () => {
    const p = structuredClone(current());
    p.id = crypto.randomUUID();
    p.name = `${p.name} (copy)`;
    state.puzzles.push(p);
    switchTo(p.id);
  };
  $("#delete").onclick = () => {
    $("#delete-message").textContent =
      `“${current().name || "Untitled puzzle"}” will be permanently removed from this browser.`;
    $("#delete-dialog").showModal();
  };
  $("#delete-dialog").onclose = () => {
    if ($("#delete-dialog").returnValue !== "delete") return;
    stopSearch();
    state.puzzles = state.puzzles.filter((p) => p.id !== state.active);
    if (!state.puzzles.length) state.puzzles.push(newPuzzle(state.defaults));
    switchTo(state.puzzles[0].id);
  };
  $("#puzzle-name").oninput = (e) => {
    current().name = e.target.value;
    library();
    save();
  };
  $("#title").oninput = (e) => {
    current().title = e.target.value;
    save();
    renderPreview();
  };
  document.querySelectorAll("[data-option]").forEach(
    (el) =>
      (el.onchange = () => {
        current().options[el.dataset.option] = el.checked;
        state.defaults = { ...current().options };
        $("#title-field").hidden = !current().options.title;
        save();
        renderPreview();
      }),
  );
  $("#paper").onchange = (e) => {
    current().options.size = e.target.value;
    state.defaults = { ...current().options };
    save();
    renderPreview();
  };
  $("#entries").oninput = (e) => {
    const field = e.target.dataset.entry;
    if (!field) return;
    const entry = current().entries.find(
      (v) => v.id === e.target.closest(".entry").dataset.id,
    );
    entry[field] =
      field === "answer"
        ? e.target.value.replace(/[a-z]/g, (c) => c.toUpperCase())
        : e.target.value;
    if (field === "answer") {
      e.target.value = entry.answer;
      queueGenerate();
    } else {
      const known = new Set([
        ...(current().layout?.placed.map((p) => p.id) || []),
        ...(current().layout?.unplaced || []),
      ]);
      const eligible = valid().filter((e) => !e.error);
      if (
        !current().layout ||
        eligible.some((e) => !known.has(e.id)) ||
        known.size !== eligible.length
      )
        queueGenerate();
      else renderPreview();
    }
    save();
  };
  $("#entries").onclick = (e) => {
    const id = e.target.dataset.remove;
    if (!id) return;
    current().entries = current().entries.filter((e) => e.id !== id);
    renderEntries();
    queueGenerate();
    save();
  };
  $("#add").onclick = () => {
    if (current().entries.length >= 200) {
      notice("Use up to 200 entries per puzzle.");
      return;
    }
    current().entries.push(blankEntry());
    renderEntries();
    save();
    $("#entries .entry:last-child input").focus();
  };
  $("#bulk").onclick = () => {
    $("#bulk-input").value = "";
    $("#bulk-error").textContent = "";
    $("#bulk-dialog").showModal();
  };
  $("#bulk-add").onclick = () => {
    try {
      const entries = parseBulk($("#bulk-input").value);
      if (!entries.length || current().entries.length + entries.length > 200)
        throw new Error("Add between 1 and 200 words per puzzle.");
      current().entries = current()
        .entries.filter((e) => e.answer || e.clue)
        .concat(entries);
      $("#bulk-dialog").close();
      renderEntries();
      queueGenerate();
      save();
    } catch (e) {
      $("#bulk-error").textContent = e.message;
    }
  };
  $("#regenerate").onclick = () => {
    current().layout = null;
    startSearch();
  };
  $("#worksheet").onclick = () => {
    previewKey = false;
    renderPreview();
  };
  $("#answer-key").onclick = () => {
    previewKey = true;
    renderPreview();
  };
  $("#output-mode").onchange = renderPreview;
  $("#pdf").onclick = () => {
    try {
      exportPDF(current(), $("#output-mode").value);
    } catch (e) {
      notice(e.message);
    }
  };
  $("#print").onclick = () => {
    const p = current(),
      mode = $("#output-mode").value;
    const keys = mode === "both" ? [false, true] : [mode === "key"];
    $("#print-pages").innerHTML = keys
      .map(
        (key) => `<div class="print-sheet">${pageSVG(makePage(p, key))}</div>`,
      )
      .join("");
    let style = $("#print-size");
    if (!style) {
      style = document.createElement("style");
      style.id = "print-size";
      document.head.append(style);
    }
    style.textContent = `@page { size: ${p.options.size === "letter" ? "letter" : p.options.size === "legal" ? "legal" : p.options.size}; margin: 0; }`;
    window.print();
  };
  $("#export").onclick = () =>
    download(
      JSON.stringify(
        { format: "crossword-maker", version: 1, puzzles: state.puzzles },
        null,
        2,
      ),
      "crossword-maker-backup.json",
      "application/json",
    );
  $("#import").onclick = () => $("#import-file").click();
  $("#import-file").onchange = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Choose a backup smaller than 10 MB.");
      const puzzles = validateBackup(JSON.parse(await file.text()));
      if (!puzzles.length) throw new Error("This backup has no puzzles.");
      puzzles.forEach((p) => (p.layout = checkedLayout(p)));
      state.puzzles.push(...puzzles);
      switchTo(puzzles[0].id);
      notice(
        `Imported ${puzzles.length} ${puzzles.length === 1 ? "puzzle" : "puzzles"}. Existing puzzles were kept.`,
      );
    } catch (error) {
      notice(error.message);
    }
    e.target.value = "";
  };
  $("#example").onclick = () => {
    const p = newPuzzle(state.defaults);
    p.name = "AI vocabulary";
    p.title = "AI Vocabulary Quiz";
    p.entries = [
      ["CIRCUMVENT", "To find a way around a rule, obstacle, or problem."],
      ["CONSEQUENCE", "A result or effect of an action or decision."],
      ["CULPABLE", "Deserving blame or responsibility for something wrong."],
      ["AUTONOMOUS", "Able to act or make decisions independently."],
      ["BIAS", "An unfair preference for or against someone or something."],
      ["RELIABILITY", "The quality of being trustworthy or dependable."],
      ["SCRUTINIZE", "To examine something closely and carefully."],
      ["DILEMMA", "A difficult choice between two or more options."],
      ["DEFINITION", "An explanation of what something means."],
      [
        "PRINCIPLE",
        "A basic belief or rule that guides decisions and behavior.",
      ],
      ["ETHICAL", "Following principles of what is right and wrong."],
      ["DELEGATED", "Given a task or responsibility to someone else."],
    ].map(([answer, clue]) => ({ id: crypto.randomUUID(), answer, clue }));
    state.puzzles.push(p);
    switchTo(p.id);
  };
  window.addEventListener("beforeunload", (e) => {
    if (!storageOK) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}
async function init() {
  shell();
  try {
    await loadFont();
    await document.fonts.load("12px Worksheet");
    try {
      await openDB();
      const loaded = await readState();
      if (loaded) {
        state = loaded;
        state.defaults = { ...defaults, ...state.defaults };
        state.puzzles.forEach((p) => (p.layout = checkedLayout(p)));
      }
    } catch {
      storageOK = false;
      notice(
        "Browser storage is unavailable. Your work will last only for this visit; export a backup before leaving.",
      );
    }
    if (!state.puzzles.length) {
      const p = newPuzzle(state.defaults);
      p.entries = [blankEntry()];
      state.puzzles.push(p);
    }
    if (!current()) state.active = state.puzzles[0].id;
    appearance();
    wire();
    renderPuzzle();
    if (!current().layout && valid().some((e) => !e.error)) startSearch();
  } catch (e) {
    notice(`${e.message} Please reload the page.`);
  }
}
init();
