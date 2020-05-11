import { Cell, Layout, Pane } from "../src/windows.js"
import { assert } from "chai"


describe("A Cell", function() {
    it("Can be constructed using the defaults", function() {
        let cell = new Cell({id: "foo"})
        assert.equal(cell.id, "foo")
        assert.equal(cell.sx, 80)
        assert.equal(cell.sy, 24)
        assert.equal(cell.xoff, 0)
        assert.equal(cell.yoff, 0)
    })
    it("Can be constructed using properties", function() {
        let cell = new Cell({id: "bar", sx: 120, sy: 10, xoff: 18, yoff: 13})
        assert.equal(cell.id, "bar")
        assert.equal(cell.sx, 120)
        assert.equal(cell.sy, 10)
        assert.equal(cell.xoff, 18)
        assert.equal(cell.yoff, 13)
    })
    it("Can be relocated without an elment", function () {
        let cell = new Cell({id: "bar", sx: 20, sy: 10})
        cell.relocate(30, 15, 1, 2)
        assert.equal(cell.sx, 30)
        assert.equal(cell.sy, 15)
        assert.equal(cell.xoff, 1)
        assert.equal(cell.yoff, 2)
    })

})
describe("A Layout", function() {
    it("can be created", function() {
        let cell = new Cell({id: "bar", sx: 120, sy: 10, xoff: 18, yoff: 13})
        let layout = new Layout("foo", cell)
        assert.equal(layout.sx, 120)
        assert.equal(layout.sy, 10)
        assert.equal(layout.xoff, 18)
        assert.equal(layout.yoff, 13)
        assert.equal(layout.sons.length, 0)
    })
    it("can find its children", function() {
        let cell = new Cell({id: "bar", sx: 120, sy: 10, xoff: 18, yoff: 13})
        let layout = new Layout("foo", cell)
        assert.equal(layout.findChild(null), null)
        var child = new Cell({id: "ma"})
        layout.sons.push(child)
        assert.equal(layout.sons.length, 1)
        assert.equal(layout.findChild(child), 0)
        layout.removeChild(child)
        assert.equal(layout.findChild(child), null)
    })
})
describe("A Pane", function() {
    it("its elment can be created and removed", function() {
        let pane = new Pane({id: "bar", sx: 120, sy: 10, xoff: 18, yoff: 13})
        pane.createElement("test")
        var es = document.getElementsByClassName("test")
        assert.equal(es.length, 1)
        assert.equal(es[0].parentNode.id, 'terminal7')
        pane.removeElment()
        es = document.getElementsByClassName("test")
        assert.equal(es.length, 0)
    })
    it("its terminal can be created", function() {
        let pane = new Pane({id: "bar", sx: 120, sy: 10, xoff: 18, yoff: 13})
        pane.createElement("test")
        pane.openTerminal()
        assert.equal(pane.state, 1)
        assert.equal(pane.t.cols, 120)
        assert.equal(pane.t.rows, 10)
        pane.removeElment()
    })
    it("can send its size", function() {
        let pane = new Pane({id: "bar", sx: 120, sy: 10, xoff: 18, yoff: 13})
        // a simple data channel mock
        var d = {
            called: 0,
            send(data) {
                d.called++
                d.lastSentData = data
            }
        }
        pane.d = d
        pane.sendSize()
        assert.equal(d.called, 1)
        assert.equal(d.lastSentData, 'A($%JFDS*(;dfjmlsdk9-0{"Cols":120,"Rows":10,"X":0,"Y":0}')
    })
    it("can split", function() {
        let pane = new Pane({id: "bar", sx: 120, sy: 10, xoff: 18, yoff: 13})
        // a simple data channel mock
        var d = {
            called: 0,
            send(data) {
                d.called++
                d.lastSentData = data
            }
        }
        pane.d = d
        pane.sendSize()
        assert.equal(d.called, 1)
        assert.equal(d.lastSentData, 'A($%JFDS*(;dfjmlsdk9-0{"Cols":120,"Rows":10,"X":0,"Y":0}')
    })
})
