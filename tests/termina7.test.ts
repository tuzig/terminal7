/*! Terminal 7 Tests
 *  This file contains the code that tests terminal 7 - a webrtc based
 *  touchable terminal multiplexer.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { Cell } from '../src/cell'
import { Terminal7Mock, sleep, mockXterm, mockNet } from './infra'
import { assert } from "chai"
import { Preferences } from '@capacitor/preferences'
import { expect, vi } from 'vitest'
import { HTTPWebRTCSession } from '../src/webrtc_session'

describe("terminal7", function() {
    var t, e
    /*
     * Every tests gets a fresh copy of terminal7 and a fresh dom element
     */
    beforeEach(async () => {
        await Preferences.clear()
        console.log("before each")
        t = new Terminal7Mock()
        e = document.getElementById("t7")
        terminal7=t
        t.open(e)
    })
    afterEach(() => t && t.clearTimeouts())
    describe("window", () => {
        var h, w, p0
        beforeEach(() => {
            h = t.addGate()
            h.open(e)
            w = h.addWindow("gothic", true)
            w.activeP.sx = 0.8
            w.activeP.sy = 0.6
            w.activeP.xoff = 0.1
            w.activeP.yoff = 0.2
            p0 = w.activeP
        })
        it("is added with a cell", function() {
            assert.exists(h.windows[0])
            assert.exists(h.windows[0].name, "gothic")
        })
        it("can move it's focus a pane to the left and back", () => {
            var p1 = p0.split("topbottom")
            w.moveFocus("left")
            expect(w.activeP).to.equal(p0)
            w.moveFocus("right")
            expect(w.activeP).to.equal(p1)
        })
        it("can move it's focus a pane up and back", () => {
            var p1 = p0.split("rightleft")
            w.moveFocus("up")
            expect(w.activeP).to.equal(p0)
            w.moveFocus("down")
            expect(w.activeP).to.equal(p1)
        })
    })

    describe("cell", () => {
        var h, w, p0
        beforeEach(() => {
            h = t.addGate()
            h.open(e)
            w = h.addWindow("1,2,3 testing", true)
            w.activeP.sx = 0.8
            w.activeP.sy = 0.6
            w.activeP.xoff = 0.1
            w.activeP.yoff = 0.2
            p0 = w.activeP
        })
        it("can set and get sizes", () => {
            let c = new Cell({sx: 0.12, sy: 0.34, w: w})
            assert.equal(c.sx, 0.12)
            assert.equal(c.sy, 0.34)

        })
        it("can set and get offsets", () => {
            let c = new Cell({xoff: 0.12, yoff: 0.34,
                w: w})
            assert.equal(c.xoff, 0.12)
            assert.equal(c.yoff, 0.34)
        })
        it("has a layout", () => {
            expect(p0.layout.dir).to.equal("TBD")
            expect(p0.layout.cells).to.eql([p0])

        })
        
        it("can be split right to left", () => {
            let p1 = p0.split("rightleft", 0.5)

            expect(p0.layout.dir).to.equal("rightleft")
            expect(p0.layout.toText()).to.match(
                /^\[0.800x0.300,0.100,0.200,\d+,0.800x0.300,0.100,0.500,\d+\]/)
            // test sizes
            assert.equal(p0.sx, 0.8)
            assert.equal(p0.sy, 0.3)
            // Test offsets
            assert.equal(p0.xoff, 0.1)
            assert.equal(p0.yoff, 0.2)
            assert.equal(p1.xoff, 0.1)
            assert.equal(p1.yoff, 0.5)
        })
        it("can be split top to bottom", () => {
            let p1 = p0.split("topbottom")
            assert.exists(p1)
            assert.equal(p0.layout, t.cells[1].layout)
            assert.equal(p0.layout.dir, "topbottom")
            assert.equal(p0.layout, t.cells[1].layout)

            expect(p0.layout.toText()).to.equal(
                "{0.400x0.600,0.100,0.200,1,0.400x0.600,0.500,0.200,2}")
            expect(p0.layout.cells[0]).to.equal(p0)
            expect(p0.layout).not.to.be.a('null')
            expect(p0.layout.cells.length).to.equal(2)

            expect(p0.sy).to.equal(0.6)
            expect(p0.sx).to.equal(t.cells[1].sx)
            expect(p0.sx).to.equal(0.4)
        })
        it("can be split twice", () => {
            let p1 = p0.split("topbottom"),
                p2 = p1.split("topbottom")
            expect(p0.layout.toText()).to.equal(
                "{0.400x0.600,0.100,0.200,1,0.200x0.600,0.500,0.200,2,0.200x0.600,0.700,0.200,3}")
            assert.exists(p2)
            expect(p0.layout).not.to.be.a('null')
            expect(p1.layout).equal(p0.layout)
            expect(p2.layout).equal(p1.layout)
            assert.equal(p0.layout, p1.layout)
            assert.equal(p1.layout, p2.layout)
            assert.equal(p0.sy, 0.6)
            assert.equal(p1.sy, 0.6)
            assert.equal(p2.sy, 0.6)
            assert.equal(p0.sx, 0.4)
            assert.equal(p1.sx, 0.2)
            assert.equal(p2.sx, 0.2)
            assert.equal(p0.xoff, 0.1)
            assert.equal(p1.xoff, 0.5)
            assert.equal(p2.xoff, 0.7)
            assert.equal(p0.yoff, 0.2)
            assert.equal(p1.yoff, 0.2)
            assert.equal(p2.yoff, 0.2)
        })
        it("can zoom, hiding all other cells", function () {
        })
        it("can resize", function () {
        })
        it("can close nicely, even with just a single cell", function () {
        })
        it("can close nicely, with layout resizing", function () {
            let p1 = p0.split("topbottom")
            expect(p0.layout.toText()).to.equal(
                "{0.400x0.600,0.100,0.200,1,0.400x0.600,0.500,0.200,2}")
            let p2 = p1.split("rightleft")
            expect(p0.layout.toText()).to.equal(
                "{0.400x0.600,0.100,0.200,1,0.400x0.600,0.500,0.200[0.400x0.300,0.500,0.200,2,0.400x0.300,0.500,0.500,4]}")
            expect(p0.layout).not.null
            expect(p1.layout).not.null
            expect(p1.layout).equal(p2.layout)
            expect(p0.layout).not.equal(p1.layout)
            expect(p0.layout.cells).eql([p0, p1.layout])
            expect(p1.layout.cells).eql([p1, p2])
            let es = document.getElementsByClassName('layout')
            assert.equal(es.length, 2)
            assert.equal(p1.sy, 0.3)
            p2.close()
            assert.equal(p1.yoff, 0.2)
            assert.equal(p1.sy, 0.6)
            p1.close()
            expect(p0.sy).equal(0.6)
            expect(p0.sx).equal(0.8)
            es = document.getElementsByClassName('layout')
            assert.equal(es.length, 1)
        })
        it("can close out of order", function () {
            let p1 = p0.split("topbottom")
            p1.close()
            assert.equal(p0.sy, 0.6)
        })
        it("can open a |- layout ", function () {
            let p1 = p0.split("topbottom"),
                p2 = p1.split("rightleft")
            p0.close()
            expect(p1.sy).to.equal(0.3)
            expect(p2.sy).to.equal(0.3)
            expect(p1.sx).to.equal(0.8)
            expect(p2.sx).to.equal(0.8)
        })
        it("can handle three splits", function() {
            let p1 = p0.split("topbottom"),
                p2 = p1.split("rightleft"),
                p3 = p2.split("topbottom")
            p1.close()
            expect(p2.sy).to.equal(0.6)
            expect(p3.sy).to.equal(0.6)
            expect(p2.yoff).to.equal(0.2)
            expect(p3.yoff).to.equal(0.2)
        })
        it("can handle another three splits", function() {
            let p1 = p0.split("topbottom"),
                p2 = p1.split("rightleft"),
                p3 = p2.split("topbottom")
            expect(p0.layout.toText()).to.equal(
                "{0.400x0.600,0.100,0.200,1,0.400x0.600,0.500,0.200[0.400x0.300,0.500,0.200,2,0.400x0.300,0.500,0.500{0.200x0.300,0.500,0.500,4,0.200x0.300,0.700,0.500,6}]}")
            p0.close()
            expect(p1.sx).to.equal(0.8)
            expect(p2.sx).to.equal(0.4)
            expect(p3.sx).to.equal(0.4)
            expect(p1.sy).to.equal(0.3)
            expect(p2.sy).to.equal(0.3)
            expect(p3.sy).to.equal(0.3)
        })
        it("can zoom in-out-in", function() {
            let p1 = p0.split("topbottom")
            expect(p0.e.style.display).to.equal('')
            expect(p0.sx).to.equal(0.4)
            p0.toggleZoom()
            //TODO: test the terminal is changing size 
            //expect(p0.t.rows).above(r0)
            expect(t.zoomedE).to.exist
            expect(t.zoomedE.classList.contains("zoomed")).to.be.true
            expect(t.zoomedE.children[0].classList.contains("pane")).to.be.true
            expect(t.zoomedE.children[0].classList.contains("pane")).to.be.true
            p0.toggleZoom()
            expect(t.zoomedE).to.be.null
            expect(p0.sx).to.equal(0.4)
            p0.toggleZoom()
            expect(t.zoomedE).to.exist
            expect(t.zoomedE.classList.contains("zoomed")).to.be.true
            expect(t.zoomedE.children[0].classList.contains("pane")).to.be.true
        })

    })
    /* TODO: fix this
    describe("gate", () => {
        it("can be stored & loaded", async function() {
            t.addGate({
                addr: 'localgate',
                user: 'guest',
                store: true
            })
            t.addGate({
                addr: 'badwolf',
                user: 'root',
                store: true
            })
            t.storeGates()
            let t2 = new Terminal7(),
                e = document.createElement("div")
            t2.open(e)
            expect(t2.gates.length).to.equal(2)
            expect(t2.gates[0].user).to.equal("guest")
            expect(t2.gates[1].user).to.equal("root")
        })
    })
        */
    describe("layout", () => {
        var h, w, p0 
        it("can be restored from a simple layout and dumped", () => {
            let state = {
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
                    }, {
                        sx: 0.8,
                        sy: 0.3,
                        xoff: 0.1,
                        yoff: 0.5,
                    }
                ]}
            h = t.addGate()
            h.open(e)
            w = h.addWindow("restored")
            w.restoreLayout(state, true)
            expect(w.rootLayout.dir).to.equal("topbottom")
            expect(w.rootLayout.cells[0].yoff).to.equal(0.2)
            expect(w.rootLayout.cells[1].yoff).to.equal(0.5)
            let d = w.dump()
            expect(d.dir).to.equal("topbottom")
            expect(d.cells.length).to.equal(2)
            expect(d.cells[0].yoff).to.equal(0.2)
            expect(d.cells[1].yoff).to.equal(0.5)
        })
        it("can be restored and dumped from a -| layout", () => {
            h = t.addGate()
            h.open(e)
            w = h.addWindow("restored")
            w.restoreLayout({
                "dir": "topbottom",
                "cells": [
                    {
                        sx: 0.8,
                        sy: 0.3,
                        xoff: 0.1,
                        yoff: 0.2,
                        channelID: 12
                    }, {
                        dir: "rightleft",
                        cells: [
                            {
                                sx: 0.4,
                                sy: 0.3,
                                xoff: 0.1,
                                yoff: 0.5,
                                channelID: -1
                            }, {
                                sx: 0.4,
                                sy: 0.3,
                                xoff: 0.5,
                                yoff: 0.5,
                                channelID: -1
                            }
                        ]
                    }
                ]}, true)
            expect(w.rootLayout.dir).to.equal("topbottom")
            expect(w.rootLayout.cells.length).to.equal(2)
            expect(w.rootLayout.cells[1].dir).to.equal("rightleft")
            expect(w.rootLayout.cells[1].cells.length).to.equal(2)
            const dump = w.rootLayout.dump()
            expect(dump.dir).to.equal("topbottom")
            expect(dump.cells.length).to.equal(2)
            expect(dump.cells[1].dir).to.equal("rightleft")
            expect(dump.cells[1].cells.length).to.equal(2)
        })
        it("can be synced from a single pane to - layout", () => {
            h = t.addGate()
            h.open(e)
            w = h.addWindow("restored")
            w.restoreLayout({
                "dir": "topbottom",
                "cells": [
                    {
                        sx: 0.8,
                        sy: 0.3,
                        xoff: 0.1,
                        yoff: 0.2,
                        channelID: 12
                    }]}, false)
            const newLayout = {
                        dir: "rightleft",
                        cells: [
                            {
                                sx: 0.4,
                                sy: 0.3,
                                xoff: 0.1,
                                yoff: 0.5,
                                channelID: 1,
                                zoomed: false
                            }, {
                                sx: 0.4,
                                sy: 0.3,
                                xoff: 0.5,
                                yoff: 0.5,
                                channelID: 2,
                                zoomed: false
                            }
                        ]
                    }
            const newL = w.syncLayout(newLayout)
            expect(newL.dir).to.equal("rightleft")
            expect(newL.cells.length).to.equal(2)
            expect(newL.cells[0].sx).to.equal(0.4)
            expect(newL.cells[0].channelID).to.equal(1)
            expect(newL.cells[1].channelID).to.equal(2)
        })
        it("can be sync from a double pane to single one", () => {
            h = t.addGate()
            h.open(e)
            w = h.addWindow("restored")
            w.restoreLayout({
                "dir": "rightleft",
                "cells": [
                    {
                        sx: 0.4,
                        sy: 0.3,
                        xoff: 0.1,
                        yoff: 0.5,
                        channelID: 1,
                        zoomed: false
                    }, {
                        sx: 0.4,
                        sy: 0.3,
                        xoff: 0.5,
                        yoff: 0.5,
                        channelID: 2,
                        zoomed: false
                    }
                ]}, false)
            const newLayout = {
                "dir": "rightleft",
                "cells": [
                    {
                        sx: 0.8,
                        sy: 0.3,
                        xoff: 0.1,
                        yoff: 0.5,
                        channelID: 1,
                        zoomed: false
                    }
                ]}
            const newL = w.syncLayout(newLayout)
            expect(newL.dir).to.equal("rightleft")
            expect(newL.cells.length).to.equal(1)
            expect(newL.cells[0].sx).to.equal(0.8)
            expect(newL.cells[0].channelID).to.equal(1)
        })
        it("can be sync from a double pane to triple one", () => {
            h = t.addGate()
            h.open(e)
            w = h.addWindow("restored")
            w.restoreLayout({
                "dir": "topbottom",
                "cells": [
                    {
                        sx: 0.8,
                        sy: 0.3,
                        xoff: 0.1,
                        yoff: 0.1,
                        channelID: 1,
                        zoomed: false
                    }, {
                        sx: 0.8,
                        sy: 0.3,
                        xoff: 0.1,
                        yoff: 0.4,
                        channelID: 2,
                        zoomed: false
                    }
                ]}, false)
            const newLayout = {
                "dir": "topbottom",
                "cells": [
                    {
                        sx: 0.8,
                        sy: 0.3,
                        xoff: 0.1,
                        yoff: 0.1,
                        channelID: 1
                    }, {
                        dir: "rightleft",
                        cells: [
                            {
                                sx: 0.4,
                                sy: 0.3,
                                xoff: 0.1,
                                yoff: 0.5,
                                channelID: 2
                            }, {
                                sx: 0.4,
                                sy: 0.3,
                                xoff: 0.5,
                                yoff: 0.5,
                                channelID: 3
                            }
                        ]
                    }
                ]}
            const newL = w.syncLayout(newLayout)
            expect(newL.dir).to.equal("topbottom")
            expect(newL.cells.length).to.equal(2)
            expect(newL.cells[0].sx).to.equal(0.8)
            expect(newL.cells[0].channelID).to.equal(1)
            const l2 = newL.cells[1]
            expect(l2.dir).to.equal("rightleft")
            expect(l2.cells.length).to.equal(2)
            expect(l2.cells[0].sx).to.equal(0.4)
            expect(l2.cells[0].channelID).to.equal(2)
            expect(l2.cells[1].channelID).to.equal(3)
        })
        it("can be sync from a double pane to the same layout", () => {
            h = t.addGate()
            h.open(e)
            w = h.addWindow("restored")
            w.restoreLayout({
                "dir": "rightleft",
                "cells": [
                    {
                        sx: 0.4,
                        sy: 0.3,
                        xoff: 0.1,
                        yoff: 0.5,
                        channelID: 1,
                        zoomed: false
                    }, {
                        sx: 0.4,
                        sy: 0.3,
                        xoff: 0.5,
                        yoff: 0.5,
                        channelID: 2,
                        zoomed: false
                    }
                ]}, false)
            const dump = w.rootLayout.dump()
            console.log("dump", dump)
            const newL = w.syncLayout(dump)
            expect(newL.dir).to.equal("rightleft")
            expect(newL.cells.length).to.equal(2)
            expect(newL.cells[0].sx).to.equal(0.4)
            expect(newL.cells[0].sy).to.equal(0.3)
            expect(newL.cells[0].channelID).to.equal(1)
        })



        it("can move a border between panes", function () {
            h = t.addGate()
            h.open(e)
            w = h.addWindow("1,2,3 testing", true)
            w.activeP.sx = 0.8
            w.activeP.sy = 0.6
            w.activeP.xoff = 0.1
            w.activeP.yoff = 0.2
            p0 = w.activeP
            let p1 = p0.split("rightleft")
            expect(p0.sy).to.equal(0.3)
            expect(p1.sy).to.equal(0.3)
            window.toBeFit = new Set([])
            p0.layout.moveBorder(p1, "top", 0.6)
            expect(p0.sy).to.be.closeTo(0.4, 0.00000001)
            expect(p1.sy).to.be.closeTo(0.2, 0.00000001)
            expect(p1.yoff).to.equal(0.6)
            p0.layout.moveBorder(p1, "top", 0.5)
            expect(p0.sy).to.be.closeTo(0.3, 0.00000001)
            expect(p1.sy).to.be.closeTo(0.3, 0.00000001)

        })
        it("can move a border in complex layout panes", function () {
            /* here's the layout we build and then move the border between
             * 1 to 2
            +----------+---+
            |          |   |
            |     1    |   |
            |          |   |
            +----+-----+ 2 |
            |    |     |   |
            | 3  | 4   |   |
            |    |     |   |
            +----+-----+---+
            */
            h = t.addGate()
            h.open(e)
            w = h.addWindow("1,2,3 testing", true)
            w.activeP.sx = 0.8
            w.activeP.sy = 0.6
            w.activeP.xoff = 0.1
            w.activeP.yoff = 0.2
            let p1 = w.activeP,
                p2 = p1.split("topbottom"),
                p3 = p1.split("rightleft"),
                p4 = p3.split("topbottom")
            expect(p4.xoff+p4.sx).to.equal(p2.xoff)
            expect(p3.sx).to.equal(0.2)
            window.toBeFit = new Set([])
            p2.layout.moveBorder(p2, "left", 0.6)
            expect(p1.sx).to.equal(0.5)
            expect(p3.sx).to.equal(0.25)
            expect(p4.sx).to.equal(0.25)
            expect(p4.xoff+p4.sx).to.be.closeTo(p2.xoff, 0.000001)
        })

        it("can move a border in another complex layout panes", function () {
            /* here's the layout we build and then move the border between
             * 1 to 2
            +---------+----------+
            |         |    3     |
            |    1    +----------+
            |         |    4     |
            |         |          |
            +---------+-----------+
            |                    |
            |          2         |
            |                    |
            |                    |
            +--------------------+
            */
            const g = t.addGate()
            g.open(e)
            w = g.addWindow("1,2,3 testing", true)
            w.activeP.sx = 0.8
            w.activeP.sy = 0.6
            w.activeP.xoff = 0.1
            w.activeP.yoff = 0.2
            let p1 = w.activeP,
                p2 = p1.split("rightleft"),
                p3 = p1.split("topbottom"),
                p4 = p3.split("rightleft")
            expect(p4.yoff+p4.sy).to.equal(p2.yoff)
            expect(p3.sy).to.equal(0.15)
            window.toBeFit = new Set([])
            p2.layout.moveBorder(p2, "top", 0.6)
            expect(p1.sy).to.equal(0.4)
            expect(p3.sy).to.equal(0.2)
            expect(p4.sy).to.equal(0.2)
            expect(p4.yoff+p4.sy).to.be.closeTo(p2.yoff, 0.000001)
        })
        it("can be restored from a bad layout", () => {
            // this is a layout that was saved with a zoomed pane in a non-active window
            // it should be restored without the zoomed pane
            // and the active pane should be the first one
            // and the window should be active

            // the layout is two window each with one pane
            h = t.addGate()
            h.open(e)
            w = h.addWindow("restored")
            w.restoreLayout({
                dir: "topbottom",
                cells: [
                    {
                        sx: 0.8,
                        sy: 0.6,
                        xoff: 0.1,
                        yoff: 0.2,
                        channelID: 0
                    }, {
                        sx: 0.8,
                        sy: 0.6,
                        xoff: 0.1,
                        yoff: 0.2,
                        channelID: 1,
                        zoomed: true,
                        active: true
                    }
                ]
            }, false)
            expect(w.rootLayout.dir).to.equal("topbottom")
            expect(w.rootLayout.cells.length).to.equal(2)
            expect(w.activeP.zoomed).to.equal(false)
        })
    })
    describe("gate", () => {
        it("can open connection form without SSH", async () => {
            const t0 = t.map.t0
            t.map.shell.start()
            t.map.shell.runCommand('add', [])
            t0.pressKey("Enter")
            await sleep(10)
            t0.pressKey("1")
            t0.pressKey("Enter")
            t0.pressKey("n")
            t0.pressKey("Enter")
            await sleep(300)
            console.log("t0.out:", t0.out)
            expect(t0.out, `TWR out: ${t0.out}`).toMatch(/WebExec/)
            expect(t0.out, `TWR out: ${t0.out}`).toMatch(/over WebRTC/)
        })
    })
})
