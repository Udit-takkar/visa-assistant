import { expect, test } from "@playwright/test";

test("capture persists, exports evidence, and does not imply review", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Every useful answer/ })
  ).toBeVisible();
  await page.getByRole("link", { name: /Switzerland · VFS Delhi/ }).click();
  await expect(
    page.getByText("See capture below", { exact: true })
  ).toBeVisible();
  await page
    .getByLabel("Original post text")
    .fill("Synthetic test capture. This is not applicant evidence.");
  await page.getByRole("button", { name: "Save text" }).click();
  await expect(page.getByRole("status")).toContainText("Source text saved");
  await page.reload();
  await expect(page.getByLabel("Original post text")).toHaveValue(
    "Synthetic test capture. This is not applicant evidence."
  );
  await expect(page.getByText("Unreviewed", { exact: true })).toBeVisible();
  await expect(
    page.getByText("See capture below", { exact: true })
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  expect((await download).suggestedFilename()).toBe("reddit-1u9i3ts.json");
});

test("canonical IDs prevent duplicate registration and search filters sources", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Add a source" }).click();
  await page
    .getByLabel("Reddit thread URL")
    .fill(
      "https://old.reddit.com/r/SchengenVisa/comments/1u9i3ts/?utm_source=test"
    );
  await page.getByRole("button", { name: "Save source" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "already in your library" })
  ).toContainText("already in your library");
  await page
    .getByLabel("Reddit thread URL")
    .fill(
      "https://www.reddit.com/r/SchengenVisa/comments/abc123/sample_thread/"
    );
  await page.getByLabel("Display title").fill("Synthetic registration test");
  await page.getByRole("button", { name: "Save source" }).click();
  await page
    .getByRole("textbox", { name: "Search sources" })
    .fill("Synthetic registration");
  await expect(
    page.getByRole("heading", { name: "Synthetic registration test" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Switzerland · VFS Delhi" })
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Synthetic registration test" })
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});

test("evidence assistant abstains when the knowledge bank has no match", async ({
  page,
}) => {
  await page.goto("/assistant");
  await page.getByLabel("Your visa question").fill("unmatchedsynthetictest");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("log")).toContainText(
    /No matching (passages|captured passages)/
  );
  await expect(page.getByRole("log")).toContainText(
    "cannot establish the current official checklist"
  );
});
