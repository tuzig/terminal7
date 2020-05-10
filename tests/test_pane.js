import { Cell, Layout } from "../src/windows.js"
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
        assert.equal(cell.id, "bar")
        let layout = new Layout("foo", cell)
        assert.equal(layout.sx, 120)
        assert.equal(layout.sy, 10)
        assert.equal(layout.xoff, 18)
        assert.equal(layout.yoff, 13)
    })
})
