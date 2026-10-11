import { expect, test as base } from '@playwright/test';
// Serverless headless-shell needs a fresh process for every isolated context.
export const test = process.env.CHROMIUM_EXECUTABLE_PATH
  ? base.extend({
      context: async ({ playwright, launchOptions, baseURL, viewport }, use) => {
        const browser = await playwright.chromium.launch(launchOptions);
        const context = await browser.newContext({ baseURL, viewport: viewport ?? undefined });
        try {
          await use(context);
        } finally {
          await context.close();
          await browser.close();
        }
      },
    })
  : base;
export { expect };
