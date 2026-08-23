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
        p0.gate.fitScreen = true;
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
        p0.gate.fitScreen = true;
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
    it("styleZoomed applies CSS transform scale to canvases when !fitScreen", () => {
        p0.gate.fitScreen = false;
        p0.gate.fontScale = 0.5;
        // Add a canvas inside the terminal element so querySelectorAll
        // returns a non-empty NodeList (xterm mock's open() is a no-op)
        const canvas = document.createElement("canvas");
        p0.e.firstElementChild.appendChild(canvas);
        // Apply the container-level fontScale to canvas as scaleCanvas would
        p0.scaleCanvas();
        expect(canvas.style.transform).toBe("scale(0.5)");

        // Record the original font size so we can verify it's not mutated
        const originalFontSize = p0.t.options.fontSize;

        // The mock Terminal has cell dimensions width=5, height=11
        // and cols/rows from the terminal props (default 80x24)
        const cellW = p0.t._core._renderService.dimensions.css.cell.width; // 5
        const cellH = p0.t._core._renderService.dimensions.css.cell.height; // 11
        const naturalWidth = p0.t.cols * cellW; // 80 * 5 = 400
        const naturalHeight = p0.t.rows * cellH; // 24 * 11 = 264

        p0.zoom();

        // Canvas transform should be a CSS scale based on cell dimensions
        // and the zoomed pane's available size — not scale(1) and not
        // the container-level fontScale.
        const zp = document.getElementById("zoomed-pane");
        const canvases = zp.querySelectorAll("canvas");
        expect(canvases.length).toBeGreaterThanOrEqual(1);

        // The zoomed pane's child div (e) has width 100% and height set
        // by styleZoomed. clientWidth/clientHeight come from jsdom layout.
        // Verify a scale transform was applied (not scale(1) unless the
        // pane is smaller than natural dimensions).
        const e = zp.querySelector(".pane");
        const expectedScale = Math.min(
            e.clientWidth / naturalWidth,
            e.clientHeight / naturalHeight,
            1,
        );
        canvases.forEach((c) => {
            expect(c.style.transform).toBe(`scale(${expectedScale})`);
            // transformOrigin must be set
            expect(c.style.transformOrigin).toBe("top left");
        });

        // Font size should NOT be mutated
        expect(p0.t.options.fontSize).toBe(originalFontSize);

        p0.unzoom();
    });
    it("onResize calls styleZoomed for zoomed panes when !fitScreen", () => {
        p0.gate.fitScreen = false;
        p0.gate.lastState = { width: 800, height: 600, windows: [] };
        p0.gate.fontScale = 0.5;

        let styleZoomedCalled = false;
        const origStyleZoomed = p0.styleZoomed.bind(p0);
        p0.styleZoomed = () => {
            styleZoomedCalled = true;
            origStyleZoomed();
        };

        p0.zoom();
        p0.gate.onResize();
        expect(styleZoomedCalled).toBe(true);

        p0.unzoom();
    });
    it("unzoom calls scaleCanvas when !fitScreen to restore fontScale", () => {
        p0.gate.fitScreen = false;
        p0.gate.fontScale = 0.5;
        // Add a canvas inside the terminal element so querySelectorAll
        // returns a non-empty NodeList (xterm mock's open() is a no-op)
        const canvas = document.createElement("canvas");
        p0.e.firstElementChild.appendChild(canvas);
        p0.scaleCanvas();
        expect(canvas.style.transform).toBe("scale(0.5)");

        p0.zoom();
        // During zoom, canvas transform is set to a CSS scale based on
        // cell dimensions and the zoomed pane's available size.
        const zp = document.getElementById("zoomed-pane");
        let canvases = zp.querySelectorAll("canvas");
        expect(canvases.length).toBeGreaterThanOrEqual(1);
        canvases.forEach((c) => {
            // Should be a scale transform, not scale(1) unless pane is smaller
            expect(c.style.transform).toMatch(/^scale\(/);
            expect(c.style.transform).not.toBe("scale(0.5)");
        });

        p0.unzoom();
        // After unzoom, scaleCanvas queries this.e (which now contains
        // the terminal element again) and restores the fontScale transform
        canvases = p0.e.querySelectorAll("canvas");
        expect(canvases.length).toBeGreaterThanOrEqual(1);
        canvases.forEach((c) => {
            expect(c.style.transform).toBe("scale(0.5)");
        });
    });
    it("adjustDimensions zooms synchronously before resize", () => {
        p0.gate.fitScreen = true;
        // Track the order: zoom must happen before t.resize
        const order: string[] = [];
        const origZoom = p0.zoom.bind(p0);
        p0.zoom = () => {
            order.push("zoom");
            origZoom();
        };
        const origResize = p0.t.resize.bind(p0.t);
        p0.t.resize = (cols: number, rows: number) => {
            order.push("resize");
            origResize(cols, rows);
        };

        // Simulate a syncLayout where the server says the pane is zoomed
        p0.adjustDimensions({
            sx: 0.8,
            sy: 0.6,
            xoff: 0.1,
            yoff: 0.2,
            zoomed: true,
            fontSize: 14,
            channelID: 1,
            active: true,
            rows: 48,
            cols: 160,
        });

        // zoom must have been called (not deferred)
        expect(p0.zoomed).toBe(true);
        // zoom must come before resize
        expect(order.indexOf("zoom")).toBeLessThan(order.indexOf("resize"));
        expect(order.indexOf("zoom")).toBeGreaterThanOrEqual(0);

        p0.unzoom();
    });
    it("adjustDimensions unzooms synchronously before resize", () => {
        p0.gate.fitScreen = true;
        // First zoom the pane
        p0.zoom();
        expect(p0.zoomed).toBe(true);

        // Track the order: unzoom must happen before t.resize
        const order: string[] = [];
        const origUnzoom = p0.unzoom.bind(p0);
        p0.unzoom = () => {
            order.push("unzoom");
            origUnzoom();
        };
        const origResize = p0.t.resize.bind(p0.t);
        p0.t.resize = (cols: number, rows: number) => {
            order.push("resize");
            origResize(cols, rows);
        };

        // Simulate a syncLayout where the server says the pane is no longer zoomed
        p0.adjustDimensions({
            sx: 0.8,
            sy: 0.6,
            xoff: 0.1,
            yoff: 0.2,
            zoomed: false,
            fontSize: 14,
            channelID: 1,
            active: true,
            rows: 24,
            cols: 80,
        });

        // unzoom must have been called (not deferred)
        expect(p0.zoomed).toBe(false);
        // unzoom must come before resize (if resize happened)
        if (order.includes("resize")) {
            expect(order.indexOf("unzoom")).toBeLessThan(
                order.indexOf("resize"),
            );
        }
        expect(order.indexOf("unzoom")).toBeGreaterThanOrEqual(0);
    });
    it("adjustDimensions recomputes zoomed scale after resize when !fitScreen", () => {
        p0.gate.fitScreen = false;
        p0.gate.fontScale = 1;
        // Add a canvas so querySelectorAll returns it
        const canvas = document.createElement("canvas");
        p0.e.firstElementChild.appendChild(canvas);

        // Track styleZoomed calls and their order relative to resize
        const order: string[] = [];
        const origStyleZoomed = p0.styleZoomed.bind(p0);
        p0.styleZoomed = (e?) => {
            order.push("styleZoomed");
            origStyleZoomed(e);
        };
        const origResize = p0.t.resize.bind(p0.t);
        p0.t.resize = (cols, rows) => {
            order.push("resize");
            origResize(cols, rows);
        };

        const cellW = p0.t._core._renderService.dimensions.css.cell.width;
        const cellH = p0.t._core._renderService.dimensions.css.cell.height;

        // Server sends a zoomed layout with larger dimensions (e.g. 160x48)
        const targetRows = 48,
            targetCols = 160;
        p0.adjustDimensions({
            sx: 0.8,
            sy: 0.6,
            xoff: 0.1,
            yoff: 0.2,
            zoomed: true,
            fontSize: 14,
            channelID: 1,
            active: true,
            rows: targetRows,
            cols: targetCols,
        });

        // styleZoomed should have been called at least twice:
        //   1st from zoom() (with old dimensions)
        //   2nd from adjustDimensions after resize (with new dimensions)
        const styleZoomedCount = order.filter(
            (s) => s === "styleZoomed",
        ).length;
        expect(styleZoomedCount).toBeGreaterThanOrEqual(2);

        // The last styleZoomed must come after resize
        const lastStyleZoomed = order.lastIndexOf("styleZoomed");
        const resizeIdx = order.indexOf("resize");
        expect(lastStyleZoomed).toBeGreaterThan(resizeIdx);

        // Verify the final scale uses the NEW (larger) dimensions
        const zp = document.getElementById("zoomed-pane");
        const e = zp.querySelector(".pane");
        const naturalWidth = targetCols * cellW;
        const naturalHeight = targetRows * cellH;
        const expectedScale = Math.min(
            e.clientWidth / naturalWidth,
            e.clientHeight / naturalHeight,
            1,
        );
        const canvases = zp.querySelectorAll("canvas");
        canvases.forEach((c) => {
            expect(c.style.transform).toBe(`scale(${expectedScale})`);
        });

        p0.unzoom();
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
