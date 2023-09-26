/*! Terminal 7 Gate Tests
 *  This file contains the code that tests terminal 7 - a webrtc based
 *  touchable terminal multiplexer.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { vi, describe, beforeAll, afterEach, it, expect } from 'vitest'
import { Layout } from '../src/layout'
import { Cell } from '../src/cell'
import { T7Map } from '../src/map'
import { Terminal7Mock, sleep } from './infra'
import { Preferences } from '@capacitor/preferences'
import { Gate } from '../src/gate'
import { HTTPWebRTCSession } from '../src/webrtc_session'
import { Terminal } from 'xterm'

vi.mock('xterm')
vi.mock('@revenuecat/purchases-capacitor')
vi.mock('../src/webrtc_session.ts')
vi.mock('../src/ssh_session.ts')

describe("gate", () => {
    var t, e
    beforeAll(async () => {
        await Preferences.clear()
        t = new Terminal7Mock()
        e = document.getElementById("t7")
        window.terminal7 = t
        t.open(e)
    })
    afterEach(() => {
        t.clearTimeouts()
        t.gates = new Array()
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
    it("can create a gate", async () => {
        let addHost = document.getElementById("add-host")
        expect(addHost.classList.contains("hidden")).toBeTruthy()
        document.getElementById("add-static-host").click()
    })
    it("can edit gate", async () => {
        let g = t.addGate({name:"foo"})
        // TODO: add checks here
    })
    it("can be connected", async () => {
        let g = t.addGate()
        expect(typeof g).toEqual("object")
        g.open(e)
        g.connect()
        await sleep(1000)
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
	it("remembers username", async () => {
		let g = t.addGate({name:"foo", addr: "foo", username: "eyal"})
		g.open(e)
		HTTPWebRTCSession.fail = true
		globalThis.webkit = { messageHandlers: { bridge: 1 } } // mock ios
        const map = new T7Map()
        map.open()
        map.shell.start()
        g.map = map
		const t0 = map.t0
		t.map.t0 = t0
        map.shell.t = t0
        map.shell.runCommand("connect", ["foo"])
		await sleep(500)
		expect(t0.out).not.toMatch("Username")

	})
})
