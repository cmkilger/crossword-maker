import { generateDense } from "./dense-generator.js";
// Open-grid constraint search. Each restart explores alternative placements,
// retaining the best valid connected arrangement within a fixed time budget.
export function validateEntries(entries) {
  const seen = new Set();
  return entries.map((e) => {
    let error = "";
    if (!/^[A-Z]+$/.test(e.answer)) error = "Use letters A–Z only.";
    else if (e.answer.length > 60) error = "Use at most 60 letters.";
    else if (!e.clue.trim()) error = "Add a clue.";
    else if (seen.has(e.answer)) error = "This answer is already used.";
    seen.add(e.answer);
    return { ...e, error };
  });
}
const key = (x, y) => `${x},${y}`;
export function cellsFor(placed) {
  const cells = new Map();
  for (const p of placed)
    for (let i = 0; i < p.answer.length; i++) {
      const x = p.x + (p.dir === "across" ? i : 0),
        y = p.y + (p.dir === "down" ? i : 0),
        k = key(x, y);
      const cell = cells.get(k) || {
        x,
        y,
        letter: p.answer[i],
        across: false,
        down: false,
      };
      cell[p.dir] = true;
      cells.set(k, cell);
    }
  return cells;
}
export function canPlace(p, cells) {
  const dx = p.dir === "across" ? 1 : 0,
    dy = 1 - dx;
  if (
    cells.has(key(p.x - dx, p.y - dy)) ||
    cells.has(key(p.x + dx * p.answer.length, p.y + dy * p.answer.length))
  )
    return -1;
  let crossings = 0;
  for (let i = 0; i < p.answer.length; i++) {
    const x = p.x + dx * i,
      y = p.y + dy * i,
      c = cells.get(key(x, y));
    if (c) {
      if (c.letter !== p.answer[i] || c[p.dir]) return -1;
      crossings++;
    } else if (cells.has(key(x + dy, y + dx)) || cells.has(key(x - dy, y - dx)))
      return -1;
  }
  return crossings;
}
// Validate final geometry rather than insertion order: dense layouts may need
// neighboring words to be constructed together before all runs are complete.
export function isValidLayout(placed) {
  if (!placed.length) return true;
  const cells = new Map();
  for (let owner = 0; owner < placed.length; owner++) {
    const p = placed[owner];
    if (
      !["across", "down"].includes(p.dir) ||
      !Number.isInteger(p.x) ||
      !Number.isInteger(p.y) ||
      !/^[A-Z]+$/.test(p.answer)
    )
      return false;
    for (let i = 0; i < p.answer.length; i++) {
      const x = p.x + (p.dir === "across" ? i : 0),
        y = p.y + (p.dir === "down" ? i : 0),
        k = key(x, y);
      const cell = cells.get(k) || {
        x,
        y,
        letter: p.answer[i],
        across: null,
        down: null,
      };
      if (cell.letter !== p.answer[i] || cell[p.dir] !== null) return false;
      cell[p.dir] = owner;
      cells.set(k, cell);
    }
  }
  for (const c of cells.values()) {
    for (const [dx, dy, dir] of [
      [1, 0, "across"],
      [0, 1, "down"],
    ]) {
      const neighbor = cells.get(key(c.x + dx, c.y + dy));
      if (neighbor && (c[dir] === null || neighbor[dir] !== c[dir]))
        return false;
    }
  }
  const seen = new Set(),
    queue = [cells.keys().next().value];
  while (queue.length) {
    const k = queue.pop();
    if (seen.has(k)) continue;
    seen.add(k);
    const c = cells.get(k);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = key(c.x + dx, c.y + dy);
      if (cells.has(next) && !seen.has(next)) queue.push(next);
    }
  }
  return seen.size === cells.size;
}
export function bounds(placed) {
  if (!placed.length) return { minX: 0, minY: 0, width: 0, height: 0 };
  const minX = Math.min(...placed.map((p) => p.x)),
    minY = Math.min(...placed.map((p) => p.y));
  return {
    minX,
    minY,
    width:
      Math.max(
        ...placed.map((p) => p.x + (p.dir === "across" ? p.answer.length : 1)),
      ) - minX,
    height:
      Math.max(
        ...placed.map((p) => p.y + (p.dir === "down" ? p.answer.length : 1)),
      ) - minY,
  };
}
export function numberLayout(placed) {
  const b = bounds(placed);
  const normalized = placed.map((p) => ({
    ...p,
    x: p.x - b.minX,
    y: p.y - b.minY,
  }));
  const starts = [...new Set(normalized.map((p) => key(p.x, p.y)))]
    .map((k) => k.split(",").map(Number))
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const numbers = new Map(starts.map(([x, y], i) => [key(x, y), i + 1]));
  return {
    width: b.width,
    height: b.height,
    placed: normalized.map((p) => ({
      ...p,
      number: numbers.get(key(p.x, p.y)),
    })),
  };
}
export function disconnectedGroups(entries) {
  const unseen = new Set(entries.map((_, i) => i)),
    groups = [];
  while (unseen.size) {
    const group = [],
      queue = [unseen.values().next().value];
    unseen.delete(queue[0]);
    while (queue.length) {
      const i = queue.pop();
      group.push(entries[i].id);
      for (const j of unseen)
        if ([...entries[i].answer].some((c) => entries[j].answer.includes(c))) {
          unseen.delete(j);
          queue.push(j);
        }
    }
    groups.push(group);
  }
  return groups;
}
export function generate(
  entries,
  { budget = 1400, onProgress = () => {}, random = Math.random } = {},
) {
  if (!entries.length) return { ...numberLayout([]), unplaced: [] };
  const deadline = performance.now() + budget;
  const dense = generateDense(entries, {
    budget: Math.min(600, budget * 0.35),
  });
  if (dense && isValidLayout(dense)) {
    const result = { ...numberLayout(dense), unplaced: [] };
    onProgress(result);
    return result;
  }
  let best = [],
    bestScore = -Infinity,
    visited = 0;
  const score = (placed) => {
    const b = bounds(placed);
    const c = cellsFor(placed);
    const cross = [...c.values()].filter((c) => c.across && c.down).length;
    return (
      placed.length * 1e7 +
      cross * 100 -
      b.width * b.height * 2 -
      Math.abs(b.width - b.height * 0.95) * 10
    );
  };
  function search(placed, remaining, depth = 0) {
    if (performance.now() > deadline || ++visited > 2400) return;
    const s = score(placed);
    if (s > bestScore) {
      bestScore = s;
      best = placed;
      onProgress({
        ...numberLayout(best),
        unplaced: entries
          .filter((e) => !best.some((p) => p.id === e.id))
          .map((e) => e.id),
      });
    }
    if (!remaining.length) return;
    const cells = cellsFor(placed),
      options = [];
    for (const e of remaining) {
      const candidates = [],
        seen = new Set();
      for (const c of cells.values())
        for (let i = 0; i < e.answer.length; i++)
          if (e.answer[i] === c.letter)
            for (const dir of ["across", "down"]) {
              const p = {
                  ...e,
                  dir,
                  x: c.x - (dir === "across" ? i : 0),
                  y: c.y - (dir === "down" ? i : 0),
                },
                k = `${dir}:${p.x},${p.y}`;
              if (seen.has(k)) continue;
              seen.add(k);
              const crossings = canPlace(p, cells);
              if (crossings > 0) {
                const b = bounds([...placed, p]);
                candidates.push({
                  p,
                  value: crossings * 80 - b.width * b.height + random() * 35,
                });
              }
            }
      candidates.sort((a, b) => b.value - a.value);
      if (candidates.length)
        options.push({ e, candidates, rank: e.answer.length + random() * 8 });
    }
    // A word without a current intersection may become placeable later; do not
    // prune a branch merely because that word currently has no placements.
    options.sort((a, b) => b.rank - a.rank);
    for (const o of options.slice(0, depth < 2 ? 4 : 2))
      for (const { p } of o.candidates.slice(0, 3)) {
        search(
          [...placed, p],
          remaining.filter((e) => e.id !== o.e.id),
          depth + 1,
        );
        if (performance.now() > deadline || visited > 2400) return;
      }
  }
  let attempt = 0;
  while (performance.now() < deadline && attempt < 100) {
    visited = 0;
    const sorted = [...entries].sort(
      (a, b) => b.answer.length - a.answer.length,
    );
    const first =
      attempt < sorted.length
        ? sorted[attempt]
        : entries[Math.floor(random() * entries.length)];
    search(
      [{ ...first, x: 0, y: 0, dir: random() < 0.5 ? "across" : "down" }],
      entries.filter((e) => e.id !== first.id),
    );
    attempt++;
  }
  return {
    ...numberLayout(best),
    unplaced: entries
      .filter((e) => !best.some((p) => p.id === e.id))
      .map((e) => e.id),
  };
}
