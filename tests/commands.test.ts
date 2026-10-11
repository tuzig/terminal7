/*! Terminal 7 Tests
 *  This file contains the code that tests terminal 7 - a webrtc based
 *  touchable terminal multiplexer.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com License: GPLv3
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Terminal7Mock, sleep } from "./infra";
import { Terminal } from "@xterm/xterm";
import { installCMD, loadCommands, renewCMD } from "../src/commands";
import { T7Map } from "../src/map";
import { NativeBiometric } from "capacitor-native-biometric";

vi.mock("capacitor-native-biometric", () => ({
    NativeBiometric: {
        verifyIdentity: vi.fn(),
        getCredentials: vi.fn(),
        setCredentials: vi.fn(),
        deleteCredentials: vi.fn(),
    },
}));

let out = "";

describe("TWR commands", function () {
    var t, e;
    /*
     * Every tests gets a fresh copy of terminal7 and a fresh dom element
     */
    beforeEach(async () => {
        t = new Terminal7Mock();
        e = document.getElementById("t7");
        terminal7 = t;
        t.open(e);
        vi.mocked(NativeBiometric.verifyIdentity).mockReset();
    });
    afterEach(() => t && t.clearTimeouts());
    describe("Install command", () => {
        it("should use ssh to login to the server", async () => {
            let gate = {};
            let shell = {
                getGate: () => gate,
                t: new Terminal({}),
                runForm: vi.fn(() => "Connect & send command"),
            };
            t.pb = {
                adminCommand: vi.fn(() => "j"),
                getUID: vi.fn(() => "5678"),
                isOpen: vi.fn(() => true),
            };
            shell.t.writeln("try");
            expect(shell.t.out).toMatch(/try/);
            try {
                installCMD(shell, "whatever");
            } catch (e) {
                console.log("install command error", e);
            }
            await sleep(300);
            globalThis.lastSSHChannel.onMessage("Fingerprint: 1234");
            // expect(shell.t.out).toMatch(/~~~~/)
            // TODO: ensure shell.verfyFP has been called
            //
            // expect(shell.verifyFP).toHaveBeenCalled
        });
    });

    describe("subscribe renew", () => {
        it("renews the certificate after biometric verification when connected", async () => {
            const shell = {
                t: new Terminal({}),
                getGate: () => ({}),
            };
            const pb = {
                isOpen: vi.fn(() => true),
                adminCommand: vi.fn(),
            };
            t.pb = pb;
            vi.mocked(NativeBiometric.verifyIdentity).mockResolvedValue(true);
            vi.spyOn(t, "renewCertificate").mockResolvedValue(true);

            await renewCMD(shell);

            expect(NativeBiometric.verifyIdentity).toHaveBeenCalled();
            expect(t.renewCertificate).toHaveBeenCalled();
            expect(shell.t.out).toMatch(/renewed and reauthorized/);
        });

        it("does not renew when biometric verification is cancelled", async () => {
            const shell = {
                t: new Terminal({}),
                getGate: () => ({}),
            };
            t.pb = { isOpen: vi.fn(() => true), adminCommand: vi.fn() };
            vi.mocked(NativeBiometric.verifyIdentity).mockResolvedValue(false);
            const renewSpy = vi.spyOn(t, "renewCertificate");

            await renewCMD(shell);

            expect(renewSpy).not.toHaveBeenCalled();
            expect(shell.t.out).toMatch(/Biometric verification cancelled/);
        });

        it("connects to PeerBook first when not open", async () => {
            const shell = {
                t: new Terminal({}),
                getGate: () => ({}),
            };
            const pb = {
                isOpen: vi.fn(() => false),
                adminCommand: vi.fn(),
            };
            t.pb = pb;
            vi.mocked(NativeBiometric.verifyIdentity).mockResolvedValue(true);
            vi.spyOn(t, "pbConnect").mockResolvedValue(undefined);
            vi.spyOn(t, "renewCertificate").mockResolvedValue(true);

            await renewCMD(shell);

            expect(t.pbConnect).toHaveBeenCalled();
            expect(t.renewCertificate).toHaveBeenCalled();
            expect(shell.t.out).toMatch(/renewed and reauthorized/);
        });

        it("reports a failure when PeerBook cannot be reached", async () => {
            const shell = {
                t: new Terminal({}),
                getGate: () => ({}),
            };
            t.pb = { isOpen: vi.fn(() => false), adminCommand: vi.fn() };
            vi.mocked(NativeBiometric.verifyIdentity).mockResolvedValue(true);
            vi.spyOn(t, "pbConnect").mockRejectedValue(new Error("no net"));

            await renewCMD(shell);

            expect(shell.t.out).toMatch(/Failed to connect to PeerBook/);
        });

        it("reports when reauthorization could not be completed", async () => {
            const shell = {
                t: new Terminal({}),
                getGate: () => ({}),
            };
            t.pb = { isOpen: vi.fn(() => true), adminCommand: vi.fn() };
            vi.mocked(NativeBiometric.verifyIdentity).mockResolvedValue(true);
            vi.spyOn(t, "renewCertificate").mockResolvedValue(false);

            await renewCMD(shell);

            expect(shell.t.out).toMatch(/Could not automatically reauthorize/);
        });

        it("dispatches `subscribe renew` through the command map", async () => {
            const shell = {
                t: new Terminal({}),
                getGate: () => ({}),
            };
            t.pb = { isOpen: vi.fn(() => true), adminCommand: vi.fn() };
            vi.mocked(NativeBiometric.verifyIdentity).mockResolvedValue(true);
            vi.spyOn(t, "renewCertificate").mockResolvedValue(true);

            const commands = loadCommands(shell);
            const subscribe = commands.get("subscribe");
            expect(subscribe).toBeDefined();
            await subscribe.execute(["renew"]);

            expect(t.renewCertificate).toHaveBeenCalled();
            expect(shell.t.out).toMatch(/renewed and reauthorized/);
        });
    });
});
