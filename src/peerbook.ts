/* Terminal7 PeerBook connection
 * 
 * This file contains the code for the class used to comunicate with 
 * PeerBook 
 *
 *  Copyright: (c) 2022 Tuzig LTD
 *  License: GPLv3
 */

import { Gate } from './gate.ts'

export class PeerbookConnection {
    ws: WebSocket = null
    host = "https://api.peerbook.io"
    insecure = false
    fp: string
    pbSendTask = null
    onUpdate: (r: string) => void
    pending: Array<string>
    verified: boolean

    constructor(fp, host = "api.peerbook.io", insecure = false) {
        this.fp = fp
        this.host = host
        this.insecure = insecure
        this.pending = []
        this.verified = false
    }
    connect() {
        return new Promise<void>((resolve, reject) =>{
            if ((this.ws != null) && this.isOpen()) {
                if (this.verified) {
                    console.log("PB already connected")
                    resolve()
                }
                else {
                    console.log("PB already connected but not verified")
                    reject()
                }
                return
            }
            const schema = this.insecure?"ws":"wss",
                  url = encodeURI(`${schema}://${this.host}/ws?fp=${this.fp}`)
            this.ws = new WebSocket(url)
            this.ws.onmessage = ev => {
                const m = JSON.parse(ev.data)
                if (m.code >= 400) {
                    console.log("peerbook connect got code", m.code)
                    if (m.code == 401) {
                        window.terminal7.notify(`\uD83D\uDCD6 Terminal7 is unverified`)
                    } else {
                        window.terminal7.notify(`\uD83D\uDCD6 PeerBook connection error ${m.code}`)
                        this.ws = null
                    }
                    reject()
                    return
                } 
                this.verified = true
                resolve()
                if (this.onUpdate)
                    this.onUpdate(m)
                else
                    terminal7.log("got ws message but no onUpdate", m)
            }
            this.ws.onerror = ev =>  {
                window.terminal7.log("peerbook ws error", ev)
                reject(ev)
            }
            this.ws.onclose = (ev) => {
                window.terminal7.log("peerbook ws closed", ev)
                window.terminal7.notify("\uD83D\uDCD6 Connection closed")
                this.ws = null
            }
            this.ws.onopen = () => {
                if ((this.pbSendTask == null) && (this.pending.length > 0))
                    this.pbSendTask = setTimeout(() => {
                        this.pending.forEach(m => {
                            console.log("sending ", m)
                            this.ws.send(JSON.stringify(m))
                        })
                        this.pbSendTask = null
                        this.pending = []
                    }, 10)
            }
        })
    }
    send(m) {
        // null message are used to trigger connection, ignore them
        const state = this.ws ? this.ws.readyState : WebSocket.CLOSED
        if (state == WebSocket.OPEN) {
            this.ws.send(JSON.stringify(m))
        } else
            this.pending.push(m)
    }
    close() {
        if (this.ws) {
            this.ws.onopen = undefined
            this.ws.onmessage = undefined
            this.ws.onerror = undefined
            this.ws.onclose = undefined
            this.ws.close()
        }
        this.ws = null
    }
    isOpen() {
        return this.ws ? this.ws.readyState === WebSocket.OPEN : false
    }
    syncPeers(gates: Array<Gate>, nPeers: Array<any>) {
        const ret = []
        const index = {}
        gates.forEach(p => {
            ret.push(p)
            index[p.name] = p
        })
        if (!nPeers)
            return ret
        nPeers.forEach(p => {
            if (p.kind != "webexec")
                return
            let gate = index[p.name]
            if (!gate) {
                gate = new Gate(p)
                gate.id = ret.length
                gate.nameE = terminal7.map.add(gate)
                gate.open(terminal7.e)
                ret.push(gate)
                terminal7.map.shell.verifyPeer(gate)
            }
            for (const k in p) {
                gate[k] = p[k]
            }
            gate.updateNameE()
        })
        return ret
    }
}
