/*! Terminal 7 Gate Tests
 *  This file contains the code that tests terminal 7 - a webrtc based
 *  touchable terminal multiplexer.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { vi, describe, beforeAll, afterEach, it, expect } from "vitest";
import { T7Map } from "../src/map";
import { Terminal7Mock, sleep } from "./infra";
import { Preferences } from "@capacitor/preferences";
import { HTTPWebRTCSession } from "../src/webrtc_session";

vi.mock("xterm");
vi.mock("@revenuecat/purchases-capacitor");
vi.mock("../src/webrtc_session.ts");
vi.mock("../src/ssh_session.ts");
vi.mock("@capacitor-community/native-audio");

describe("gate", () => {
    var t, e;
    beforeAll(async () => {
        await Preferences.clear();
        t = new Terminal7Mock();
        e = document.getElementById("t7");
        terminal7 = t;
        t.open(e);
    });
    afterEach(() => {
        t.clearTimeouts();
        t.gates = new Array();
        t.pendingPanes = {};
        HTTPWebRTCSession.fail = false;
        HTTPWebRTCSession.payload = null;
    });
    it("starts with no gates", () => {
        expect(t.gates.length).to.equal(0);
    });
    it("s state can be restored", async () => {
        let state = {
            windows: [
                {
                    name: "hello",
                    layout: {
                        dir: "topbottom",
                        sx: 0.8,
                        sy: 0.6,
                        xoff: 0.1,
                        yoff: 0.2,
                        cells: [
                            {
                                sx: 0.8,
                                sy: 0.3,
                                xoff: 0.1,
                                yoff: 0.2,
                            },
                            {
                                sx: 0.8,
                                sy: 0.3,
                                xoff: 0.1,
                                yoff: 0.5,
                                active: true,
                            },
                        ],
                    },
                },
                {
                    name: "world",
                    active: true,
                    layout: {
                        dir: "rightleft",
                        sx: 0.8,
                        sy: 0.6,
                        xoff: 0.1,
                        yoff: 0.2,
                        cells: [
                            {
                                sx: 0.4,
                                sy: 0.6,
                                xoff: 0.1,
                                yoff: 0.2,
                            },
                            {
                                sx: 0.4,
                                sy: 0.6,
                                xoff: 0.5,
                                yoff: 0.2,
                                active: true,
                            },
                        ],
                    },
                },
            ],
        };
        let h = t.addGate();
        expect(typeof h).toEqual("object");
        h.open(e);
        h.setLayout(state);
        expect(h.windows.length).to.equal(2);
        let w = h.activeW;
        expect(w.rootLayout.dir).to.equal("rightleft");
        expect(w.name).to.equal("world");
        expect(w.rootLayout.cells[0].xoff).to.equal(0.1);
        expect(w.rootLayout.cells[1].xoff).to.equal(0.5);
        expect(w.activeP.xoff).to.equal(0.5);
        let d = h.dump();
        expect(d.windows.length).to.equal(2);
        expect(d.windows[0].layout.dir).to.equal("topbottom");
        expect(d.windows[0].layout.cells.length).to.equal(2);
        expect(d.windows[0].layout.cells[0].yoff).to.equal(0.2);
        expect(d.windows[0].layout.cells[1].yoff).to.equal(0.5);
    });
    it("can create a gate", async () => {
        let addHost = document.getElementById("add-host");
        expect(addHost.classList.contains("hidden")).toBeTruthy();
        document.getElementById("add-static-host").click();
    });
    it("can edit gate", async () => {
        let g = t.addGate({ name: "foo" });
        // TODO: add checks here
    });
    it("can be connected", async () => {
        let g = t.addGate();
        expect(typeof g).toEqual("object");
        g.open(e);
        g.connect();
        await sleep(1000);
        expect(g.boarding).to.equal(true);
        expect(g.session.connect).toHaveBeenCalledTimes(1);
        expect(g.session.openChannel).toHaveBeenCalledTimes(1);
        expect(g.session.openChannel.mock.calls[0]).toEqual([
            "bash",
            null,
            80,
            24,
        ]);
        let panes = g.panes();
        await sleep(100);
        expect(panes.length).to.equal(1);
        expect(panes[0].t).not.toBeNull();
        expect(panes[0].d).not.toBeNull();
        expect(panes[0].d.resize).toHaveBeenCalledTimes(0);
    });
    it("stores a session hash on first empty webexec payload", async () => {
        const g = t.addGate();
        g.open(e);
        await g.connect();
        await sleep(100);
        const stored = JSON.parse(HTTPWebRTCSession.payload);
        expect(stored.session).toEqual(expect.any(String));
        expect(g.dump().session).toEqual(stored.session);
    });
    it("starts fresh when the webexec session hash changes before marker restore", async () => {
        t.map.t0.out = "";
        HTTPWebRTCSession.payload = JSON.stringify({
            session: "new",
            windows: [],
            width: 1280,
            height: 627,
        });
        const g = t.addGate();
        g.open(e);
        g.session = new HTTPWebRTCSession(
            "http://example.com:7777/offer",
            "",
            "",
        );
        g.sessionId = "old";
        g.marker = 123;

        await g.reconnect();

        expect(g.session.getPayload).toHaveBeenCalledTimes(1);
        expect(g.session.reconnect).not.toHaveBeenCalled();
        expect(g.marker).toBeNull();
        expect(g.dump().session).toEqual("new");
        expect(g.panes().length).toEqual(1);
        expect(t.map.t0.out).toContain("fresh webexec session");
    });
    it("starts fresh when the webexec payload is missing a session hash", async () => {
        t.map.t0.out = "";
        HTTPWebRTCSession.payload = JSON.stringify({
            windows: [],
            width: 1280,
            height: 627,
        });
        const g = t.addGate();
        g.open(e);
        g.session = new HTTPWebRTCSession(
            "http://example.com:7777/offer",
            "",
            "",
        );
        g.sessionId = "old";
        g.marker = 123;

        await g.reconnect();

        expect(g.session.getPayload).toHaveBeenCalledTimes(1);
        expect(g.session.reconnect).not.toHaveBeenCalled();
        expect(g.marker).toBeNull();
        expect(g.dump().session).not.toEqual("old");
        expect(t.map.t0.out).toContain("fresh webexec session");
    });
    it("remembers username", async () => {
        let g = t.addGate({ name: "foo", addr: "foo", username: "eyal" });
        g.open(e);
        HTTPWebRTCSession.fail = true;
        globalThis.webkit = { messageHandlers: { bridge: 1 } }; // mock ios
        const map = new T7Map();
        map.open();
        map.shell.start();
        g.map = map;
        const t0 = map.t0;
        t.map.t0 = t0;
        map.shell.t = t0;
        map.shell.runCommand("connect", ["foo"]);
        await sleep(500);
        expect(t0.out).not.toMatch("Username");
    });
    it("removes hidden class from gate element on focus", () => {
        let g = t.addGate({ name: "focusTest" });
        g.open(e);
        g.e.classList.add("hidden");
        expect(g.e.classList.contains("hidden")).toBeTruthy();
        g.focus();
        expect(g.e.classList.contains("hidden")).toBeFalsy();
    });
    it("adds invisible class to gate element when active pane is zoomed", () => {
        let g = t.addGate({ name: "zoomedGate" });
        g.open(e);
        g.setLayout(null);
        // simulate zoomed state on the active pane
        g.activeW.activeP.zoomed = true;
        g.focus();
        expect(g.e.classList.contains("invisible")).toBeTruthy();
    });
    it("removes invisible class from gate element when active pane is not zoomed", () => {
        let g = t.addGate({ name: "notZoomedGate" });
        g.open(e);
        g.setLayout(null);
        g.e.classList.add("invisible");
        g.activeW.activeP.zoomed = false;
        g.focus();
        expect(g.e.classList.contains("invisible")).toBeFalsy();
    });
    it("adds invisible class to inactive windows on focus", () => {
        let g = t.addGate({ name: "multiWindowGate" });
        g.open(e);
        g.setLayout(null);
        // add a second window
        let w2 = g.addWindow("second", false);
        // activeW is the first window, w2 should be invisible after focus
        g.focus();
        let windows = g.e.querySelectorAll(".window");
        windows.forEach((w) => {
            if (w != g.activeW.e)
                expect(w.classList.contains("invisible")).toBeTruthy();
            else expect(w.classList.contains("invisible")).toBeFalsy();
        });
    });
    it("toggles invisible on minimized indicator when showing/hiding log", () => {
        const minimized = document.getElementById("log-minimized");
        const log = document.getElementById("log");
        // showLog(true) should add invisible to minimized
        t.map.showLog(true);
        expect(minimized.classList.contains("invisible")).toBeTruthy();
        expect(log.classList.contains("hidden")).toBeFalsy();
        // showLog(false) should remove invisible from minimized
        t.map.showLog(false);
        expect(minimized.classList.contains("invisible")).toBeFalsy();
        expect(log.classList.contains("hidden")).toBeTruthy();
    });
    it("adds invisible class to previously active window on window focus", () => {
        let g = t.addGate({ name: "windowFocusGate" });
        g.open(e);
        g.setLayout(null);
        let w1 = g.activeW;
        let w2 = g.addWindow("second", false);
        // focus w2 to make it active; w1 should become invisible
        w2.focus();
        expect(w1.e.classList.contains("invisible")).toBeTruthy();
        expect(w2.e.classList.contains("invisible")).toBeFalsy();
    });
    it("skips load and marker reset in onSessionState during reconnect", async () => {
        const g = t.addGate();
        g.open(e);
        g.session = new HTTPWebRTCSession(
            "http://example.com:7777/offer",
            "",
            "",
        );
        g.marker = 42;
        g.reconnectCount = 1;
        const loadSpy = vi.spyOn(g, "load");

        g.onSessionState("connected", undefined);

        expect(loadSpy).not.toHaveBeenCalled();
        expect(g.marker).toBe(42);
    });
    it("calls load and resets marker in onSessionState when not reconnecting", async () => {
        const g = t.addGate();
        g.open(e);
        g.session = new HTTPWebRTCSession(
            "http://example.com:7777/offer",
            "",
            "",
        );
        g.marker = 42;
        g.reconnectCount = 0;
        g.onConnected = () => {};
        const loadSpy = vi.spyOn(g, "load");

        g.onSessionState("connected", undefined);

        expect(loadSpy).toHaveBeenCalledTimes(1);
        expect(g.marker).toBeNull();
    });
    it("shouldRestoreSession skips applyServerPayload when session IDs match", async () => {
        HTTPWebRTCSession.payload = JSON.stringify({
            session: "same-session",
            windows: [],
            width: 1280,
            height: 627,
        });
        const g = t.addGate();
        g.open(e);
        const session = new HTTPWebRTCSession(
            "http://example.com:7777/offer",
            "",
            "",
        );
        g.session = session;
        g.sessionId = "same-session";
        g.marker = 99;
        const applySpy = vi.spyOn(g, "applyServerPayload");

        const result = await g.shouldRestoreSession(session);

        expect(result).toBe(true);
        expect(applySpy).not.toHaveBeenCalled();
        // marker should be preserved — finish() will use it
        expect(g.marker).toBe(99);
    });
    it("shouldRestoreSession calls applyServerPayload for fresh session", async () => {
        t.map.t0.out = "";
        HTTPWebRTCSession.payload = JSON.stringify({
            session: "new-session",
            windows: [],
            width: 1280,
            height: 627,
        });
        const g = t.addGate();
        g.open(e);
        const session = new HTTPWebRTCSession(
            "http://example.com:7777/offer",
            "",
            "",
        );
        g.session = session;
        g.sessionId = "old-session";
        g.marker = 99;
        g.reconnectCount = 1;

        const result = await g.shouldRestoreSession(session);

        expect(result).toBe(false);
        expect(g.marker).toBeNull();
        expect(g.reconnectCount).toBe(0);
        expect(g.dump().session).toEqual("new-session");
        expect(t.map.t0.out).toContain("fresh webexec session");
    });
});
