import { createBdd } from "playwright-bdd";
import { test, expect, sleep } from "./fixtures";

const { When, Then } = createBdd(test);

// --- Certificate rotation steps ---

When("I rotate the certificate", async ({ setupPage: page }) => {
    await page.evaluate(async () => {
        window.certRotation = { generateCalls: 0 };
        const orig = terminal7.generateCertificate.bind(terminal7);
        terminal7.generateCertificate = async () => {
            window.certRotation.generateCalls++;
            return await orig();
        };
        const ok = await terminal7.renewCertificate();
        if (!ok) throw new Error("certificate renewal failed");
    });
    await sleep(200);
});

Then(
    "a fresh certificate is generated only once",
    async ({ setupPage: page }) => {
        const calls = await page.evaluate(
            () => window.certRotation.generateCalls,
        );
        expect(calls).toEqual(1);
    },
);

When("I close the PeerBook connection", async ({ setupPage: page }) => {
    await page.evaluate(() => {
        terminal7.pbClose();
    });
    await sleep(100);
});

When("my certificate is expiring soon", async ({ setupPage: page }) => {
    await page.evaluate(async () => {
        const cert = terminal7.certificates[0];
        // pretend the certificate expires within the 30-day window
        cert.expires = Date.now() + 24 * 60 * 60 * 1000;
        await terminal7.checkAndRenewCertificate();
    });
});

Then("the certificate was not regenerated", async ({ setupPage: page }) => {
    const calls = await page.evaluate(() => window.certRotation.generateCalls);
    expect(calls).toEqual(0);
});
