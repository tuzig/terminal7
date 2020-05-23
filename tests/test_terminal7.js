import { Terminal7 } from "../src/windows.js"
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
        t = new Terminal7()
        t.open(e)
    })

    it("opens with a window and a pane", () => {
        assert.exists(t.windows[0])
        assert.exists(t.panes[0])
        assert.equal(t.panes[0].w, t.windows[0])
        assert.equal(t.panes[0].parent, null)
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
            let originalSx = t.panes[0].sx
            let originalSy = t.panes[0].sy
            t.panes[0].split("rightleft")
            assert.exists(t.panes[1])
            assert.equal(t.panes[1].parent, t.panes[0].parent)
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
        it("can zoom, hiding all other panes", function () {
        })
        it("can resize", function () {
        })
        it("can die nicely, with parent resizing|dieing", function () {
        })
    })
})
