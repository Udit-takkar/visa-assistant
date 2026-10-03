import { expect, test } from "@playwright/test";

test("database text is searchable and stale editors keep their unsaved text", async ({
  page,
  context,
  request,
}) => {
  const registered = await request.post("/api/sources", {
    data: {
      url: "https://www.reddit.com/r/SchengenVisa/comments/e2econcur/test/",
      title: "Versioned capture test",
      reason: "Synthetic browser fixture",
    },
  });
  expect(registered.status()).toBe(201);
  const second = await context.newPage();
  await page.goto("/sources/e2econcur");
  await second.goto("/sources/e2econcur");
  await expect(page.getByLabel("Original post text")).toBeVisible();
  await expect(second.getByLabel("Original post text")).toBeVisible();
  await page
    .getByLabel("Original post text")
    .fill("Synthetic record: freelance contracts and insurance.");
  await page.getByRole("button", { name: "Save text" }).click();
  await expect(page.getByRole("status")).toContainText("saved in PostgreSQL");
  await second
    .getByLabel("Original post text")
    .fill("Synthetic stale edit that must remain in the editor.");
  await second.getByRole("button", { name: "Save text" }).click();
  await expect(
    second.getByRole("alert").filter({ hasText: "changed since" }),
  ).toBeVisible();
  await expect(second.getByLabel("Original post text")).toHaveValue(
    "Synthetic stale edit that must remain in the editor.",
  );
  const saved = await request.get("/api/sources/e2econcur");
  expect((await saved.json()).source.body).toBe(
    "Synthetic record: freelance contracts and insurance.",
  );
  await page.getByRole("button", { name: "Load revisions" }).click();
  await expect(page.getByText(/characters · post_only/)).toBeVisible();
  await page.goto("/");
  await page.getByLabel("Search sources").fill("insurance");
  await expect(
    page.getByRole("heading", { name: "Versioned capture test" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Switzerland · VFS Delhi" }),
  ).toHaveCount(0);
  await second.close();
});

test("browser-draft import keeps originals and preserves conflicting database text", async ({
  page,
  request,
}) => {
  const registered = await request.post("/api/sources", {
    data: {
      url: "https://www.reddit.com/r/SchengenVisa/comments/legacy123/test/",
      title: "Legacy conflict fixture",
      reason: "Synthetic migration fixture",
    },
  });
  expect(registered.status()).toBe(201);
  expect(
    (
      await request.put("/api/sources/legacy123", {
        data: { body: "Existing synthetic database text", expectedVersion: 0 },
      })
    ).status(),
  ).toBe(200);
  const drafts = [
    {
      id: "legacy123",
      url: "https://www.reddit.com/r/SchengenVisa/comments/legacy123/test/",
      title: "Legacy conflict fixture",
      reason: "",
      body: "Original synthetic browser draft",
      capturedAt: null,
    },
    {
      id: "legacynew",
      url: "https://www.reddit.com/r/SchengenVisa/comments/legacynew/test/",
      title: "Imported browser fixture",
      reason: "",
      body: "Synthetic imported text",
      capturedAt: null,
    },
  ];
  await page.addInitScript(
    (items) =>
      localStorage.setItem("schengen-sources-v1", JSON.stringify(items)),
    drafts,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Import browser drafts" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Kept existing database text",
  );
  expect(
    (await (await request.get("/api/sources/legacy123")).json()).source.body,
  ).toBe("Existing synthetic database text");
  expect(
    (await (await request.get("/api/sources/legacynew")).json()).source.body,
  ).toBe("Synthetic imported text");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("schengen-sources-v1") || "[]")[0].body,
    ),
  ).toBe("Original synthetic browser draft");
});

test("source routes reject cross-site writes and invalid capture versions", async ({
  request,
}) => {
  const denied = await request.post("/api/sources", {
    headers: { origin: "https://unrelated.example" },
    data: {
      url: "https://www.reddit.com/r/SchengenVisa/comments/unsafe123/test/",
      title: "Should not exist",
      reason: "",
    },
  });
  expect(denied.status()).toBe(403);
  const invalid = await request.put("/api/sources/1u9i3ts", {
    data: { body: "Synthetic invalid capture", expectedVersion: -1 },
  });
  expect(invalid.status()).toBe(400);
  expect((await request.get("/api/sources/unsafe123")).status()).toBe(404);
});
