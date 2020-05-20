import { Terminal7 } from "../src/windows.js"
import { assert } from "chai"


describe("terminal7", function() {
    var t, e
    beforeEach(() => {
        t = new Terminal7()
        e = document.createElement("div")
        console.log("before")
        t.open(e)
    })

    it("opens with a window and a pane", () => {
        assert.exists(undefined)
        assert.exists(t.windows[0])
        assert.exists(t.panes[0])
        assert.equal(t.panes[0].parent, t.windows[0])
    })
    describe("window", () => {
        it("can be added", function() {
            let w = t.addWindow("gothic")
            assert.exists(t.windows[1])
            assert.exists(t.windows[1].name, "gothic")
        })
    })

    describe("pane", () => {
        it("can be split", () => {
            t.panes[0].split("rightleft")
            assert.exists(t.panes[1])
            assert.equal(t.panes[1].parent, t.panes[0])
        })
        it("can be written to", () =>{
            p = t.panes[0]
            assert.notExists(Terminal7.panes.bar)
            p.setEcho(true)
            p.write("hello world")
            assert.equal(p.getText(0, 0, 0, 11), "hello world")
        })
        it("can zoom, hiding all other panes", function () {
        })
        it("can resize", function () {
        })
        it("can die nicely, with parent resizing|dieing", function () {
        })
    })
})
