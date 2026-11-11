import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generate,
  canPlace,
  cellsFor,
  validateEntries,
  disconnectedGroups,
} from "../src/generator.js";
import { validateBackup } from "../src/storage.js";
const entries = (words) =>
  words.map((answer, i) => ({ id: String(i), answer, clue: `Clue ${i}` }));
test("generated crossword has matching crossings, no illegal neighbors, and every word accounted for", () => {
  const input = entries([
    "CIRCUMVENT",
    "CONSEQUENCE",
    "CULPABLE",
    "AUTONOMOUS",
    "BIAS",
    "RELIABILITY",
    "SCRUTINIZE",
    "DILEMMA",
    "DEFINITION",
    "PRINCIPLE",
    "ETHICAL",
    "DELEGATED",
  ]);
  const result = generate(input, { budget: 350 });
  const placed = [];
  for (const p of result.placed) {
    assert.ok(!placed.length || canPlace(p, cellsFor(placed)) > 0);
    placed.push(p);
  }
  assert.equal(
    new Set([...result.placed.map((p) => p.id), ...result.unplaced]).size,
    input.length,
  );
  assert.equal(result.placed.length, input.length);
  assert.ok(result.placed.some((p) => p.dir === "across"));
  assert.ok(result.placed.some((p) => p.dir === "down"));
  for (const p of result.placed) {
    assert.ok(p.x >= 0 && p.y >= 0);
    assert.ok(p.number >= 1);
  }
});
test("impossible connections are flagged without inventing answers", () => {
  const input = entries(["AAA", "BBB"]);
  assert.equal(disconnectedGroups(input).length, 2);
  const result = generate(input, { budget: 20 });
  assert.equal(result.placed.length, 1);
  assert.equal(result.unplaced.length, 1);
});
test("conflicts, parallel overlaps, and adjacent letters are rejected", () => {
  const cells = cellsFor([{ answer: "CAT", dir: "across", x: 0, y: 0 }]);
  assert.equal(canPlace({ answer: "COW", dir: "down", x: 0, y: 0 }, cells), 1);
  assert.equal(canPlace({ answer: "DOG", dir: "down", x: 0, y: 0 }, cells), -1);
  assert.equal(
    canPlace({ answer: "CAT", dir: "across", x: 0, y: 0 }, cells),
    -1,
  );
  assert.equal(
    canPlace({ answer: "BAT", dir: "across", x: 0, y: 1 }, cells),
    -1,
  );
});
test("validation rejects non A-Z, duplicate answers, and missing clues", () => {
  const values = validateEntries(
    entries(["CAT", "CAT", "ICE CREAM", "CAFÉ", "123", "DOG"]).map((e, i) =>
      i === 5 ? { ...e, clue: "" } : e,
    ),
  );
  assert.equal(values.filter((e) => e.error).length, 5);
});
test("backup imports append-safe puzzle IDs and reject malformed data", () => {
  const p = {
    name: "Test",
    title: "",
    options: { size: "a4" },
    entries: entries(["CAT"]),
  };
  const backup = { format: "crossword-maker", version: 1, puzzles: [p, p] };
  const imported = validateBackup(backup);
  assert.notEqual(imported[0].id, imported[1].id);
  assert.equal(imported[0].options.size, "a4");
  assert.throws(() => validateBackup({ puzzles: [p] }));
  assert.throws(() =>
    validateBackup({ ...backup, puzzles: [{ ...p, entries: [{}] }] }),
  );
});
