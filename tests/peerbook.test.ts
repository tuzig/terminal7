/*! Terminal 7 Tests
 *  This file contains the code that tests terminal 7 - a webrtc based
 *  touchable terminal multiplexer.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { Terminal } from '@xterm/xterm'
import { PeerbookConnection } from '../src/peerbook.ts'

import { sleep } from './infra'

vi.mock('@xterm/xterm')
vi.mock('@revenuecat/purchases-capacitor')
vi.mock('../src/ssh_session.ts')
vi.mock('../src/webrtc_session.ts')
vi.mock('@capacitor-community/native-audio')

describe("peerbook interface", function() {
    var t, e
    /*
     * Every tests gets a fresh copy of terminal7 and a fresh dom element
     */
    describe("syncing peers", () => {
        const pbConnection = new PeerbookConnection()
        const fooGate = {
            name: "foo",
            id: 0,
            kind: "webexec",
            updateNameE: vi.fn(),
        }
        beforeAll(() => {
            window.terminal7 = {
                map: { add: vi.fn() },
                e: document.createElement("div")
            }
        })
        it ("doesn't change on empty peers", () => {
            const peers = pbConnection.syncPeers( [fooGate], [{}])
            expect(peers.length).to.equal(1)
            expect(peers[0].name).to.equal("foo")
            expect(peers[0].id).to.equal(0)
        })
        it("can merge a peer", () => {
            const peers = pbConnection.syncPeers(
                [{
                    name: "foo",
                    id: 0,
                    fp: "baz",
                    kind: "webexec",
                    updateNameE: vi.fn(),
                }],
                [{name: "foo", fp: "bar", kind: "webexec"}]
            )
            expect(peers.length).to.equal(1)
            expect(peers[0].name).to.equal("foo")
            expect(peers[0].id).to.equal(0)
            expect(peers[0].fp).to.equal("bar")
        })
        it("can merge unrelated peers", () => {
            const peers = pbConnection.syncPeers([fooGate],
                [{name: "bar", fp: "bar", kind: "webexec"}])
            expect(peers.length).to.equal(2)
            expect(peers[0].name).to.equal("foo")
            expect(peers[0].id).to.equal(0)
            expect(peers[1].name).to.equal("bar")
            expect(peers[1].fp).to.equal("bar")
        })
    })
})
