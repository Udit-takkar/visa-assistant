import { expect, test } from "@playwright/test";

test("selected replies become cited evidence only after review, and later context makes them stale", async ({
  page,
  request,
}) => {
  const id = "e2ereview";
  await request.post("/api/sources", {
    data: {
      url: `https://www.reddit.com/r/SchengenVisa/comments/${id}/test/`,
      title: "Synthetic evidence review fixture",
      reason: "Browser test only",
    },
  });
  await request.put(`/api/sources/${id}`, {
    data: {
      body: "Synthetic original post. Applicant visited Switzerland.",
      expectedVersion: 0,
    },
  });
  await page.goto(`/sources/${id}`);
  await page
    .getByLabel("Comment permalink")
    .fill(
      `https://www.reddit.com/r/SchengenVisa/comments/${id}/test/e2ereply/`
    );
  await page
    .getByLabel("Comment author", { exact: true })
    .selectOption("other");
  await page
    .getByLabel("Exact comment text")
    .fill("Synthetic freelancer: I submitted freelance contracts.");
  await page.getByRole("button", { name: "Save comment", exact: true }).click();
  await expect(
    page.getByText("Comment e2ereply · other", { exact: true })
  ).toBeVisible();
  await page.getByLabel("Evidence passage").selectOption("e2ereply");
  await page
    .getByLabel("Reported observation")
    .fill("Another commenter reports submitting freelance contracts.");
  await page
    .getByLabel("Exact supporting quote")
    .fill("I submitted freelance contracts.");
  await page.getByLabel("Country code", { exact: true }).fill("CH");
  await page
    .getByLabel("Applicant profile", { exact: true })
    .selectOption("freelancer");
  await page.getByLabel("Document action").selectOption("submitted");
  await page.getByRole("button", { name: "Save draft observation" }).click();
  await expect(
    page.getByRole("heading", { name: "Review queue · 1" })
  ).toBeVisible();
  const unreviewed = await request.post("/api/chat", {
    data: {
      question: "freelance contracts",
      country: "CH",
      profile: "freelancer",
    },
  });
  expect((await unreviewed.json()).evidence).toEqual([]);
  await page.getByRole("button", { name: "Approve observation" }).click();
  await expect(page.getByText("approved", { exact: true })).toBeVisible();
  const overview = await request.post("/api/chat", { data: { question: "What documents do i need?", country: "CH", profile: "freelancer" } });
  const overviewAnswer = await overview.json();
  expect(overviewAnswer.retrievalKind).toBe("reviewed_text_fallback");
  expect(overviewAnswer.evidence).toHaveLength(1);
  expect(overviewAnswer.message).toContain("partial report");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export thread capture" }).click();
  expect((await downloaded).suggestedFilename()).toBe(`thread-${id}.json`);
  await page.reload();
  await expect(page.getByText("approved", { exact: true })).toBeVisible();
  await page.goto("/assistant");
  await page.getByLabel("Your visa question").fill("freelance contracts");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("log")).toContainText(
    "I submitted freelance contracts."
  );
  await expect(
    page.getByRole("link", {
      name: "Source: Synthetic evidence review fixture",
    })
  ).toHaveAttribute(
    "href",
    `https://www.reddit.com/r/SchengenVisa/comments/${id}/test/e2ereply/`
  );
  await request.put(`/api/sources/${id}`, {
    data: { body: "Synthetic original post corrected.", expectedVersion: 2 },
  });
  await page.getByLabel("Your visa question").fill("freelance contracts");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("log")).toContainText(
    /No matching (passages|captured passages)/
  );
  await page.goto(`/sources/${id}`);
  await expect(
    page.getByText("Stale · excluded", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve observation" })
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});

test("model suggestions are drafts and an invented quote is rejected without saving", async ({
  page,
  request,
}) => {
  const id = "e2emodel";
  await request.post("/api/sources", {
    data: {
      url: `https://www.reddit.com/r/SchengenVisa/comments/${id}/test/`,
      title: "Synthetic model fixture",
      reason: "Test only",
    },
  });
  await request.put(`/api/sources/${id}`, {
    data: { body: "Synthetic insurance report.", expectedVersion: 0 },
  });
  await page.goto(`/sources/${id}`);
  await page.route(`**/api/sources/${id}/extract`, (route) =>
    route.fulfill({
      json: {
        sourceVersion: 1,
        candidates: [
          {
            summary: "Synthetic candidate; needs review.",
            quote: "insurance report",
            country: "unknown",
            profile: "unknown",
            action: "unknown",
          },
        ],
      },
    })
  );
  await page.getByRole("button", { name: "Suggest with Qwen" }).click();
  await page.getByRole("button", { name: /Use candidate 1/ }).click();
  await expect(page.getByLabel("Reported observation")).toHaveValue(
    "Synthetic candidate; needs review."
  );
  await page.getByLabel("Exact supporting quote").fill("invented passage");
  await page.getByRole("button", { name: "Save draft observation" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "exact passage" })
  ).toContainText("exact passage");
  await expect(page.getByLabel("Exact supporting quote")).toHaveValue(
    "invented passage"
  );
  expect(
    (await (await request.get(`/api/sources/${id}/evidence`)).json())
      .observations
  ).toEqual([]);
});
