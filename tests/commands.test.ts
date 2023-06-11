/*! Terminal 7 Tests
 *  This file contains the code that tests terminal 7 - a webrtc based
 *  touchable terminal multiplexer.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com License: GPLv3
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Terminal7Mock, sleep } from './infra'
import { Terminal } from 'xterm'
import { installCMD } from '../src/commands'
import { T7Map } from '../src/map'

let out = ""

vi.mock('xterm')
vi.mock('../src/ssh_session.ts')
vi.mock('../src/webrtc_session.ts')

describe("TWR commands", function() {
    var t, e
    /*
     * Every tests gets a fresh copy of terminal7 and a fresh dom element
     */
    beforeEach(async () => {
        t = new Terminal7Mock()
        e = document.getElementById("t7")
        window.terminal7=t
        t.open(e)
    })
    afterEach(() => t && t.clearTimeouts())
    describe("Install command", () => {
        it("should use ssh to login to the server", async () => {
            let gate = { }
            let shell = {
                getGate: () => gate,
                t: new Terminal({}),
                verifyFP: vi.fn(),
            }
            shell.t.writeln("try")
            expect(shell.t.out).toMatch(/try/)
            installCMD(shell, "whatever")
            await sleep(300)
            globalThis.lastSSHChannel.onMessage("Fingerprint: 1234")
            // expect(shell.t.out).toMatch(/~~~~/)
            // TODO: ensure shell.verfyFP has been called
            //
            // expect(shell.verifyFP).toHaveBeenCalled
        })
    })

    /* TODO: move to aatp
    describe("Verify fingerprint command", () => {
        it("should verify the fingerprint", async () => {
            let map = new T7Map()
            let verifyFinished = false
            map.open()
            map.shell.start()
            let shell = map.shell
            shell.t.out = ""
            shell.askValue = async () => "5678"
            shell.verifyFP("1234", "whatever").then(() => verifyFinished = true)
            await sleep(500)
            // expect (shell.pbSession.openChannel).toHaveBeenCalled()
            globalThis.lastHTTPWebRTCChannel.onMessage([ "1".charCodeAt(0) ])
            await sleep(100)
            console.log("output", shell.t.out)
            expect(shell.t.out).toEqual("")
            while (!verifyFinished) {
                await sleep(100)
            }
        })
    })
    */
})
