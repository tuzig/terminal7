
/*! Terminal 7 Tests
 *  This file contains the code that tests terminal 7 - a webrtc based
 *  touchable terminal multiplexer.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { describe, expect, it, vi } from 'vitest'
import { Terminal7Mock, sleep } from './infra'
import { Terminal } from 'xterm'
import { installCMD } from '../src/commands'

vi.mock('xterm')
vi.mock('../src/ssh_session.ts')
vi.mock('../src/webrtc_session.ts')

HTMLCanvasElement.prototype.getContext = vi.fn()

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
    describe("Install command", function() {
        it("should use ssh to login to the server", async function() {
            let gate = { }
            let shell = {
                getGate: () => gate,
                t: new Terminal({}),
            }
            installCMD(shell, "whatever")
            sleep(100)
            // expect(shell.t.writeln).toHaveBeenCalledWith("Installing terminal7 on the server")
            expect(shell.t.out).toMatch(/Connected/)
        })
        it("prompt for the install command", async function() {
            expect(t.sessions.length).toBe(1)
            expect(t.sessions[0].prompt).toBe("install")
        })
    })
})
