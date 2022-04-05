/*! Terminal 7 Gate Tests
 *  This file contains the code that tests terminal 7 - a webrtc based
 *  touchable terminal multiplexer.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { describe} from 'vitest'
import { Layout } from '../src/layout.js'
import { Cell } from '../src/cell.js'
import { Terminal7Mock, sleep } from './infra.ts'
import { Storage } from '@capacitor/storage'

vi.mock('xterm')
vi.mock('../src/webrtc_session.ts')

describe("gate", () => {
    var t, e
    beforeAll(async () => {
        await Storage.clear()
        t = new Terminal7Mock()
        e = document.getElementById("t7")
        window.terminal7 = t
        t.open(e)
    })
    afterEach(() => {
        t.clearTimeouts()
        t.gates = []
        t.pendingPanes = {}
    })
    it("starts with no gates", () => {
        expect(t.gates.length).to.equal(0)
    })
    it("s state can be restored", async () => {
        let state = { windows: [
            { name: "hello",
              layout: {
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
                            active: true,
                        },
                    ],
              },
            }, { name: "world",
              active: true,
              layout: {
                    dir: "rightleft",
                    sx: 0.8,
                    sy: 0.6,
                    xoff: 0.1,
                    yoff: 0.2,
                    cells: [
                        {
                            sx: 0.4,
                            sy: 0.6,
                            xoff: 0.1,
                            yoff: 0.2,
                        }, {
                            sx: 0.4,
                            sy: 0.6,
                            xoff: 0.5,
                            yoff: 0.2,
                            active: true,
                        },
                    ],
              },
            },
        ]}
        let h = t.addGate()
        expect(typeof h).toEqual("object")
        h.open(e)
        h.setLayout(state)
        expect(h.windows.length).to.equal(2)
        let w = h.activeW
        expect(w.rootLayout.dir).to.equal("rightleft")
        expect(w.name).to.equal("world")
        expect(w.rootLayout.cells[0].xoff).to.equal(0.1)
        expect(w.rootLayout.cells[1].xoff).to.equal(0.5)
        expect(w.activeP.xoff).to.equal(0.5)
        let d = h.dump()
        expect(d.windows.length).to.equal(2)
        expect(d.windows[0].layout.dir).to.equal("topbottom")
        expect(d.windows[0].layout.cells.length).to.equal(2)
        expect(d.windows[0].layout.cells[0].yoff).to.equal(0.2)
        expect(d.windows[0].layout.cells[1].yoff).to.equal(0.5)
    })
    it("has a unique name", () => {
        let g = t.addGate({name:"foo"})
        let g2 = t.addGate({name:"foo"})
        expect(typeof g).toEqual("object")
        expect(typeof g2).toEqual("string")
        expect(g2).to.equal("Gate name is not unique")
    })
    it("can be connected", async () => {
        let g = t.addGate()
        expect(typeof g).toEqual("object")
        g.open(e)
        g.connect()
        await sleep(100)
        expect(g.boarding).to.equal(true)
        expect(g.session.connect).toHaveBeenCalledTimes(1)
        expect(g.session.openChannel).toHaveBeenCalledTimes(1)
        expect(g.session.openChannel.mock.calls[0]).toEqual(["bash", null, 80, 24])
        let panes = g.panes()
        await sleep(100)
        expect(panes.length).to.equal(1)
        expect(panes[0].t).not.toBeNull()
        expect(panes[0].d).not.toBeNull()
        expect(panes[0].d.resize).toHaveBeenCalledTimes(0)
    })
})
