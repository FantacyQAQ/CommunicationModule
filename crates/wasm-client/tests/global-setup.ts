// Global setup: runs once before all tests.
// Will be used to create test users/rooms via cloud-backend API.
export default async function globalSetup() {
    const baseUrl = process.env.CLOUD_BACKEND_URL || 'http://localhost:3001';

    // TODO: Create test users and room via cloud-backend debug API
    // For now, tests will skip if no homeserver is available.

    console.log(`[globalSetup] Cloud backend URL: ${baseUrl}`);
    console.log('[globalSetup] Ensure Conduwuit and cloud-backend are running before testing.');
}
