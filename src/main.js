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
  isValidLayout,
  numberLayout,
} from "./generator.js";
import { loadFont, makePage, pageSVG, exportPDF, sizes } from "./page.js";
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
let selectedRows = new Set();
let pendingRemoval = [];
const blankEntry = () => ({ id: crypto.randomUUID(), answer: "", clue: "" });
function notice(message) {
  $("#notice").textContent = message;
  $("#notice").hidden = !message;
}
function save() {
  const snapshot = structuredClone(state);
  saving = saving
    .catch(() => {})
    .then(() => writeState(snapshot))
    .then(() => {
      storageOK = true;
    })
    .catch(() => {
      storageOK = false;
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
<header class="app-toolbar" aria-label="Puzzle controls">
<label class="sr-only" for="puzzles">Saved puzzles</label><select id="puzzles"></select>
<button id="new" class="secondary">New puzzle</button><button id="duplicate" class="text-button">Duplicate</button><button id="delete" class="text-button danger">Delete</button>
<div class="toolbar-end"><button id="export" class="text-button">Back up all</button><label id="import" class="text-button file-import" for="import-file"><span id="import-label">Import</span></label><input type="file" id="import-file" class="sr-only" accept=".json,application/json" aria-label="Import puzzle backup"><label class="theme-label"><span class="sr-only">Appearance</span><select id="theme"><option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
</header>
<div id="notice" class="notice" role="alert" hidden></div>
<main class="workspace"><section class="editor" aria-label="Puzzle editor">
<div class="inline-field"><label for="puzzle-name">Puzzle name</label><input id="puzzle-name" maxlength="200" placeholder="Untitled puzzle"></div>
<fieldset class="worksheet-options"><legend>Worksheet fields</legend><div class="option-grid"><label><input type="checkbox" data-option="title"> Title</label><label><input type="checkbox" data-option="name"> Name</label><label><input type="checkbox" data-option="classPeriod"> Class period</label><label><input type="checkbox" data-option="date"> Date</label><label><input type="checkbox" data-option="answerLines"> Clue answer lines</label></div></fieldset>
<div id="title-field" class="inline-field"><label for="title">Printed title</label><input id="title" maxlength="500" placeholder="Worksheet title"></div>
<div class="section-heading"><h1>Answers and clues</h1><button id="bulk" class="text-button">Bulk paste</button></div><p class="helper">Answers use A–Z.</p>
<div class="entries-table"><table aria-label="Answers and clues"><colgroup><col class="selection-column"><col class="number-column"><col class="answer-column"><col><col class="remove-column"></colgroup><thead><tr><th scope="col"><input type="checkbox" id="select-all" aria-label="Select all rows"></th><th scope="col"><span class="sr-only">Row</span></th><th scope="col">Answer</th><th scope="col">Clue</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody id="entries"></tbody></table></div>
<div class="entry-actions"><div class="row-actions"><button id="add" class="secondary">Add row</button><button id="remove-selected" class="text-button danger" disabled>Remove selected</button></div><button id="example" class="text-button">Load example</button></div>
</section>
<section class="preview-panel" aria-label="Worksheet preview"><div class="preview-toolbar"><div class="segmented" aria-label="Preview type"><button id="worksheet" aria-pressed="true">Worksheet</button><button id="answer-key" aria-pressed="false">Answer key</button></div><label class="paper-select"><span class="sr-only">Paper size</span><select id="paper"><option value="letter">Letter · 8.5 × 11 in</option><option value="legal">Legal · 8.5 × 14 in</option><option value="a4">A4 · 210 × 297 mm</option><option value="a5">A5 · 148 × 210 mm</option></select></label></div>
<div class="preview-controls"><div class="generation-line"><span class="status-dot"></span><span id="generation-status" role="status" aria-live="polite"></span></div><button id="regenerate" class="text-button">Regenerate</button></div>
<div id="issues" class="issues" hidden></div><div class="paper-stage"><div id="paper-preview" class="paper"></div><div id="empty-preview"><p>Enter answers and clues to preview the worksheet.</p></div></div>
<div class="output-bar"><div><button id="print" class="secondary">Print</button><button id="pdf" class="primary">Download PDF</button></div></div><span id="page-detail" class="sr-only"></span></section></main>
<dialog id="bulk-dialog"><form method="dialog"><div class="dialog-heading"><h2>Bulk paste</h2><button class="secondary" value="cancel" aria-label="Close">Close</button></div><p>Enter <strong>ANSWER, clue</strong> on each line. A tab or one or more spaces also works, including columns pasted from a spreadsheet. Answers can be lowercase or uppercase. Omit the header. These will be added to your existing words.</p><label class="field-label" for="bulk-input">Answers and clues</label><textarea id="bulk-input" rows="10" placeholder="PLANET, A world orbiting a star&#10;OCEAN, A large body of salt water"></textarea><p id="bulk-error" class="error" role="alert"></p><button id="bulk-add" type="button" class="primary">Add words</button></form></dialog>
<dialog id="delete-dialog"><form method="dialog"><h2>Delete this puzzle?</h2><p id="delete-message"></p><div class="dialog-actions"><button value="cancel" class="secondary">Keep puzzle</button><button value="delete" class="destructive">Delete puzzle</button></div></form></dialog><dialog id="example-dialog"><form method="dialog"><h2>Load example puzzle?</h2><p>Your current puzzle will stay saved. A new example puzzle will open.</p><div class="dialog-actions"><button value="cancel" class="secondary">Cancel</button><button value="load" class="primary">Load example</button></div></form></dialog><dialog id="remove-dialog"><form method="dialog"><h2 id="remove-heading">Remove row?</h2><p id="remove-message"></p><div class="dialog-actions"><button value="cancel" class="secondary">Keep rows</button><button value="remove" class="destructive">Remove</button></div></form></dialog><div id="print-pages"></div>`;
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
  selectedRows.clear();
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
      return `<tr class="entry" data-id="${esc(e.id)}"><td class="selection-cell"><input type="checkbox" data-select="${esc(e.id)}" aria-label="Select row ${i + 1}" ${selectedRows.has(e.id) ? "checked" : ""}></td><th scope="row" class="entry-index">${i + 1}</th><td><label class="sr-only" for="answer-${esc(e.id)}">Answer ${i + 1}</label><input id="answer-${esc(e.id)}" data-entry="answer" value="${esc(e.answer)}" maxlength="60" placeholder="Answer" autocomplete="off" spellcheck="false" aria-describedby="error-${esc(e.id)}"><p class="entry-error" id="error-${esc(e.id)}">${esc(error || "")}</p></td><td><label class="sr-only" for="clue-${esc(e.id)}">Clue ${i + 1}</label><textarea id="clue-${esc(e.id)}" data-entry="clue" rows="1" maxlength="2000" placeholder="Clue">${esc(e.clue)}</textarea></td><td><button class="remove-entry text-button" aria-label="Remove word ${i + 1}" data-remove="${esc(e.id)}" title="Remove word ${i + 1}">×</button></td></tr>`;
    })
    .join("");
  document.querySelectorAll("[data-entry=clue]").forEach(sizeClue);
  updateSelection();
}
function updateSelection() {
  const ids = new Set(current().entries.map((e) => e.id));
  selectedRows = new Set([...selectedRows].filter((id) => ids.has(id)));
  const all = $("#select-all");
  all.checked = ids.size > 0 && selectedRows.size === ids.size;
  all.indeterminate = selectedRows.size > 0 && selectedRows.size < ids.size;
  all.disabled = ids.size === 0;
  $("#remove-selected").disabled = selectedRows.size === 0;
  $("#remove-selected").textContent = selectedRows.size
    ? `Remove selected (${selectedRows.size})`
    : "Remove selected";
}
function removeRows(ids) {
  const remove = new Set(ids);
  current().entries = current().entries.filter((e) => !remove.has(e.id));
  renderEntries();
  queueGenerate();
  save();
}
function requestRemoval(ids) {
  const rows = current().entries.filter((e) => ids.includes(e.id));
  if (!rows.length) return;
  if (!rows.some((e) => e.answer.trim() || e.clue.trim())) {
    removeRows(ids);
    return;
  }
  pendingRemoval = ids;
  $("#remove-heading").textContent =
    rows.length === 1 ? "Remove this row?" : `Remove ${rows.length} rows?`;
  $("#remove-message").textContent =
    "The selected answers and clues will be permanently removed from this puzzle.";
  $("#remove-dialog").returnValue = "";
  $("#remove-dialog").showModal();
}
function sizeClue(el) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + 2}px`;
}
function fitPreview() {
  const stage = $(".paper-stage"),
    paper = $("#paper-preview"),
    panel = $(".preview-panel");
  const svg = paper?.querySelector("svg");
  if (!svg) return;
  const ratio = svg.viewBox.baseVal.width / svg.viewBox.baseVal.height;
  const style = getComputedStyle(stage),
    panelStyle = getComputedStyle(panel);
  const horizontal = (css) =>
    parseFloat(css.paddingLeft) +
    parseFloat(css.paddingRight) +
    parseFloat(css.borderLeftWidth) +
    parseFloat(css.borderRightWidth);
  const vertical = (css) =>
    parseFloat(css.paddingTop) +
    parseFloat(css.paddingBottom) +
    parseFloat(css.borderTopWidth) +
    parseFloat(css.borderBottomWidth);
  const controlsHeight = [...panel.children]
    .filter((el) => el !== stage)
    .reduce((total, el) => {
      const css = getComputedStyle(el);
      if (css.display === "none" || css.position === "absolute") return total;
      return (
        total +
        el.getBoundingClientRect().height +
        parseFloat(css.marginTop) +
        parseFloat(css.marginBottom)
      );
    }, 0);
  const availableHeight = Math.max(
    0,
    panel.clientHeight -
      parseFloat(panelStyle.paddingTop) -
      parseFloat(panelStyle.paddingBottom) -
      controlsHeight -
      vertical(style),
  );
  if (window.matchMedia("(min-width: 761px)").matches) {
    const controlsWidth = Math.max(
      ...[".preview-toolbar", ".output-bar"].map((selector) => {
        const row = $(selector);
        return (
          [...row.children].reduce(
            (sum, child) => sum + child.getBoundingClientRect().width,
            0,
          ) +
          parseFloat(getComputedStyle(row).columnGap) *
            (row.children.length - 1)
        );
      }),
    );
    const widestRatio = Math.max(
      ...Object.values(sizes).map(([w, h]) => w / h),
    );
    const needed =
      Math.max(
        controlsWidth,
        availableHeight * widestRatio + horizontal(style),
      ) + horizontal(panelStyle);
    const availableWidth = Math.max(0, $(".workspace").clientWidth - 430);
    $(".workspace").style.setProperty(
      "--preview-width",
      `${Math.ceil(Math.min(needed, availableWidth))}px`,
    );
  }
  const width =
    stage.clientWidth -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight);
  const paperWidth = Math.max(0, Math.min(width, availableHeight * ratio));
  paper.style.width = `${paperWidth}px`;
  stage.style.height = `${paperWidth / ratio + vertical(style)}px`;
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
  fitPreview();
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
      "The words are placed, but this layout cannot fit readably on one page. The preview is scaled down for inspection. Try regenerating a more compact grid, larger paper, or shorter clues.",
    );
  $("#issues").hidden = !messages.length;
  $("#issues").textContent = messages.join(" ");
  const disabled =
    generating ||
    !hasWords ||
    !!invalid.length ||
    !!unplaced.length ||
    !page.fits;
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
      placed.push(next);
    }
    if (!isValidLayout(placed)) return null;
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
    $("#delete-dialog").returnValue = "";
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
    if (field === "clue") sizeClue(e.target);
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
    requestRemoval([id]);
  };
  $("#entries").onchange = (e) => {
    const id = e.target.dataset.select;
    if (!id) return;
    if (e.target.checked) selectedRows.add(id);
    else selectedRows.delete(id);
    updateSelection();
  };
  $("#select-all").onchange = (e) => {
    selectedRows = e.target.checked
      ? new Set(current().entries.map((e) => e.id))
      : new Set();
    document
      .querySelectorAll("[data-select]")
      .forEach((el) => (el.checked = e.target.checked));
    updateSelection();
  };
  $("#remove-selected").onclick = () => requestRemoval([...selectedRows]);
  $("#remove-dialog").onclose = () => {
    if ($("#remove-dialog").returnValue === "remove")
      removeRows(pendingRemoval);
    pendingRemoval = [];
  };
  $("#add").onclick = () => {
    if (current().entries.length >= 200) {
      notice("Use up to 200 entries per puzzle.");
      return;
    }
    current().entries.push(blankEntry());
    renderEntries();
    save();
    $('#entries .entry:last-child [data-entry="answer"]').focus();
  };
  $("#bulk").onclick = () => {
    $("#bulk-input").value = "";
    $("#bulk-error").textContent = "";
    $("#bulk-dialog").showModal();
  };
  $("#bulk-input").oninput = () => {
    $("#bulk-error").textContent = "";
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
  $("#pdf").onclick = () => {
    try {
      exportPDF(current(), previewKey);
    } catch (e) {
      notice(e.message);
    }
  };
  $("#print").onclick = () => {
    const p = current();
    $("#print-pages").innerHTML =
      `<div class="print-sheet">${pageSVG(makePage(p, previewKey))}</div>`;
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
  $("#import-file").onchange = async (e) => {
    const input = e.target;
    const file = input.files[0];
    if (!file) return;
    input.disabled = true;
    $("#import-label").textContent = "Importing…";
    notice(`Importing “${file.name}”…`);
    try {
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
      notice(`Could not import backup: ${error.message}`);
    } finally {
      input.value = "";
      input.disabled = false;
      $("#import-label").textContent = "Import";
    }
  };
  const loadExample = () => {
    const p = newPuzzle(state.defaults);
    p.name = "Vocabulary";
    p.title = "Vocabulary Quiz";
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
  $("#example").onclick = () => {
    const p = current();
    const hasData =
      p.entries.some((e) => e.answer.trim() || e.clue.trim()) ||
      p.title.trim() ||
      (p.name.trim() && p.name !== "Untitled puzzle");
    if (hasData) {
      $("#example-dialog").returnValue = "";
      $("#example-dialog").showModal();
    } else loadExample();
  };
  $("#example-dialog").onclose = () => {
    if ($("#example-dialog").returnValue === "load") loadExample();
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
  $("#app").setAttribute("aria-busy", "true");
  $("#generation-status").textContent = "Preparing your workspace…";
  document
    .querySelectorAll("button, input, select, textarea")
    .forEach((el) => (el.disabled = true));
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
    document
      .querySelectorAll("button, input, select, textarea")
      .forEach((el) => (el.disabled = false));
    appearance();
    wire();
    const observer = new ResizeObserver(() => {
      fitPreview();
      document.querySelectorAll("[data-entry=clue]").forEach(sizeClue);
    });
    observer.observe($(".paper-stage"));
    observer.observe($(".preview-panel"));
    observer.observe($(".editor"));
    renderPuzzle();
    $("#app").setAttribute("aria-busy", "false");
    if (!current().layout && valid().some((e) => !e.error)) startSearch();
  } catch (e) {
    notice(`${e.message} Please reload the page.`);
  }
}
init();
