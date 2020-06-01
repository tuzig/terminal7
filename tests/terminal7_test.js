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
        // just a place holder for window names
        e.innerHTML = "<div id='window-names'></div>"
        t = new Terminal7()
        t.open(e)
    })

    it("opens with a window and a pane", () => {
        expect(t.windows[0]).to.exist
        expect(t.cells[0]).to.exist
        assert.equal(t.cells[0].w, t.windows[0])
        assert.equal(t.cells[0].xoff, 0)
        assert.equal(t.cells[0].yoff, 0)
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
            t.activeP.sx = 0.8
            t.activeP.sy = 0.6
            t.activeP.xoff = 0.1
            t.activeP.yoff = 0.2
        })
        it("can set and get sizes", () => {
            let c = new Cell({sx: 0.12, sy: 0.34, t7: t, w: t.activeW})
            assert.equal(c.sx, 0.12)
            assert.equal(c.sy, 0.34)

        })
        it("can set and get offsets", () => {
            let c = new Cell({xoff: 0.12, yoff: 0.34, t7: t, w: t.activeW})
            assert.equal(c.xoff, 0.12)
            assert.equal(c.yoff, 0.34)
        })
        it("has a layout", () => {
            let p0 = t.activeP
            expect(p0.layout.dir).to.equal("TBD")
            expect(p0.layout.cells).to.eql([p0])

        })
        
        it("can be split right to left", () => {
            let p0 = t.activeP,
                p1 = p0.split("rightleft")

            expect(p0.layout.dir).to.equal("rightleft")
            expect(p0.layout.toText()).equal(
                '[0.800x0.300,0.100,0.200,1,0.800x0.300,0.100,0.500,2]' )
            // test sizes
            assert.equal(p0.sx, 0.8)
            assert.equal(p0.sy, t.cells[1].sy)
            assert.equal(p0.sy, 0.3)
            // Test offsets
            assert.equal(p0.xoff, 0.1)
            assert.equal(p0.yoff, 0.2)
            assert.equal(p1.xoff, 0.1)
            assert.equal(p1.yoff, 0.5)
        })
        it("can be split top to bottom", () => {
            let p0 = t.activeP,
                p1 = p0.split("topbottom")
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
            let p0 = t.activeP,
                p1 = p0.split("topbottom"),
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
            let p0 = t.activeP,
                p1 = p0.split("topbottom")
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
            let p0 = t.activeP,
                p1 = p0.split("topbottom")
            p1.close()
            assert.equal(p0.sy, 0.6)
        })
        it("can open a |- layout ", function () {
            let p0 = t.activeP,
                p1 = p0.split("topbottom"),
                p2 = p1.split("rightleft")
            p0.close()
            expect(p1.sy).to.equal(0.3)
            expect(p2.sy).to.equal(0.3)
            expect(p1.sx).to.equal(0.8)
            expect(p2.sx).to.equal(0.8)
        })
        it("can handle three splits", function() {
            let p0 = t.activeP,
                p1 = p0.split("topbottom"),
                p2 = p1.split("rightleft"),
                p3 = p2.split("topbottom")
            p1.close()
            expect(p2.sy).to.equal(0.6)
            expect(p3.sy).to.equal(0.6)
            expect(p2.yoff).to.equal(0.2)
            expect(p3.yoff).to.equal(0.2)
        })
        it("can handle another three splits", function() {
            let p0 = t.activeP,
                p1 = p0.split("topbottom"),
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
            let p0 = t.activeP,
                p1 = p0.split("topbottom")
            expect(p0.e.style.display).to.equal('')
            expect(p0.sx).to.equal(0.4)
            p0.toggleZoom()
            expect(p0.sx).to.equal(1)
            expect(p1.e.style.display).to.equal('none')
            p0.toggleZoom()
            expect(p0.sx).to.equal(0.4)
            expect(p1.e.style.display).to.equal('block')
            p0.toggleZoom()
            expect(p0.e.style.display).to.equal('block')
            expect(p0.sx).to.equal(1)
            expect(p0.sy).to.equal(1)
            expect(p1.e.style.display).to.equal('none')
        })

    })
    describe("pane", () => {
        it("can open a web page", function() {
            let p = t.activeP
            p.openURL({})
        })

        /*
        it("can be written to", () =>{
            let p = t.cells[0]
            p.openTerminal()
            p.write('\\n\\nfoo\\n\\n\\rbar\\n\\n\\rbaz')
            p.t.selectAll()
            assert.equal(p.t.getSelection(), '\n\nfoo\n\nbar\n\nbaz')
        })
        it("can send updates when size changes", () => {
                // a simple data channel mock
            var p = t.cells[0]
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
