// Helper to interact with the test harness page via Playwright
import type { Page } from '@playwright/test';

export class HarnessHelper {
    constructor(private page: Page) {}

    async loadWasm() {
        return this.page.evaluate(() => (window as any).__harness.loadWasm());
    }
    async connect(url: string) {
        return this.page.evaluate((u) => (window as any).__harness.connect(u), url);
    }
    async login(accessToken: string, userId: string, deviceId: string) {
        return this.page.evaluate(
            ([t, u, d]) => (window as any).__harness.login(t, u, d),
            [accessToken, userId, deviceId]
        );
    }
    async logout() {
        return this.page.evaluate(() => (window as any).__harness.logout());
    }
    async startSync() {
        return this.page.evaluate(() => (window as any).__harness.startSync());
    }
    async stopSync() {
        return this.page.evaluate(() => (window as any).__harness.stopSync());
    }
    async getEvents(sinceIndex = 0) {
        return this.page.evaluate(
            (i) => (window as any).__harness.getEvents(i), sinceIndex
        );
    }
    async waitForEvent(type: string, timeoutMs = 10000) {
        return this.page.evaluate(
            ({ t, ms }) => (window as any).__harness.waitForEvent(t, ms),
            { t: type, ms: timeoutMs }
        );
    }
    async getRooms() {
        return this.page.evaluate(() => (window as any).__harness.getRooms());
    }
    async joinRoom(roomId: string) {
        return this.page.evaluate(
            (id) => (window as any).__harness.joinRoom(id), roomId
        );
    }
    async sendMessage(roomId: string, text: string) {
        return this.page.evaluate(
            ({ r, t }) => (window as any).__harness.sendMessage(r, t),
            { r: roomId, t: text }
        );
    }
    async getMessages(roomId: string, limit = 20) {
        return this.page.evaluate(
            ({ r, l }) => (window as any).__harness.getMessages(r, l),
            { r: roomId, l: limit }
        );
    }
    async getCryptoStatus() {
        return this.page.evaluate(() => (window as any).__harness.getCryptoStatus());
    }
    async getSessionInfo() {
        return this.page.evaluate(() => (window as any).__harness.getSessionInfo());
    }
}
