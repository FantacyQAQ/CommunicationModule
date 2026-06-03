// Global setup: runs once before all tests.
// Automatically creates test users and a test room on the Matrix homeserver.
// Credentials are written to a JSON file that tests load dynamically.

import fs from 'fs';
import path from 'path';

const HOMESERVER_URL = process.env.HOMESERVER_URL || 'http://127.0.0.1:8008';
const OUTPUT_FILE = path.resolve(import.meta.dirname, '.test-creds.json');

interface TestCreds {
    homeserverUrl: string;
    user1: { token: string; userId: string; deviceId: string };
    user2: { token: string; userId: string; deviceId: string };
    roomId: string;
}

async function apiCall(method: string, endpoint: string, body?: any, token?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${HOMESERVER_URL}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${endpoint}: ${res.status} ${text.slice(0, 200)}`);
    }
    return res.json();
}

async function registerUser(username: string, password: string) {
    const resp = await apiCall('POST', '/_matrix/client/v3/register', {
        username,
        password,
        auth: { type: 'm.login.dummy' },
    });
    return {
        token: resp.access_token as string,
        userId: resp.user_id as string,
        deviceId: resp.device_id as string,
    };
}

async function loginUser(username: string, password: string) {
    const resp = await apiCall('POST', '/_matrix/client/v3/login', {
        type: 'm.login.password',
        identifier: { type: 'm.id.user', user: username },
        password,
    });
    return {
        token: resp.access_token as string,
        userId: resp.user_id as string,
        deviceId: resp.device_id as string,
    };
}

export default async function globalSetup() {
    console.log(`[globalSetup] Homeserver: ${HOMESERVER_URL}`);

    try {
        // Check if homeserver is reachable
        await fetch(`${HOMESERVER_URL}/_matrix/client/versions`);
    } catch {
        console.error('[globalSetup] ERROR: Matrix homeserver not reachable. Start Conduit first.');
        console.error('[globalSetup]   podman compose up -d');
        process.exit(1);
    }

    const PASSWORD = 'testpass123';

    // Try to register fresh users. If they already exist, login instead.
    let user1, user2;
    try {
        user1 = await registerUser('testuser1', PASSWORD);
        console.log(`[globalSetup] Registered testuser1: ${user1.userId}`);
    } catch (e: any) {
        if (e.message?.includes('400') || e.message?.includes('M_USER_IN_USE')) {
            user1 = await loginUser('testuser1', PASSWORD);
            console.log(`[globalSetup] Logged in testuser1: ${user1.userId}`);
        } else {
            throw e;
        }
    }

    try {
        user2 = await registerUser('testuser2', PASSWORD);
        console.log(`[globalSetup] Registered testuser2: ${user2.userId}`);
    } catch (e: any) {
        if (e.message?.includes('400') || e.message?.includes('M_USER_IN_USE')) {
            user2 = await loginUser('testuser2', PASSWORD);
            console.log(`[globalSetup] Logged in testuser2: ${user2.userId}`);
        } else {
            throw e;
        }
    }

    // Create a test room as user1 and invite user2
    const roomResp = await apiCall('POST', '/_matrix/client/v3/createRoom', {
        name: 'Test Chat Room',
        topic: 'P1 integration test',
    }, user1.token);

    const roomId = roomResp.room_id as string;
    console.log(`[globalSetup] Created room: ${roomId}`);

    await apiCall('POST', `/_matrix/client/v3/rooms/${roomId}/invite`, {
        user_id: user2.userId,
    }, user1.token);

    await apiCall('POST', `/_matrix/client/v3/rooms/${roomId}/join`, {}, user2.token);

    // Send a seed message
    await apiCall('PUT',
        `/_matrix/client/v3/rooms/${roomId}/send/m.room.message/${Date.now()}`,
        { msgtype: 'm.text', body: 'Room created by test setup.' },
        user1.token
    );

    // Write credentials
    const creds: TestCreds = {
        homeserverUrl: HOMESERVER_URL,
        user1,
        user2,
        roomId,
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(creds, null, 2));
    console.log(`[globalSetup] Credentials saved to ${OUTPUT_FILE}`);
    console.log(`[globalSetup] Room: ${roomId}`);
}
