import { Pane } from "../src/windows.js"
import { assert } from "chai"


describe("A pane", () => {
    it("Can be constructed using the defaults", () => {
        let pane = new Pane()
        assert.equal(pane.id, "l0")
        assert.equal(pane.sx, 80)
        assert.equal(pane.sy, 24)
    })
})
