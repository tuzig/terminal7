/*! Terminal 7 Tests
 *  This file contains the code that tests terminal 7 - a webrtc based
 *  touchable terminal multiplexer.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com License: GPLv3
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Terminal7Mock, sleep } from './infra'
import { Terminal } from '@xterm/xterm'
import { installCMD } from '../src/commands'
import { T7Map } from '../src/map'

let out = ""


describe("TWR commands", function() {
    var t, e
    /*
     * Every tests gets a fresh copy of terminal7 and a fresh dom element
     */
    beforeEach(async () => {
        t = new Terminal7Mock()
        e = document.getElementById("t7")
        terminal7=t
        t.open(e)
    })
    afterEach(() => t && t.clearTimeouts())
    describe("Install command", () => {
        it("should use ssh to login to the server", async () => {
            let gate = { }
            let shell = {
                getGate: () => gate,
                t: new Terminal({}),
                runForm: vi.fn(() => "Connect & send command"),
            }
            t.pb = {
                adminCommand: vi.fn(() => "j"),
                getUID: vi.fn(() => "5678"),
                isOpen: vi.fn(() => true),
            }
            shell.t.writeln("try")
            expect(shell.t.out).toMatch(/try/)
            try {
                installCMD(shell, "whatever")
            } catch (e) {
                console.log("install command error", e)
            }
            await sleep(300)
            globalThis.lastSSHChannel.onMessage("Fingerprint: 1234")
            // expect(shell.t.out).toMatch(/~~~~/)
            // TODO: ensure shell.verfyFP has been called
            //
            // expect(shell.verifyFP).toHaveBeenCalled
        })
    })

})
