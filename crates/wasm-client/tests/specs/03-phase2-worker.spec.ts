import { test, expect } from '../fixtures/test-env';

// Test credentials
const HOMESERVER = 'http://127.0.0.1:8008';
const USER_TOKEN = 'rebThMyActp7kVrKWdieRERisXk4eVCx';
const USER_ID = '@testuser1:localhost';
const USER_DEVICE = 'gRkl8X8rgE';
const TEST_ROOM = '!p0ueSwhzmZRGn---n0g8ee-RhKyyNAmEjT6KeBnXe-Q';

// Helper to call the SharedWorker via the test harness page
class WorkerHelper {
    constructor(private page: any) {}

    async call(method: string, params: any = {}) {
        return this.page.evaluate(
            ([m, p]) => (window as any).__workerCall(m, p),
            [method, params]
        );
    }

    async getEvents() {
        return this.page.evaluate(() => (window as any).__workerEvents || []);
    }

    async waitForReady() {
        await this.page.waitForFunction(
            () => {
                const status = document.getElementById('status')?.textContent;
                return status === 'ready' || status === 'ready_timeout';
            },
            { timeout: 10000 }
        );
    }
}

test.describe('Phase 2 - SharedWorker Message Router', () => {

    test('SharedWorker loads and becomes ready', async ({ page }) => {
        await page.goto('/crates/wasm-client/tests/harness/worker-test.html');
        const helper = new WorkerHelper(page);
        await helper.waitForReady();

        // Verify WASM was loaded in the worker
        const result = await helper.call('loadWasm');
        expect(result.ok).toBe(true);
    });

    test('connect and login via SharedWorker', async ({ page }) => {
        await page.goto('/crates/wasm-client/tests/harness/worker-test.html');
        const helper = new WorkerHelper(page);
        await helper.waitForReady();

        // Connect
        const conn = await helper.call('connect', { homeserverUrl: HOMESERVER });
        expect(conn.ok).toBe(true);

        // Login
        const login = await helper.call('login', {
            accessToken: USER_TOKEN,
            userId: USER_ID,
            deviceId: USER_DEVICE,
        });
        expect(login.ok).toBe(true);

        // Check session
        const session = await helper.call('getSession');
        expect(session.isLoggedIn).toBe(true);
    });

    test('get rooms via SharedWorker', async ({ page }) => {
        await page.goto('/crates/wasm-client/tests/harness/worker-test.html');
        const helper = new WorkerHelper(page);
        await helper.waitForReady();

        await helper.call('connect', { homeserverUrl: HOMESERVER });
        await helper.call('login', {
            accessToken: USER_TOKEN,
            userId: USER_ID,
            deviceId: USER_DEVICE,
        });

        const result = await helper.call('getRooms');
        expect(result.ok).toBe(true);
        expect(Array.isArray(result.rooms)).toBe(true);
    });

    test('send a message via SharedWorker', async ({ page }) => {
        await page.goto('/crates/wasm-client/tests/harness/worker-test.html');
        const helper = new WorkerHelper(page);
        await helper.waitForReady();

        await helper.call('connect', { homeserverUrl: HOMESERVER });
        await helper.call('login', {
            accessToken: USER_TOKEN,
            userId: USER_ID,
            deviceId: USER_DEVICE,
        });

        const result = await helper.call('sendMessage', {
            roomId: TEST_ROOM,
            text: 'Hello via SharedWorker!',
        });
        expect(result.ok).toBe(true);
        expect(result.eventId).toBeTruthy();
    });

    test('sync broadcasts events to page', async ({ page }) => {
        await page.goto('/crates/wasm-client/tests/harness/worker-test.html');
        const helper = new WorkerHelper(page);
        await helper.waitForReady();

        await helper.call('connect', { homeserverUrl: HOMESERVER });
        await helper.call('login', {
            accessToken: USER_TOKEN,
            userId: USER_ID,
            deviceId: USER_DEVICE,
        });

        // Start sync
        await helper.call('startSync');

        // Send a message (which will be echoed back via sync)
        await helper.call('sendMessage', {
            roomId: TEST_ROOM,
            text: 'Sync test via SharedWorker ' + Date.now(),
        });

        // Wait for sync events
        await page.waitForTimeout(3000);

        const events = await helper.getEvents();
        console.log(`Received ${events.length} events via SharedWorker broadcast`);
        // Should have received some events (at minimum the message we sent)
        expect(events.length).toBeGreaterThan(0);
    });

    test('logout via SharedWorker', async ({ page }) => {
        await page.goto('/crates/wasm-client/tests/harness/worker-test.html');
        const helper = new WorkerHelper(page);
        await helper.waitForReady();

        await helper.call('connect', { homeserverUrl: HOMESERVER });
        await helper.call('login', {
            accessToken: USER_TOKEN,
            userId: USER_ID,
            deviceId: USER_DEVICE,
        });

        await helper.call('logout');

        const session = await helper.call('getSession');
        expect(session.isLoggedIn).toBe(false);
    });

    test('ping/pong works', async ({ page }) => {
        await page.goto('/crates/wasm-client/tests/harness/worker-test.html');
        const helper = new WorkerHelper(page);
        await helper.waitForReady();

        const result = await helper.call('ping');
        expect(result.pong).toBe(true);
    });
});
