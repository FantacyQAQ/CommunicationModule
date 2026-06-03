import { test as base, expect, type Page } from '@playwright/test';
import { HarnessHelper } from '../helpers/matrix-harness';

export { expect };
export const test = base.extend<{
    harnessPage: Page;
    harness: HarnessHelper;
}>({
    harnessPage: async ({ page }, use) => {
        await page.goto('/crates/wasm-client/tests/harness/index.html');
        // Wait for harness to be ready
        await page.waitForFunction(() => (window as any).__harness !== undefined);
        await use(page);
    },
    harness: async ({ harnessPage }, use) => {
        const helper = new HarnessHelper(harnessPage);
        await use(helper);
    },
});
