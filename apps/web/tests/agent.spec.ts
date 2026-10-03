import { test, expect } from "@playwright/test";
test("agent renders cited responses and sends bounded conversation context", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/chat", async route => {
    const input = route.request().postDataJSON();
    expect(input.history).toEqual(calls ? ["What did they carry?"] : []);
    calls++;
    await route.fulfill({ json: {
      message: "Reviewed applicant experiences.",
      statements: [{ text: "This author carried contracts but did not submit them.", evidenceIds: ["fixture"] }],
      evidence: [{ id: "fixture", summary: "Synthetic contract report", quote: "I carried contracts.", url: "https://www.reddit.com/r/SchengenVisa/comments/test/thread/reply/", title: "Synthetic agent source", sourceId: "test", country: "CH", profile: "freelancer", action: "carried", subject: "original_poster" }],
      steps: ["Searched reviewed observations", "Generated a cited Qwen explanation"]
    } });
  });
  await page.goto("/assistant");
  await page.getByLabel("Your visa question").fill("What did they carry?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("log")).toContainText("did not submit them");
  await expect(page.getByRole("link", { name: "[1] Synthetic agent source" })).toHaveAttribute("href", "https://www.reddit.com/r/SchengenVisa/comments/test/thread/reply/");
  await page.getByText("Agent activity", { exact: true }).click();
  await expect(page.getByRole("log")).toContainText("Generated a cited Qwen explanation");
  await page.getByLabel("Your visa question").fill("Did they submit them?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByLabel("Your visa question")).toHaveValue("");
  await expect(page.getByRole("log")).toContainText("Did they submit them?");
  expect(calls).toBe(2);
});

test("typing the next question during inference preserves the draft", async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/chat", async route => {
    await gate;
    await route.fulfill({ json: { message: "Synthetic completed answer", evidence: [] } });
  });
  await page.goto("/assistant");
  await page.getByLabel("Your visa question").fill("First question");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toContainText("First question");
  await page.getByLabel("Your visa question").fill("Next question draft");
  await expect(page.getByRole("status")).toContainText("First question");
  release();
  await expect(page.getByRole("log")).toContainText("Synthetic completed answer");
  await expect(page.getByLabel("Your visa question")).toHaveValue("Next question draft");
});
