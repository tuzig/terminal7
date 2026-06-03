/* Terminal 7 Fingerprint idempotency tests
 *
 *  Copyright: (c) 2025 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Terminal7 } from "../src/terminal7";

describe("getFingerprint idempotency", () => {
    let t: Terminal7;

    beforeEach(() => {
        t = new Terminal7();
    });

    it("caches the in-flight promise so concurrent callers share it", async () => {
        let callCount = 0;
        // Stub _getFingerprint to count calls and resolve after a delay
        t._getFingerprint = vi.fn(() => {
            callCount++;
            return new Promise<string>((resolve) =>
                setTimeout(() => resolve("DEADBEEF"), 50),
            );
        });

        // Call getFingerprint three times concurrently
        const [fp1, fp2, fp3] = await Promise.all([
            t.getFingerprint(),
            t.getFingerprint(),
            t.getFingerprint(),
        ]);

        expect(fp1).toBe("DEADBEEF");
        expect(fp2).toBe("DEADBEEF");
        expect(fp3).toBe("DEADBEEF");
        // _getFingerprint should have been called only once
        expect(callCount).toBe(1);
    });

    it("clears the cached promise after settling, allowing retries", async () => {
        let callCount = 0;
        t._getFingerprint = vi.fn(() => {
            callCount++;
            if (callCount === 1) {
                return new Promise<string>((_, reject) =>
                    setTimeout(
                        () => reject(new Error("generation failed")),
                        10,
                    ),
                );
            }
            return new Promise<string>((resolve) =>
                setTimeout(() => resolve("CAFEBABE"), 10),
            );
        });

        // First call should fail - catch to avoid unhandled rejection
        await expect(t.getFingerprint()).rejects.toThrow("generation failed");
        expect(callCount).toBe(1);

        // After failure, the cached promise is cleared, so a new call is allowed
        const fp = await t.getFingerprint();
        expect(fp).toBe("CAFEBABE");
        expect(callCount).toBe(2);
    });

    it("returns the same promise object for concurrent callers", async () => {
        t._getFingerprint = vi.fn(
            () =>
                new Promise<string>((resolve) =>
                    setTimeout(() => resolve("SHARED"), 20),
                ),
        );

        const p1 = t.getFingerprint();
        const p2 = t.getFingerprint();
        expect(p1).toBe(p2);

        const [fp1, fp2] = await Promise.all([p1, p2]);
        expect(fp1).toBe("SHARED");
        expect(fp2).toBe("SHARED");
    });
});
