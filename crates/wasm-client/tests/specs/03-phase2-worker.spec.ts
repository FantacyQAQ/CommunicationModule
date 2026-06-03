import { test, expect } from '../fixtures/test-env';
import { getTestCreds } from '../helpers/test-creds';

test.describe('Phase 2 - SharedWorker Message Router', () => {

    test('SharedWorker loads and becomes ready', async ({ page }) => {
        await page.goto('/crates/wasm-client/tests/harness/worker-test.html');
        const helper = new WorkerHelper(page);
        await helper.waitForReady();
        const result = await helper.call('loadWasm');
        expect(result.ok).toBe(true);
    });

    test('connect and login via SharedWorker', async ({ page }) => {
        const creds = getTestCreds();
        await page.goto('/crates/wasm-client/tests/harness/worker-test.html');
        const helper = new WorkerHelper(page);
        await helper.waitForReady();

        const conn = await helper.call('connect', { homeserverUrl: creds.homeserverUrl });
        expect(conn.ok).toBe(true);

        const login = await helper.call('login', {
            accessToken: creds.user1.token,
            userId: creds.user1.userId,
            deviceId: creds.user1.deviceId,
        });
        expect(login.ok).toBe(true);

        const session = await helper.call('getSession');
        expect(session.isLoggedIn).toBe(true);
    });

    test('get rooms via SharedWorker', async ({ page }) => {
        const creds = getTestCreds();
        await page.goto('/crates/wasm-client/tests/harness/worker-test.html');
        const helper = new WorkerHelper(page);
        await helper.waitForReady();

        await helper.call('connect', { homeserverUrl: creds.homeserverUrl });
        await helper.call('login', {
            accessToken: creds.user1.token,
            userId: creds.user1.userId,
            deviceId: creds.user1.deviceId,
        });

        const result = await helper.call('getRooms');
        expect(result.ok).toBe(true);
        expect(Array.isArray(result.rooms)).toBe(true);
    });

    test('send a message via SharedWorker', async ({ page }) => {
        const creds = getTestCreds();
        await page.goto('/crates/wasm-client/tests/harness/worker-test.html');
        const helper = new WorkerHelper(page);
        await helper.waitForReady();

        await helper.call('connect', { homeserverUrl: creds.homeserverUrl });
        await helper.call('login', {
            accessToken: creds.user1.token,
            userId: creds.user1.userId,
            deviceId: creds.user1.deviceId,
        });

        const result = await helper.call('sendMessage', {
            roomId: creds.roomId,
            text: 'Hello via SharedWorker!',
        });
        expect(result.ok).toBe(true);
        expect(result.eventId).toBeTruthy();
    });

    test('sync broadcasts events to page', async ({ page }) => {
        const creds = getTestCreds();
        await page.goto('/crates/wasm-client/tests/harness/worker-test.html');
        const helper = new WorkerHelper(page);
        await helper.waitForReady();

        await helper.call('connect', { homeserverUrl: creds.homeserverUrl });
        await helper.call('login', {
            accessToken: creds.user1.token,
            userId: creds.user1.userId,
            deviceId: creds.user1.deviceId,
        });

        await helper.call('startSync');
        await helper.call('sendMessage', {
            roomId: creds.roomId,
            text: 'Sync test via SharedWorker ' + Date.now(),
        });
        await page.waitForTimeout(3000);

        const events = await helper.getEvents();
        console.log(`Received ${events.length} events via SharedWorker broadcast`);
        expect(events.length).toBeGreaterThan(0);
    });

    test('logout via SharedWorker', async ({ page }) => {
        const creds = getTestCreds();
        await page.goto('/crates/wasm-client/tests/harness/worker-test.html');
        const helper = new WorkerHelper(page);
        await helper.waitForReady();

        // Use user2 for logout to avoid invalidating user1's shared token
        await helper.call('connect', { homeserverUrl: creds.homeserverUrl });
        await helper.call('login', {
            accessToken: creds.user2.token,
            userId: creds.user2.userId,
            deviceId: creds.user2.deviceId,
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

// Helper — duplicated here to keep this spec self-contained
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
            { timeout: 15000 }
        );
    }
}
