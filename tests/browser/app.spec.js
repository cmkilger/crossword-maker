import { test, expect } from "@playwright/test";
test("classroom workflow, preferences, persistence, PDF, backup, deletion and responsive layout", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#puzzle-name")).toBeVisible();
  await expect(page.locator('[data-option="name"]')).not.toBeChecked();
  await page.getByRole("button", { name: "Load example" }).click();
  await expect(page.locator("#generation-status")).toContainText("12 of 12", {
    timeout: 15000,
  });
  await expect(page.locator("#pdf")).toBeEnabled();
  await page.locator('[data-option="title"]').check();
  await page.locator('[data-option="name"]').check();
  await page.locator('[data-option="answerLines"]').check();
  await page.locator("#paper").selectOption("legal");
  await page.locator("#theme").selectOption("dark");
  await page.getByRole("button", { name: "Answer key", exact: true }).click();
  await expect(page.locator("#paper-preview")).toContainText("ANSWER KEY");
  const before = await page.locator("#paper-preview").innerHTML();
  await expect(page.locator("#save-status")).toHaveText(
    "Saved in this browser",
  );
  await page.reload();
  await expect(page.locator("#generation-status")).toContainText("12 of 12");
  await page.getByRole("button", { name: "Answer key", exact: true }).click();
  expect(await page.locator("#paper-preview").innerHTML()).toBe(before);
  await expect(page.locator("#theme")).toHaveValue("dark");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#pdf").click();
  const download = await downloadPromise;
  await download.saveAs("test-results/worksheet.pdf");
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const backupPromise = page.waitForEvent("download");
  await page.locator("#export").click();
  const backup = await backupPromise;
  await backup.saveAs("test-results/backup.json");
  await page.locator("#new").click();
  await expect(page.locator('[data-option="name"]')).toBeChecked();
  await expect(page.locator("#paper")).toHaveValue("legal");
  await page.locator("#bulk").click();
  await page.locator("#bulk-input").fill("CAT\tA feline\nACT\tTo perform");
  await page.locator("#bulk-add").click();
  await expect(page.locator("#generation-status")).toContainText("2 of 2");
  await page.locator('[data-entry="answer"]').first().fill("C4T");
  await expect(page.locator("#issues")).toContainText("A–Z");
  await expect(page.locator("#pdf")).toBeDisabled();
  await page.locator('[data-entry="answer"]').first().fill("CAT");
  await expect(page.locator("#generation-status")).toContainText("2 of 2");
  await page.locator("#delete").click();
  await page.getByRole("button", { name: "Keep puzzle" }).click();
  await expect(page.locator('[data-entry="answer"]').first()).toHaveValue(
    "CAT",
  );
  await page.locator("#delete").click();
  const deletedPuzzle = await page.locator("#puzzles").inputValue();
  await page
    .getByRole("button", { name: "Delete puzzle", exact: true })
    .click();
  await expect(page.locator("#puzzles")).not.toHaveValue(deletedPuzzle);
  const keptPuzzle = await page.locator("#puzzles").inputValue();
  await page.locator("#delete").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#delete-dialog")).not.toBeVisible();
  await expect(page.locator("#puzzles")).toHaveValue(keptPuzzle);
  await page.locator("#import-file").setInputFiles("test-results/backup.json");
  await expect(page.locator("#notice")).toContainText("Imported");
  await page.locator("#puzzles").selectOption({ label: "Vocabulary" });
  await expect(page.locator("#generation-status")).toContainText("12 of 12");
  await page.locator("#worksheet").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#pdf")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#theme").selectOption("light");
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("clue completion adds a previously invalid answer to the grid", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator('[data-entry="answer"]').fill("CAT");
  await page.waitForTimeout(2200);
  await page.locator('[data-entry="clue"]').fill("A feline");
  await expect(page.locator("#generation-status")).toContainText("1 of 1");
  await expect(page.locator("#pdf")).toBeEnabled();
});
test("page sizing, long-content warnings, duplicate, system appearance and print geometry", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#puzzle-name").fill("Vocabulary");
  await page.locator("#bulk").click();
  await page
    .locator("#bulk-input")
    .fill(
      "PLANET\tA world\nORBIT\tA path\nSTAR\tA bright sun\nEARTH\tOur planet",
    );
  await page.locator("#bulk-add").click();
  await expect(page.locator("#generation-status")).toContainText("4 of 4");
  await page.locator('[data-option="title"]').check();
  await page.locator('[data-option="name"]').check();
  await page.locator('[data-option="classPeriod"]').check();
  await page.locator('[data-option="date"]').check();
  await page.locator('[data-option="answerLines"]').check();
  for (const size of ["letter", "legal", "a4"]) {
    await page.locator("#paper").selectOption(size);
    await expect(page.locator("#pdf")).toBeEnabled();
    const promise = page.waitForEvent("download");
    await page.locator("#pdf").click();
    const file = await promise;
    await file.saveAs(`test-results/${size}.pdf`);
  }
  await page.locator("#paper").selectOption("letter");
  await page.locator("#theme").selectOption("auto");
  await page.emulateMedia({ colorScheme: "dark" });
  expect(
    await page
      .locator("body")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(32, 33, 36)");
  await page.locator("#duplicate").click();
  await expect(page.locator("#puzzle-name")).toHaveValue("Vocabulary (copy)");
  await expect(page.locator("#generation-status")).toContainText("4 of 4");
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.locator("#print").click();
  await expect(page.locator("#print-pages .print-sheet")).toHaveCount(1);
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: "test-results/browser-print.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen", colorScheme: "light" });
  for (const clue of await page.locator('[data-entry="clue"]').all()) {
    await clue.fill("An unusually long clue. ".repeat(85));
  }
  await expect(page.locator("#issues")).toContainText("cannot fit readably");
  expect(await page.locator("#paper-preview svg rect").count()).toBeGreaterThan(
    1,
  );
  await expect(page.locator("#pdf")).toBeDisabled();
});

test("small crossword fits A5 and incomplete puzzles cannot export", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#bulk").click();
  await page.locator("#bulk-input").fill("CAT\tA feline\nACT\tTo perform");
  await page.locator("#bulk-add").click();
  await expect(page.locator("#generation-status")).toContainText("2 of 2");
  await page.locator("#paper").selectOption("a5");
  await expect(page.locator("#pdf")).toBeEnabled();
  const promise = page.waitForEvent("download");
  await page.locator("#pdf").click();
  const file = await promise;
  await file.saveAs("test-results/a5.pdf");
  await page.locator('[data-entry="answer"]').last().fill("ZZZ");
  await expect(page.locator("#issues")).toContainText("no shared letters");
  await expect(page.locator("#pdf")).toBeDisabled();
});

test("startup controls wait for the worksheet font on slow connections", async ({
  page,
}) => {
  await page.route("**/fonts/NotoSans-Regular.ttf", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await page.goto("./");
  await expect(page.locator("#example")).toBeDisabled();
  await expect(page.locator("#generation-status")).toHaveText(
    "Preparing your workspace…",
  );
  await expect(page.locator("#example")).toBeEnabled();
  await page.locator("#example").click();
  await expect(page.locator("#generation-status")).toContainText("12 of 12");
});

test("compact table and full-page preview fit desktop viewports without page scrolling", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#example").click();
  await expect(page.locator("#pdf")).toBeEnabled();
  await expect(
    page.getByRole("table", { name: "Answers and clues" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(12);
  await expect(page.locator("body")).not.toContainText(
    /A little wordplay|Print a little possibility|Made here/,
  );
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 900, height: 600 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const paper = document
            .querySelector("#paper-preview")
            .getBoundingClientRect();
          const stage = document
            .querySelector(".paper-stage")
            .getBoundingClientRect();
          const output = document.querySelector("#pdf").getBoundingClientRect();
          return (
            paper.width > 0 &&
            paper.top >= stage.top &&
            paper.bottom <= stage.bottom + 1 &&
            paper.left >= stage.left &&
            paper.right <= stage.right + 1 &&
            output.bottom <= innerHeight &&
            document.documentElement.scrollHeight <= innerHeight + 1
          );
        }),
      )
      .toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const { answer, clue } = await page.evaluate(() => ({
    answer: document
      .querySelector('[data-entry="answer"]')
      .getBoundingClientRect()
      .toJSON(),
    clue: document
      .querySelector('[data-entry="clue"]')
      .getBoundingClientRect()
      .toJSON(),
  }));
  expect(Math.abs(answer.y - clue.y)).toBeLessThan(2);
  expect(clue.x).toBeGreaterThan(answer.x + answer.width);
  await page
    .locator('[data-entry="clue"]')
    .first()
    .fill(
      "A longer clue that wraps over multiple lines while staying in the same compact table row.",
    );
  expect(
    await page
      .locator('[data-entry="clue"]')
      .first()
      .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
  ).toBe(true);
  await page.locator("#theme").selectOption("light");
  await page.screenshot({ path: "test-results/compact-light.png" });
  await page.locator("#theme").selectOption("dark");
  await page.screenshot({ path: "test-results/compact-dark.png" });
});

test("example confirmation preserves work and print/PDF follow the selected preview", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator('[data-entry="answer"]').fill("CAT");
  await page.locator('[data-entry="clue"]').fill("A feline");
  const original = await page.locator("#puzzles").inputValue();
  await page.locator("#example").click();
  await expect(page.locator("#example-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator('[data-entry="answer"]')).toHaveValue("CAT");
  await page.locator("#example").click();
  await page
    .locator("#example-dialog")
    .getByRole("button", { name: "Load example", exact: true })
    .click();
  await expect(page.locator("#puzzle-name")).toHaveValue("Vocabulary");
  await expect(
    page.locator(`#puzzles option[value="${original}"]`),
  ).toHaveCount(1);
  await expect(page.locator("#pdf")).toBeEnabled();
  await page.locator("#example").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#example-dialog")).not.toBeVisible();
  await expect(page.locator("#puzzles option")).toHaveCount(2);
  await expect(page.locator("#output-mode")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Remove word 1", exact: true }),
  ).toHaveText("×");
  await page.evaluate(() => {
    window.print = () => {};
  });
  for (const key of [false, true]) {
    await page.locator(key ? "#answer-key" : "#worksheet").click();
    await page.locator("#print").click();
    await expect(page.locator("#print-pages .print-sheet")).toHaveCount(1);
    expect(await page.locator("#print-pages .print-sheet").innerHTML()).toBe(
      await page.locator("#paper-preview").innerHTML(),
    );
    const promise = page.waitForEvent("download");
    await page.locator("#pdf").click();
    const file = await promise;
    expect(file.suggestedFilename()).toBe(
      key ? "Vocabulary-key.pdf" : "Vocabulary.pdf",
    );
    await file.saveAs(
      `test-results/current-preview-${key ? "key" : "worksheet"}.pdf`,
    );
  }
});

test("populated row removal confirms, while empty and bulk rows follow selection rules", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Remove word 1", exact: true })
    .click();
  await expect(page.locator("#entries tr")).toHaveCount(0);
  await expect(page.locator("#remove-dialog")).not.toBeVisible();
  await page.locator("#add").click();
  await expect(page.locator('[data-entry="answer"]').first()).toBeFocused();
  await page.locator('[data-entry="answer"]').fill("CAT");
  await page.locator('[data-entry="clue"]').fill("A feline");
  await page
    .getByRole("button", { name: "Remove word 1", exact: true })
    .click();
  await expect(page.locator("#remove-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep rows", exact: true }).click();
  await expect(page.locator('[data-entry="answer"]')).toHaveValue("CAT");
  await page.locator("#add").click();
  await page.locator("#select-all").check();
  await expect(page.locator("#remove-selected")).toHaveText(
    "Remove selected (2)",
  );
  await page
    .getByRole("checkbox", { name: "Select row 2", exact: true })
    .uncheck();
  expect(
    await page.locator("#select-all").evaluate((el) => el.indeterminate),
  ).toBe(true);
  await page.locator("#remove-selected").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#remove-dialog")).not.toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Select row 1", exact: true }),
  ).toBeChecked();
  await page.locator("#select-all").check();
  await page.locator("#remove-selected").click();
  await expect(page.locator("#remove-heading")).toHaveText("Remove 2 rows?");
  await page
    .locator("#remove-dialog")
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await expect(page.locator("#entries tr")).toHaveCount(0);
  await expect(page.locator("#remove-selected")).toBeDisabled();
  await page.locator("#add").click();
  await page.locator('[data-entry="clue"]').fill("A clue without an answer");
  await page
    .getByRole("button", { name: "Remove word 1", exact: true })
    .click();
  await expect(page.locator("#remove-dialog")).toBeVisible();
});

test("bulk paste accepts the typed comma-separated example and preserves clue commas", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#bulk").click();
  await expect(page.locator("#bulk-dialog")).toContainText("ANSWER, clue");
  await page
    .locator("#bulk-input")
    .fill(
      "planet, A world orbiting a star\noCeAn, A large body of salt water\ncat   A feline, often a pet\ndog A canine",
    );
  await page.locator("#bulk-add").click();
  await expect(page.locator("#bulk-dialog")).not.toBeVisible();
  await expect(page.locator('[data-entry="answer"]')).toHaveCount(4);
  expect(
    await page
      .locator('[data-entry="answer"]')
      .evaluateAll((elements) => elements.map((el) => el.value)),
  ).toEqual(["PLANET", "OCEAN", "CAT", "DOG"]);
  await expect(page.locator('[data-entry="clue"]').nth(2)).toHaveValue(
    "A feline, often a pet",
  );
});

test("dense neighboring words retain their layout after reopening", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#bulk").click();
  const words = [
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
  ];
  await page
    .locator("#bulk-input")
    .fill(
      words.map((word, i) => `${word}, Synthetic clue ${i + 1}`).join("\n"),
    );
  await page.locator("#bulk-add").click();
  await expect(page.locator("#generation-status")).toContainText(
    "10 of 10 words placed · 5 × 5 grid",
  );
  const before = await page.locator("#paper-preview").innerHTML();
  await expect(page.locator("#save-status")).toHaveText(
    "Saved in this browser",
  );
  await page.reload();
  await expect(page.locator("#generation-status")).toContainText(
    "10 of 10 words placed · 5 × 5 grid",
  );
  expect(await page.locator("#paper-preview").innerHTML()).toBe(before);
  await expect(page.locator("#pdf")).toBeEnabled();
});

test("Import opens a native chooser and reports successful or invalid files", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator("#import-file")).toBeEnabled();
  const backup = {
    format: "crossword-maker",
    version: 1,
    puzzles: [
      {
        name: "Restored puzzle",
        title: "",
        options: {},
        entries: [{ id: "test-word", answer: "CAT", clue: "A feline" }],
        layout: null,
      },
    ],
  };
  const choose = async (file) => {
    const pending = page.waitForEvent("filechooser");
    await page.locator("#import").click();
    await (await pending).setFiles(file);
  };
  await choose({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator("#notice")).toContainText("Imported 1 puzzle");
  await expect(page.locator("#puzzle-name")).toHaveValue("Restored puzzle");
  await expect(page.locator("#puzzles option")).toHaveCount(2);
  await choose({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{broken"),
  });
  await expect(page.locator("#notice")).toContainText(
    "Could not import backup",
  );
  await expect(page.locator("#puzzle-name")).toHaveValue("Restored puzzle");
  await expect(page.locator("#import-file")).toBeEnabled();
  await choose({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator("#puzzles option")).toHaveCount(3);
});
