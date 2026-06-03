import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './specs',
    timeout: 60000,
    retries: 0,
    use: {
        baseURL: 'http://localhost:3333',
        headless: true,
    },
    webServer: {
        command: 'python3 -m http.server 3333 --directory ../../..',
        url: 'http://localhost:3333/crates/wasm-client/tests/harness/index.html',
        reuseExistingServer: true,
    },
    globalSetup: './global-setup.ts',
});
