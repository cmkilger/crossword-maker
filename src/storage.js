export const defaults = {
  title: false,
  name: false,
  classPeriod: false,
  date: false,
  answerLines: false,
  size: "letter",
};
let db;
export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("crossword-maker", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => {
      db = request.result;
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}
export function readState() {
  return new Promise((resolve, reject) => {
    const req = db.transaction("state").objectStore("state").get("workspace");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export function writeState(state) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readwrite");
    tx.objectStore("state").put(state, "workspace");
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export function newPuzzle(options = defaults) {
  return {
    id: crypto.randomUUID(),
    name: "Untitled puzzle",
    title: "",
    options: { ...options },
    entries: [],
    layout: null,
  };
}
export function parseBulk(input) {
  const rows = input
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim());
  return rows.map((row, i) => {
    const parts = row.split("\t");
    if (parts.length !== 2)
      throw new Error(
        `Row ${i + 1}: paste two spreadsheet columns: answer, then clue.`,
      );
    return {
      id: crypto.randomUUID(),
      answer: parts[0].trim().toUpperCase(),
      clue: parts[1].trim(),
    };
  });
}
export function validateBackup(data) {
  if (
    data?.format !== "crossword-maker" ||
    data.version !== 1 ||
    !Array.isArray(data.puzzles) ||
    data.puzzles.length > 500
  )
    throw new Error("Choose a Crossword Maker backup (version 1).");
  return data.puzzles.map((p) => {
    if (
      typeof p.name !== "string" ||
      typeof p.title !== "string" ||
      !Array.isArray(p.entries) ||
      p.entries.length > 200
    )
      throw new Error("The backup contains an invalid puzzle.");
    const options = { ...defaults };
    for (const k of ["title", "name", "classPeriod", "date", "answerLines"])
      options[k] = p.options?.[k] === true;
    if (["letter", "legal", "a4", "a5"].includes(p.options?.size))
      options.size = p.options.size;
    const ids = new Set();
    const entries = p.entries.map((e) => {
      if (
        typeof e.id !== "string" ||
        ids.has(e.id) ||
        typeof e.answer !== "string" ||
        typeof e.clue !== "string" ||
        e.answer.length > 1000 ||
        e.clue.length > 10000
      )
        throw new Error("The backup contains an invalid entry.");
      ids.add(e.id);
      return { id: e.id, answer: e.answer, clue: e.clue };
    });
    // Revalidate saved placements in the application before trusting their geometry.
    return {
      id: crypto.randomUUID(),
      name: p.name.slice(0, 200),
      title: p.title.slice(0, 500),
      options,
      entries,
      layout: p.layout || null,
    };
  });
}
