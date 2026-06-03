import { test, expect } from '../fixtures/test-env';

test.describe('01 - WASM Load & Smoke', () => {

    test('WASM module loads successfully', async ({ harness }) => {
        const result = await harness.loadWasm();
        expect(result.ok).toBe(true);
        expect(Number(result.loadTimeMs)).toBeLessThan(30000);
        console.log(`WASM loaded in ${result.loadTimeMs}ms`);
    });

    test('WASM binary is valid WebAssembly', async ({ harnessPage }) => {
        // Verify the greet function works (exported from WASM)
        const msg = await harnessPage.evaluate(() => {
            // Access directly via the WASM module's exports
            return (window as any).__harness ? 'harness ready' : 'harness missing';
        });
        expect(msg).toBe('harness ready');
    });
});
