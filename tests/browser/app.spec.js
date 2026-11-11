import { test, expect } from "@playwright/test";
test("classroom workflow, preferences, persistence, PDF, backup, deletion and responsive layout", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#puzzle-name")).toBeVisible();
  await expect(page.locator('[data-option="name"]')).not.toBeChecked();
  await page.getByRole("button", { name: "Try a vocabulary example" }).click();
  await expect(page.locator("#generation-status")).toContainText("12 of 12", {
    timeout: 15000,
  });
  await expect(page.locator("#pdf")).toBeEnabled();
  await page.locator('[data-option="title"]').check();
  await page.locator('[data-option="name"]').check();
  await page.locator('[data-option="answerLines"]').check();
  await page.locator("#paper").selectOption("a4");
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
  await page.locator("#output-mode").selectOption("both");
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
  await expect(page.locator("#paper")).toHaveValue("a4");
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
  await page.locator("#puzzles").selectOption({ label: "AI vocabulary" });
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
  await page.locator("#example").click();
  await expect(page.locator("#generation-status")).toContainText("12 of 12");
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
  ).toBe("rgb(23, 35, 31)");
  await page.locator("#duplicate").click();
  await expect(page.locator("#puzzle-name")).toHaveValue(
    "AI vocabulary (copy)",
  );
  await expect(page.locator("#generation-status")).toContainText("12 of 12");
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.locator("#output-mode").selectOption("both");
  await page.locator("#print").click();
  await expect(page.locator("#print-pages .print-sheet")).toHaveCount(2);
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: "test-results/browser-print.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen", colorScheme: "light" });
  await page
    .locator('[data-entry="clue"]')
    .first()
    .fill("An unusually long clue. ".repeat(85));
  await expect(page.locator("#issues")).toContainText("cannot fit readably");
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
