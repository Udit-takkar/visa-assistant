import { test, expect } from "@playwright/test";
test("empty assistant explains pending review and links to the source", async ({ page, request }) => {
  const id = "pendingreview";
  await request.post("/api/sources", { data: { url: `https://www.reddit.com/r/SchengenVisa/comments/${id}/test/`, title: "Synthetic pending review", reason: "Browser test only" } });
  await request.put(`/api/sources/${id}`, { data: { expectedVersion: 0, body: "Synthetic report: I submitted bank statements." } });
  await request.post(`/api/sources/${id}/evidence`, { data: { operation: "observation", sourceVersion: 1, commentId: "", summary: "The author submitted bank statements.", quote: "I submitted bank statements.", country: "CH", profile: "unknown", action: "submitted" } });
  await page.goto("/assistant");
  await page.getByLabel("Your visa question").fill("What documents do i need?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("log")).toContainText("draft summaries");
  await expect(page.getByRole("log")).toContainText("describe your destination");
  const reviewLink = page.getByRole("link", { name: "Review Synthetic pending review" });
  await expect(reviewLink).toHaveAttribute("href", `/sources/${id}`);
  await reviewLink.click();
  await expect(page.getByRole("heading", { name: "Review queue · 1" })).toBeVisible();
});
