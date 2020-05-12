import { Terminal7 } from "../src/windows.js"
import { assert } from "chai"


describe("widnow-add notification", function() {
    it("works as extected", function() {
        assert.notExists(Terminal7.windows.foo)
        Terminal7.windowAdd("foo")
        assert.exists(Terminal7.windows.foo)

    })
})
describe("output command", function() {
    it("can create a pane when needed", function () {
        Terminal7.windowAdd("foo")
        Terminal7.write("bar", "hello world")
        var pane = Terminal7.panes.bar
        assert.exists(pane)
        assert.equal(pane.parent, null)
        pane.t.select(0, 0, 11)
        console.log(pane.t.getSelection())
        assert.equal(tbuf.getLine(0), "hello world")
    })
})
