import { Terminal7, Cell } from "../src/terminal7.js"
import { assert } from "chai"


describe("terminal7", function() {
    var t, e
    before(() => {
            e = document.createElement('div')
            document.body.appendChild(e)
    })
    after(() => {
        document.body.innerHTML = ""
    })
    beforeEach(() => {
        e.innerHTML = ""
        t = new Terminal7({paneMargin: 0.02})
        t.open(e)
    })

    it("opens with a window and a pane", () => {
        assert.exists(t.windows[0])
        assert.exists(t.panes[0])
        assert.equal(t.panes[0].w, t.windows[0])
        assert.equal(t.panes[0].parent, null)
        assert.equal(t.panes[0].xoff, 0.02)
        assert.equal(t.panes[0].yoff, 0.02)
    })

    describe("window", () => {
        it("can be added", function() {
            let w = t.addWindow("gothic")
            assert.exists(t.windows[1])
            assert.exists(t.windows[1].name, "gothic")
        })
        it("can be activated", function() {
            let w = t.addWindow("gothic")
            // w.active = true
        })
    })

    describe("cell", () => {
        beforeEach(() => {
            t.panes[0].sx = 0.8
            t.panes[0].sy = 0.6
            t.panes[0].xoff = 0.1
            t.panes[0].yoff = 0.2
        })
        it("can set and get sizes", () => {
            let c = new Cell({sx: 0.12, sy: 0.34})
            assert.equal(c.sx, 0.12)
            assert.equal(c.sy, 0.34)

        })
        it("can set and get offsets", () => {
            let c = new Cell({xoff: 0.12, yoff: 0.34})
            assert.equal(c.xoff, 0.12)
            assert.equal(c.yoff, 0.34)

        })
        
        it("can be split right to left", () => {
            t.panes[0].split("rightleft")
            // test parents
            assert.exists(t.panes[1])
            assert.equal(t.panes[1].parent, t.panes[0])
            // test sizes
            assert.equal(t.panes[0].sx, 0.8)
            assert.equal(t.panes[0].sy, t.panes[1].sy)
            assert.equal(t.panes[0].sy, 0.58 / 2.0)
            // Test offsets
            assert.equal(t.panes[0].xoff, 0.1)
            assert.equal(t.panes[0].yoff, 0.2)
            assert.equal(t.panes[1].xoff, 0.1)
            assert.equal(t.panes[1].yoff, 0.51)
        })
        it("can be split top to bottom", () => {
            t.panes[0].split("topbottom")
            assert.exists(t.panes[1])
            assert.equal(t.panes[1].parent, t.panes[0])
            assert.equal(t.panes[0].sy, 0.6)
            assert.equal(t.panes[0].sx, t.panes[1].sx)
            assert.equal(t.panes[0].sx, 0.39)
        })
        it("can be split twice", () => {
            t.panes[0].split("topbottom")
            t.panes[1].split("topbottom")
            assert.exists(t.panes[2])
            assert.equal(t.panes[1].parent, t.panes[0])
            assert.equal(t.panes[2].parent, t.panes[1])
            assert.equal(t.panes[2].layout, t.panes[1].layout)
            assert.equal(t.panes[1].layout, t.panes[0].layout)
            assert.equal(t.panes[0].sy, 0.6)
            assert.equal(t.panes[1].sy, 0.6)
            assert.equal(t.panes[2].sy, 0.6)
            assert.equal(t.panes[0].sx, 0.39)
            assert.equal(t.panes[1].sx, 0.185)
            assert.equal(t.panes[2].sx, 0.185)
            assert.equal(t.panes[0].xoff, 0.1)
            assert.equal(t.panes[1].xoff, 0.51)
            assert.equal(t.panes[2].xoff, 0.715)
            assert.equal(t.panes[0].yoff, 0.2)
            assert.equal(t.panes[1].yoff, 0.2)
            assert.equal(t.panes[2].yoff, 0.2)
        })
        it("can zoom, hiding all other panes", function () {
        })
        it("can resize", function () {
        })
        it("can die nicely, with parent resizing|dieing", function () {
        })
    })
    describe("pane", () => {
        it("can open a web page", () =>{
            let p = t.panes[0]
            p.openURL({})
        })

        /*
        it("can be written to", () =>{
            let p = t.panes[0]
            p.openTerminal()
            p.write('\\n\\nfoo\\n\\n\\rbar\\n\\n\\rbaz')
            p.t.selectAll()
            assert.equal(p.t.getSelection(), '\n\nfoo\n\nbar\n\nbaz')
        })
        it("can send updates when size changes", () => {
                // a simple data channel mock
            var p = t.panes[0]
            var d = {
                called: 0,
                send(data) {
                    d.called++
                    d.lastSentData = data
                }
            }
            p.d = d
            p.sendSize()
            assert.equal(d.called, 1)
            assert.equal(d.lastSentData, 'A($%JFDS*(;dfjmlsdk9-0{"Cols":120,"Rows":10,"X":0,"Y":0}')
        })
        */
    })
})
