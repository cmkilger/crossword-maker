// Reconstruct fully checked crosswords from a supplied vocabulary. Unlike the
// open-grid search, adjacent partial words are allowed: every occupied square
// must ultimately belong to both an Across and a Down answer.
export function generateDense(entries, { budget = 500 } = {}) {
  if (entries.length < 4 || entries.some((e) => e.answer.length < 2))
    return null;
  const frequencies = new Map(),
    letters = new Map();
  entries.forEach((entry, word) =>
    [...entry.answer].forEach((letter, offset) => {
      frequencies.set(letter, (frequencies.get(letter) || 0) + 1);
      if (!letters.has(letter)) letters.set(letter, []);
      letters.get(letter).push([word, offset]);
    }),
  );
  // Each checked square contributes its letter to exactly two entries.
  if ([...frequencies.values()].some((count) => count % 2)) return null;
  const longest = entries.reduce(
    (best, entry, i) =>
      entry.answer.length > entries[best].answer.length ? i : best,
    0,
  );
  const area = entries.reduce((sum, entry) => sum + entry.answer.length, 0) / 2;
  let minimum = Math.max(
    entries[longest].answer.length,
    Math.ceil(Math.sqrt(area)),
  );
  if (minimum % 2 === 0) minimum++;
  const deadline = performance.now() + budget;
  const dimensions = [minimum, minimum + 2];
  for (const size of dimensions) {
    if (size > 31 || performance.now() >= deadline) break;
    const until = Math.min(
      deadline,
      performance.now() +
        (deadline - performance.now()) /
          (dimensions.length - dimensions.indexOf(size)),
    );
    const solution = solve(size, until);
    if (solution) return solution;
  }
  return null;

  function solve(size, until) {
    function candidate(state, word, offset, x, y, direction) {
      const answer = entries[word].answer,
        dx = direction === 0 ? 1 : 0,
        dy = 1 - dx;
      const sx = x - dx * offset,
        sy = y - dy * offset;
      const ex = sx + dx * (answer.length - 1),
        ey = sy + dy * (answer.length - 1);
      if (sx < 0 || sy < 0 || ex >= size || ey >= size) return null;
      const before =
        sx - dx >= 0 && sy - dy >= 0 ? (sy - dy) * size + sx - dx : -1;
      const after =
        ex + dx < size && ey + dy < size ? (ey + dy) * size + ex + dx : -1;
      if (
        (before >= 0 && state.chars[before]) ||
        (after >= 0 && state.chars[after])
      )
        return null;
      let crossings = 0;
      for (let i = 0; i < answer.length; i++) {
        const k = (sy + dy * i) * size + sx + dx * i;
        if (
          state.blocked[k] ||
          state.owners[direction][k] >= 0 ||
          (state.chars[k] && state.chars[k] !== answer[i])
        )
          return null;
        if (state.chars[k]) crossings++;
      }
      return { word, x: sx, y: sy, direction, before, after, crossings };
    }
    function place(state, placement) {
      const next = {
        chars: state.chars.slice(),
        blocked: state.blocked.slice(),
        owners: state.owners.map((a) => a.slice()),
        used: state.used.slice(),
        placed: [...state.placed, placement],
      };
      const answer = entries[placement.word].answer,
        dx = placement.direction === 0 ? 1 : 0,
        dy = 1 - dx;
      for (let i = 0; i < answer.length; i++) {
        const k = (placement.y + dy * i) * size + placement.x + dx * i;
        next.chars[k] = answer[i];
        next.owners[placement.direction][k] = placement.word;
      }
      if (placement.before >= 0) next.blocked[placement.before] = 1;
      if (placement.after >= 0) next.blocked[placement.after] = 1;
      next.used[placement.word] = 1;
      return next;
    }
    function search(state) {
      if (performance.now() >= until) return null;
      let choice = null;
      for (let k = 0; k < size * size; k++) {
        if (!state.chars[k]) continue;
        for (let direction = 0; direction < 2; direction++) {
          if (state.owners[direction][k] >= 0) continue;
          const options = [];
          for (const [word, offset] of letters.get(state.chars[k]) || []) {
            if (state.used[word]) continue;
            const placement = candidate(
              state,
              word,
              offset,
              k % size,
              Math.floor(k / size),
              direction,
            );
            if (placement) options.push(placement);
            if (choice && options.length > choice.length) break;
          }
          if (!options.length) return null;
          if (!choice || options.length < choice.length) choice = options;
        }
      }
      if (!choice)
        return state.placed.length === entries.length ? state.placed : null;
      choice.sort(
        (a, b) =>
          b.crossings - a.crossings ||
          entries[b.word].answer.length - entries[a.word].answer.length,
      );
      for (const placement of choice) {
        if (performance.now() >= until) return null;
        const result = search(place(state, placement));
        if (result) return result;
      }
      return null;
    }
    const starts = [];
    for (let y = 0; y < size; y++)
      for (let x = 0; x <= size - entries[longest].answer.length; x++) {
        starts.push({
          x,
          y,
          rank:
            Math.abs(y - (size - 1) / 2) * 10 +
            Math.abs(x - (size - entries[longest].answer.length) / 2),
        });
      }
    starts.sort((a, b) => a.rank - b.rank);
    for (const start of starts) {
      if (performance.now() >= until) break;
      const state = {
        chars: Array(size * size).fill(""),
        blocked: new Uint8Array(size * size),
        owners: [
          new Int16Array(size * size).fill(-1),
          new Int16Array(size * size).fill(-1),
        ],
        used: new Uint8Array(entries.length),
        placed: [],
      };
      const seed = candidate(state, longest, 0, start.x, start.y, 0);
      const result = seed && search(place(state, seed));
      if (result)
        return result.map((p) => ({
          ...entries[p.word],
          x: p.x,
          y: p.y,
          dir: p.direction === 0 ? "across" : "down",
        }));
    }
    return null;
  }
}
