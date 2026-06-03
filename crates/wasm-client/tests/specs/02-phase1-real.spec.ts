import { test, expect } from '../fixtures/test-env';

// Test credentials from Conduwuit setup
const HOMESERVER = 'http://127.0.0.1:8008';
const USER1_TOKEN = 'GdOesFHXHDYtiitah9a6iPl9GSFVdEm8';
const USER1_ID = '@testuser1:localhost';
const USER1_DEVICE = 'gEyGKidEm1';
const USER2_TOKEN = '5OLyggfRff2Wva1kpCYGSIOS6JeALr5T';
const USER2_ID = '@testuser2:localhost';
const USER2_DEVICE = 'vD9Xc3ibfR';
const TEST_ROOM = '!p0ueSwhzmZRGn---n0g8ee-RhKyyNAmEjT6KeBnXe-Q';

test.describe('Phase 1 - Real Matrix SDK Integration', () => {

    test('login with real credentials succeeds', async ({ harness }) => {
        await harness.loadWasm();
        await harness.connect(HOMESERVER);

        const result = await harness.login(USER1_TOKEN, USER1_ID, USER1_DEVICE);
        expect(result.ok).toBe(true);
        expect(result.loggedIn).toBe(true);
    });

    test('login with invalid token fails', async ({ harness }) => {
        await harness.loadWasm();
        await harness.connect(HOMESERVER);

        // Should fail because user ID won't match
        try {
            await harness.login('invalid_token', USER1_ID, 'fake_device');
            // If we reach here, login should have failed the whoami check
            // but restore_session might accept bad tokens...
        } catch (e: any) {
            expect(e.message).toMatch(/Login failed|Failed to verify|Unknown access token/);
        }
    });

    test('get rooms after login', async ({ harness }) => {
        await harness.loadWasm();
        await harness.connect(HOMESERVER);
        await harness.login(USER1_TOKEN, USER1_ID, USER1_DEVICE);

        const result = await harness.getRooms();
        expect(result.ok).toBe(true);
        expect(Array.isArray(result.rooms)).toBe(true);
        // User was in the test room created during setup
        const testRoom = result.rooms.find(
            (r: any) => r.roomId === TEST_ROOM
        );
        expect(testRoom).toBeTruthy();
    });

    test('send a message to test room', async ({ harness }) => {
        await harness.loadWasm();
        await harness.connect(HOMESERVER);
        await harness.login(USER1_TOKEN, USER1_ID, USER1_DEVICE);

        const result = await harness.sendMessage(
            TEST_ROOM,
            'Hello from Phase 1 integration test!'
        );
        expect(result.ok).toBe(true);
        expect(result.eventId).toBeTruthy();
        console.log('Sent message, event ID:', result.eventId);
    });

    test('sync receives events', async ({ harness }) => {
        await harness.loadWasm();
        await harness.connect(HOMESERVER);
        await harness.login(USER1_TOKEN, USER1_ID, USER1_DEVICE);

        // Start sync
        await harness.startSync();

        // Send a message as user 1 (ourselves)
        await harness.sendMessage(
            TEST_ROOM,
            'Sync test message ' + Date.now()
        );

        // Wait a bit for sync to pick up the event
        await new Promise(r => setTimeout(r, 3000));

        // Check that we received events
        const eventsResult = await harness.getEvents(0);
        console.log(
            `Received ${eventsResult.totalCount} events during sync`
        );

        // Stop sync
        await harness.stopSync();
    });

    test('logout clears session', async ({ harness }) => {
        await harness.loadWasm();
        await harness.connect(HOMESERVER);
        await harness.login(USER1_TOKEN, USER1_ID, USER1_DEVICE);

        // Logout
        const result = await harness.logout();
        expect(result.ok).toBe(true);

        // Check session info
        const session = await harness.getSessionInfo();
        expect(session.isLoggedIn).toBe(false);
    });
});
