/*! Terminal 7 Tests
 *  This file contains the code that tests terminal 7 - a webrtc based
 *  touchable terminal multiplexer.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Terminal7Mock, sleep } from './infra'
import { Terminal } from 'xterm'
import { installCMD } from '../src/commands'

let out = ""

vi.mock('xterm')
vi.mock('../src/ssh_session.ts', async () => {
    const org = await vi.importActual('../src/__mocks__/ssh_session.ts')
    const mockedChannel =  {
        ...org,
        send: (msg:string) => out += msg,
    }
    vi.stubGlobal('MockedChannel', mockedChannel)
    return mockedChannel
})


vi.mock('../src/webrtc_session.ts')

// HTMLCanvasElement.prototype.getContext = vi.fn()

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
        it("should use ssh to login to the server", () => {
            let gate = { }
            let shell = {
                getGate: () => gate,
                t: new Terminal({}),
            }
            shell.t.writeln("try")
            expect(shell.t.out).toMatch(/try/)
            installCMD(shell, "whatever")
            sleep(10)
            globalThis.MockedChannel.onMessage({data: "Fingerprint: 1234"})
            // expect(shell.t.writeln).toHaveBeenCalledWith("Installing terminal7 on the server")
            expect(shell.t.out).toMatch(/Connected/)
        })
        it("print QR and verify OTP", () => {
            expect(0).toBe(1)
        })
    })
})
