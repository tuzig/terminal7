/*! Terminal 7 Tests
 *  This file contains the code that tests terminal 7 - a webrtc based
 *  touchable terminal multiplexer.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { Gate } from "../src/gate";
import { Terminal7Mock } from "./infra";
import { Preferences } from "@capacitor/preferences";
import { vi, describe, beforeEach, afterEach, it, expect } from "vitest";

describe("pane", () => {
    var t, e, h, w, p0;
    beforeEach(async () => {
        await Preferences.clear();
        console.log("before each");
        Gate.prototype.getCreds = function () {
            this.completeConnect("BADWOLF");
        };
        t = new Terminal7Mock();
        e = document.getElementById("t7");
        terminal7 = t;
        t.open(e);
        h = t.addGate();
        h.open(e);
        w = h.addWindow("1,2,3 testing", true);
        w.activeP.sx = 0.8;
        w.activeP.sy = 0.6;
        w.activeP.xoff = 0.1;
        w.activeP.yoff = 0.2;
        p0 = w.activeP;
        await p0.fit();
        Preferences.set({ key: "first_copymode", value: "1" });
    });
    afterEach(() => t && t.clearTimeouts());
    it("removes invisible class from gate element on unzoom", () => {
        // Simulate zoom then unzoom, with invisible class added to gate
        p0.zoom();
        expect(p0.zoomed).toBeTruthy();
        // Simulate what gate.focus() does: replace hidden with invisible
        p0.gate.e.classList.remove("hidden");
        p0.gate.e.classList.add("invisible");
        p0.unzoom();
        expect(p0.gate.e.classList.contains("hidden")).toBeFalsy();
        expect(p0.gate.e.classList.contains("invisible")).toBeFalsy();
    });
    it("zoomed-pane is visible before fit runs during zoom", () => {
        // Track whether #zoomed-pane was visible when fit() was called
        const fitCalls: boolean[] = [];
        const origFit = p0.fit.bind(p0);
        p0.fit = (cb?) => {
            const zp = document.getElementById("zoomed-pane");
            fitCalls.push(zp ? !zp.classList.contains("hidden") : false);
            origFit(cb);
        };
        p0.zoom();
        // fit() was called at least once via styleZoomed
        expect(fitCalls.length).toBeGreaterThanOrEqual(1);
        // The zoomed-pane must have been visible when fit ran
        expect(fitCalls.every((v) => v === true)).toBe(true);
        p0.unzoom();
    });
    it("toggleZoom to zoom calls fit only once", () => {
        let fitCount = 0;
        const origFit = p0.fit.bind(p0);
        p0.fit = (cb?) => {
            fitCount++;
            origFit(cb);
        };
        p0.toggleZoom();
        expect(p0.zoomed).toBeTruthy();
        // zoom() calls styleZoomed() which calls fit() once.
        // toggleZoom must NOT call fit() again on the zoom path.
        expect(fitCount).toBe(1);
        p0.unzoom();
    });
    it("toggleZoom to unzoom still calls fit", () => {
        p0.zoom();
        let fitCount = 0;
        const origFit = p0.fit.bind(p0);
        p0.fit = (cb?) => {
            fitCount++;
            origFit(cb);
        };
        p0.toggleZoom();
        expect(p0.zoomed).toBeFalsy();
        // unzoom() does not call fit(), so toggleZoom must call it.
        expect(fitCount).toBe(1);
    });
    it("can forward jump words in copy mode", () => {
        p0.t.setBuffer(["aaa aa  a--.a,,  -a ", "aa a"]);
        p0.enterCopyMode(false);
        p0.handleCMKey("w");
        expect(p0.cmCursor.x).equal(4);
        p0.handleCMKey("w");
        expect(p0.cmCursor.x).equal(8);
        p0.handleCMKey("w");
        expect(p0.cmCursor.x).equal(9);
        p0.handleCMKey("w");
        expect(p0.cmCursor.x).equal(12);
        p0.handleCMKey("w");
        expect(p0.cmCursor.x).equal(13);
        p0.handleCMKey("w");
        expect(p0.cmCursor.x).equal(17);
        p0.handleCMKey("w");
        expect(p0.cmCursor.x).equal(18);
        p0.handleCMKey("w");
        expect(p0.cmCursor).toEqual({ x: 0, y: 1 });
        p0.handleCMKey("w");
        expect(p0.cmCursor).toEqual({ x: 3, y: 1 });
        p0.handleCMKey("w");
        expect(p0.cmCursor).toEqual({ x: 3, y: 1 });
    });
    it("can backward jump words in copy mode", () => {
        p0.t.buffer.active.cursorX = 3;
        p0.t.buffer.active.cursorY = 1;
        p0.t.setBuffer(["aaa aa  a--.a,,  -a ", "aa a"]);
        p0.enterCopyMode(false);
        p0.handleCMKey("b");
        expect(p0.cmCursor).toEqual({ x: 0, y: 1 });
        p0.handleCMKey("b");
        expect(p0.cmCursor).toEqual({ x: 18, y: 0 });
        p0.handleCMKey("b");
        expect(p0.cmCursor.x).equal(17);
        p0.handleCMKey("b");
        expect(p0.cmCursor.x).equal(13);
        p0.handleCMKey("b");
        expect(p0.cmCursor.x).equal(12);
        p0.handleCMKey("b");
        expect(p0.cmCursor.x).equal(9);
        p0.handleCMKey("b");
        expect(p0.cmCursor.x).equal(8);
        p0.handleCMKey("b");
        expect(p0.cmCursor.x).equal(4);
        p0.handleCMKey("b");
        expect(p0.cmCursor).toEqual({ x: 0, y: 0 });
        p0.handleCMKey("b");
        expect(p0.cmCursor).toEqual({ x: 0, y: 0 });
    });
    it("can jump to the end of words in copy mode", () => {
        p0.t.setBuffer(["aaa aa  a--.a,,  -a ", "aa a"]);
        p0.enterCopyMode(false);
        p0.handleCMKey("e");
        expect(p0.cmCursor.x).equal(2);
        p0.handleCMKey("e");
        expect(p0.cmCursor.x).equal(5);
        p0.handleCMKey("e");
        expect(p0.cmCursor.x).equal(8);
        p0.handleCMKey("e");
        expect(p0.cmCursor.x).equal(11);
        p0.handleCMKey("e");
        expect(p0.cmCursor.x).equal(12);
        p0.handleCMKey("e");
        expect(p0.cmCursor.x).equal(14);
        p0.handleCMKey("e");
        expect(p0.cmCursor.x).equal(17);
        p0.handleCMKey("e");
        expect(p0.cmCursor.x).equal(18);
        p0.handleCMKey("e");
        expect(p0.cmCursor).toEqual({ x: 1, y: 1 });
        p0.handleCMKey("e");
        expect(p0.cmCursor).toEqual({ x: 3, y: 1 });
        p0.handleCMKey("e");
        expect(p0.cmCursor).toEqual({ x: 3, y: 1 });
    });
});
