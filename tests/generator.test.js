import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generate,
  canPlace,
  cellsFor,
  validateEntries,
  disconnectedGroups,
} from "../src/generator.js";
import { parseBulk, validateBackup } from "../src/storage.js";
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

test("bulk paste accepts comma pairs and spreadsheet columns without losing clue punctuation", () => {
  const pairs = parseBulk(
    "PLANET, A world orbiting a star\nOCEAN, A large body of salt water",
  );
  assert.deepEqual(
    pairs.map(({ answer, clue }) => [answer, clue]),
    [
      ["PLANET", "A world orbiting a star"],
      ["OCEAN", "A large body of salt water"],
    ],
  );
  const mixed = parseBulk(
    'cat\tA feline, often a pet\n"DOG", "A loyal, ""friendly"" animal"',
  );
  assert.equal(mixed[0].answer, "CAT");
  assert.equal(mixed[0].clue, "A feline, often a pet");
  assert.equal(mixed[1].clue, 'A loyal, "friendly" animal');
  assert.throws(
    () => parseBulk("CAT\nDOG, A canine"),
    /Row 1: separate the answer and clue/,
  );
  assert.throws(() => parseBulk("CAT, "), /add both/);
  assert.throws(
    () => parseBulk("CAT\tA feline\textra"),
    /two spreadsheet columns/,
  );
  assert.deepEqual(parseBulk(" \n"), []);
});

test("bulk paste accepts one or more spaces and mixed-case answers", () => {
  const rows = parseBulk(
    "planet A world orbiting a star\noCeAn    A large body of salt water\ncat A feline, often a pet\nDoG, A canine\nbird\tA flying animal",
  );
  assert.deepEqual(
    rows.map((e) => e.answer),
    ["PLANET", "OCEAN", "CAT", "DOG", "BIRD"],
  );
  assert.equal(rows[2].clue, "A feline, often a pet");
  assert.equal(rows[1].clue, "A large body of salt water");
});

test("dense search reconstructs a checked grid with adjacent words and order-independent validation", async () => {
  const { generateDense } = await import("../src/dense-generator.js");
  const { isValidLayout, bounds } = await import("../src/generator.js");
  // Synthetic letter rows/columns, not vocabulary or clues from a user puzzle.
  const input = entries([
    "ABCDE",
    "FGHIJ",
    "KLMNO",
    "PQRST",
    "UVWXY",
    "AFKPU",
    "BGLQV",
    "CHMRW",
    "DINSX",
    "EJOTY",
  ]);
  const result = generateDense(input, { budget: 500 });
  assert.ok(result);
  assert.equal(result.length, input.length);
  assert.equal(bounds(result).width, 5);
  assert.equal(bounds(result).height, 5);
  assert.ok(isValidLayout(result));
  assert.ok(isValidLayout([...result].reverse()));
  assert.equal(cellsFor(result).size, 25);
  assert.ok([...cellsFor(result).values()].every((c) => c.across && c.down));
  assert.equal(generateDense(input.slice(1), { budget: 50 }), null);
  assert.equal(
    isValidLayout([
      { answer: "CAT", x: 0, y: 0, dir: "across" },
      { answer: "DOG", x: 0, y: 1, dir: "across" },
    ]),
    false,
  );
});
