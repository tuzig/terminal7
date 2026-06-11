import { vi, describe, beforeEach, afterEach, it, expect } from "vitest";
import { Terminal7Mock, sleep } from "./infra";
import { Preferences } from "@capacitor/preferences";

vi.mock("xterm");
vi.mock("@revenuecat/purchases-capacitor");
vi.mock("../src/webrtc_session.ts");
vi.mock("../src/ssh_session.ts");
vi.mock("@capacitor-community/native-audio");
vi.mock("@capacitor/network", () => ({
    Network: {
        getStatus: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    },
}));

import { Network } from "@capacitor/network";

describe("recoverActiveGate", () => {
    let t, e;

    beforeEach(async () => {
        await Preferences.clear();
        t = new Terminal7Mock();
        e = document.getElementById("t7");
        terminal7 = t;
        t.open(e);
    });

    afterEach(() => {
        t.clearTimeouts();
        t.gates = [];
        t.autoReconnect = false;
        t.recoveryScheduled = false;
    });

    it("returns immediately when autoReconnect is false", async () => {
        const gate = t.addGate();
        gate.open(e);
        gate.boarding = true;
        gate.wasSSH = false;
        gate.reconnectCount = 0;
        t.activeG = gate;
        t.autoReconnect = false;

        const reconnectSpy = vi.fn();
        gate.reconnect = reconnectSpy;

        await t.recoverActiveGate();

        expect(reconnectSpy).not.toHaveBeenCalled();
    });

    it("proceeds with reconnect when autoReconnect is true", async () => {
        const gate = t.addGate();
        gate.open(e);
        gate.boarding = true;
        gate.wasSSH = false;
        gate.reconnectCount = 0;
        t.activeG = gate;
        t.autoReconnect = true;

        gate.reconnect = vi.fn().mockResolvedValue(undefined);

        await t.recoverActiveGate();

        expect(gate.reconnect).toHaveBeenCalledOnce();
    });

    it("prevents double reconnection: second call is a no-op after exitAutoReconnect", async () => {
        const gate = t.addGate();
        gate.open(e);
        gate.boarding = true;
        gate.wasSSH = false;
        gate.reconnectCount = 0;
        t.activeG = gate;
        t.autoReconnect = true;

        // First call succeeds and calls exitAutoReconnect (sets autoReconnect = false)
        gate.reconnect = vi.fn().mockImplementation(async () => {
            t.exitAutoReconnect();
        });

        await t.recoverActiveGate();
        expect(gate.reconnect).toHaveBeenCalledOnce();

        // Second call should be a no-op since autoReconnect is now false
        await t.recoverActiveGate();
        expect(gate.reconnect).toHaveBeenCalledOnce();
    });
});

describe("scheduleRecovery debounce callback", () => {
    let t, e;

    beforeEach(async () => {
        await Preferences.clear();
        t = new Terminal7Mock();
        e = document.getElementById("t7");
        terminal7 = t;
        t.open(e);
    });

    afterEach(() => {
        t.clearTimeouts();
        t.gates = [];
        t.autoReconnect = false;
        t.recoveryScheduled = false;
    });

    it("skips recoverActiveGate when autoReconnect is false after debounce", async () => {
        const gate = t.addGate();
        gate.open(e);
        gate.boarding = true;
        gate.wasSSH = false;
        gate.reconnectCount = 0;
        t.activeG = gate;
        t.autoReconnect = true;
        t.recoveryScheduled = false;

        const reconnectSpy = vi.fn().mockResolvedValue(undefined);
        gate.reconnect = reconnectSpy;

        // Mock Network.getStatus to return connected
        vi.spyOn(Network, "getStatus").mockResolvedValue({
            connected: true,
            connectionType: "wifi",
        });

        // Mock startWatchdog to resolve immediately
        vi.spyOn(t.map.shell, "startWatchdog").mockResolvedValue(undefined);

        t.scheduleRecovery();

        // Simulate exitAutoReconnect being called before the 200ms debounce fires
        // (e.g. by updateNetworkStatus → recoverActiveGate → exitAutoReconnect)
        t.autoReconnect = false;

        // Wait for the 200ms debounce callback
        await sleep(250);

        expect(reconnectSpy).not.toHaveBeenCalled();
    });

    it("calls recoverActiveGate when autoReconnect is still true after debounce", async () => {
        const gate = t.addGate();
        gate.open(e);
        gate.boarding = true;
        gate.wasSSH = false;
        gate.reconnectCount = 0;
        t.activeG = gate;
        t.autoReconnect = true;
        t.recoveryScheduled = false;

        gate.reconnect = vi.fn().mockResolvedValue(undefined);

        vi.spyOn(Network, "getStatus").mockResolvedValue({
            connected: true,
            connectionType: "wifi",
        });

        vi.spyOn(t.map.shell, "startWatchdog").mockResolvedValue(undefined);

        t.scheduleRecovery();

        // autoReconnect stays true, so after debounce the gate should reconnect
        await sleep(250);

        expect(gate.reconnect).toHaveBeenCalledOnce();
    });
});
