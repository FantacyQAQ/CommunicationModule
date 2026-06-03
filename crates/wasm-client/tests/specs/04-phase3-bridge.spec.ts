import { test, expect } from '../fixtures/test-env';
import { getTestCreds } from '../helpers/test-creds';

test.describe('Phase 3 - Bridge CLI Test', () => {

    test('CLI page loads and shows help', async ({ page }) => {
        await page.goto('/crates/wasm-client/bridge/cli-test.html');
        await page.waitForSelector('#status');
        const status = await page.textContent('#status');
        expect(status).toContain('OFFLINE');
    });

    test('bridge init via CLI works', async ({ page }) => {
        const creds = getTestCreds();
        // Inject credentials via a script tag that runs before the main module
        await page.addInitScript(`
            window.__testCreds = ${JSON.stringify(creds)};
        `);
        await page.goto('/crates/wasm-client/bridge/cli-test.html');
        await page.waitForSelector('#cmd-input');

        await page.fill('#cmd-input', 'init');
        await page.press('#cmd-input', 'Enter');
        await page.waitForFunction(
            () => document.getElementById('status')?.textContent === 'ONLINE',
            { timeout: 30000 }
        );
        expect(await page.textContent('#status')).toBe('ONLINE');
    });

    test('bridge login via CLI works', async ({ page }) => {
        const creds = getTestCreds();
        await page.addInitScript(`window.__testCreds = ${JSON.stringify(creds)};`);
        await page.goto('/crates/wasm-client/bridge/cli-test.html');
        await page.waitForSelector('#cmd-input');

        await page.fill('#cmd-input', 'init');
        await page.press('#cmd-input', 'Enter');
        await page.waitForFunction(
            () => document.getElementById('status')?.textContent === 'ONLINE',
            { timeout: 30000 }
        );

        await page.fill('#cmd-input', 'login');
        await page.press('#cmd-input', 'Enter');
        await page.waitForFunction(
            () => (document.getElementById('output')?.textContent || '').includes('Logged in'),
            { timeout: 30000 }
        );
        expect(await page.textContent('#output')).toContain('Logged in');
    });

    test('bridge rooms via CLI works', async ({ page }) => {
        const creds = getTestCreds();
        await page.addInitScript(`window.__testCreds = ${JSON.stringify(creds)};`);
        await page.goto('/crates/wasm-client/bridge/cli-test.html');
        await page.waitForSelector('#cmd-input');

        await page.fill('#cmd-input', 'init');
        await page.press('#cmd-input', 'Enter');
        await page.waitForFunction(
            () => document.getElementById('status')?.textContent === 'ONLINE',
            { timeout: 30000 }
        );
        await page.fill('#cmd-input', 'login');
        await page.press('#cmd-input', 'Enter');
        await page.waitForFunction(
            () => (document.getElementById('output')?.textContent || '').includes('Logged in'),
            { timeout: 30000 }
        );

        await page.fill('#cmd-input', 'rooms');
        await page.press('#cmd-input', 'Enter');
        await page.waitForFunction(
            () => (document.getElementById('output')?.textContent || '').includes('rooms'),
            { timeout: 15000 }
        );
        expect(await page.textContent('#output')).toContain('rooms');
    });

    test('bridge auto test via CLI', async ({ page }) => {
        const creds = getTestCreds();
        await page.addInitScript(`window.__testCreds = ${JSON.stringify(creds)};`);
        await page.goto('/crates/wasm-client/bridge/cli-test.html');
        await page.waitForSelector('#cmd-input');

        await page.fill('#cmd-input', 'test');
        await page.press('#cmd-input', 'Enter');
        await page.waitForFunction(
            () => (document.getElementById('output')?.textContent || '').includes('PASSED'),
            { timeout: 60000 }
        );

        const output = await page.textContent('#output');
        expect(output).toContain('PASSED');
        expect(output).toContain('init OK');
        expect(output).toContain('login OK');
        expect(output).toContain('getRooms OK');
        expect(output).toContain('sendMessage OK');
    });
});
