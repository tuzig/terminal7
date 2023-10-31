/* Terminal7 PeerBook connection
 * 
 * This file contains the code for the class used to comunicate with 
 * PeerBook 
 *
 *  Copyright: (c) 2022 Tuzig LTD
 *  License: GPLv3
 */

import { CustomerInfo } from "@revenuecat/purchases-typescript-internal-esm"

export const PB = "\uD83D\uDCD6"
import { Capacitor } from '@capacitor/core'
import { Device } from '@capacitor/device'
import { Purchases } from '@revenuecat/purchases-capacitor'
import { HTTPWebRTCSession } from './webrtc_session'
import { Gate } from './gate'
import { PeerbookSession } from "./webrtc_session"
import { Shell } from './shell'
import {OPEN_HTML_SYMBOL} from './terminal7'

interface PeerbookProps {
    fp: string,
    host: string,
    insecure: boolean,
    shell: Shell
}

interface Peer {
    name: string
    user: string
    kind: string
    verified: boolean
    created_on: number
    verified_on: number
    last_connected: number
    online: boolean
    auth_token?: string
}

export class PeerbookConnection {
    ws: WebSocket = null
    host: string
    insecure = false
    fp: string
    pbSendTask = null
    onUpdate: (r: string) => void
    pending: Array<string>
    session: HTTPWebRTCSession | null = null
    token: string
    shell: Shell
    uid: string
    updatingStore = false
    spinnerInterval = null
    headers: Map<string,string>

    constructor(props:PeerbookProps) {
        // copy all props to this
        Object.assign(this, props)
        this.pending = []
        this.token = ""
        this.headers = new Map<string, string>()
        this.uid = ""
    }

    async adminCommand(msg: unknown): Promise<string> {
        if (!this.session) {
            console.log("Admin command with no session")
            try {
                await this.connect()
            } catch (e) {
                console.log("Failed to connect to peerbook", e)
                throw new Error("Failed to connect")
            }
        }   
        return new Promise((resolve, reject) => {
            this.session.sendCTRLMsg(msg, resolve, reject)
        })
    }

    async register() {
        let email: string
        let peerName: string
        let repStr: string
        let fp: string
        let userData

        this.echo("Registering with PeerBook")
        try {
            peerName = await this.shell.askValue("Peer name", (await Device.getInfo()).name)
            email = await this.shell.askValue("Recovery email")
        } catch (e) {
            console.log("Registration Cancelled", e)
            this.shell.t.writeln("Cancelled. Use `subscribe` to try again")
            await this.shell.escapeActiveForm()
            return
        }
        try {
            repStr = await this.adminCommand({
                type: "register",
                args: {
                     email: email,
                     peer_name: peerName
                }
            })
        } catch (e) {
            this.shell.t.writeln(`${PB} Registration failed\n    Please try again and if persists, \`support\``)
            this.shell.printPrompt()
            return
        }
            
        try {
            userData = JSON.parse(repStr)
        } catch (e) {
            this.shell.t.writeln(`${PB} Registration failed\n    Please try again and if persists, \`support\``)
            this.shell.printPrompt()
            return
        }
        const QR = userData.QR
        const uid = userData.ID
        this.uid = uid
        // eslint-disable-next-line
        this.echo("Please scan this QR code with your OTP app")
        this.echo(QR)
        this.echo("")
        this.echo("and use it to generate a One Time Password")
        // verify ourselves - it's the first time and we were approved thanks 
        // to the revenuecat's user id
        this.shell.startWatchdog(3000).catch(() => {
            this.shell.t.writeln("Timed out waiting for OTP")
            this.shell.printPrompt()
        })
        try {
            fp = await terminal7.getFingerprint()
        } catch (e) {
            this.shell.t.writeln("Failed to get fingerprint")
            this.shell.printPrompt()
            return
        }
        try {
            await this.verifyFP(fp, "OTP")
        } catch (e) {
            console.log("error verifying OTP", e.toString())
            this.shell.t.writeln("Failed to verify OTP")
            this.shell.printPrompt()
            return
        } finally {
            this.shell.stopWatchdog()
        }
        await Purchases.logIn({ appUserID: uid })
        this.shell.t.writeln("Validated! Use `install` to install on a server")
        this.shell.printPrompt()
    }
    async startPurchases() {
        console.log("Starting purchases")
        await Purchases.setMockWebResults({ shouldMockWebResults: true })
        const keys = {
            ios: 'appl_qKHwbgKuoVXokCTMuLRwvukoqkd',
            android: 'goog_ncGFZWWmIsdzdfkyMRtPqqyNlsx'
        }
        const props = {
            apiKey: keys[Capacitor.getPlatform()],
        }

        try {
            await Purchases.configure(props)
        } catch (e) {
            terminal7.log("Failed to setup purchases", e)
            return
        }
    }

    /*
     * gets customer info from revenuecat and act on it
    */
    async updateCustomerInfo() {
        let data: {
            customerInfo: CustomerInfo;
        }
        try {
            data = await Purchases.getCustomerInfo()
        } catch (e) {
            terminal7.log("Failed to get customer info", e)
            return
        }
        await this.onPurchasesUpdate(data)
    }

    async onPurchasesUpdate(data) {
        console.log("onPurchasesUpdate", data)
            // intialize the http headers with the bearer token
        if (this.updatingStore) {
            terminal7.log("got anotyher evenm while updatingStore")
            return
        }
        const active = data.customerInfo.entitlements.active
        this.close()
        if (!active.peerbook) {
            this.updatingStore = false
            return
        }
        this.shell.stopWatchdog()
        const uid = data.customerInfo.originalAppUserId
        terminal7.log("Subscribed to PB, uid: ", uid)
        try {
            await this.connect(uid)
        } catch (e) {
            terminal7.log("Failed to connect", e)
        } finally {
            this.updatingStore = false
        }
    }
    async echo(data: string) {
        this.shell.t.writeln(data)
    }

    getUID() {
        return new Promise<string>((resolve, reject) => {
            if ((this.uid != "TBD") && (this.uid != "")) {
                resolve(this.uid)
                return
            }
            if (!this.session) {
                console.log("get UID with No session")
                reject("No session")
                return
            }
            this.session.sendCTRLMsg({type: "ping"}, (uid: string) => {
                this.uid = uid
                resolve(uid)
            }, reject)
        })
    }
            

    async connect(token?: string, count = 0) {
        return new Promise<void>((resolve, reject) =>{
            if (this.session) {
                if (this.uid == "TBD") {
                    reject("Unregistered")
                    return
                } else if (this.isOpen()) {
                    resolve()
                    return
                }
                console.log("Closing existing session connection state:", this.session.pc.connectionState)
                this.session.close()
                this.session = null
            }
            // connect to admin over webrtc
            const schema = terminal7.conf.peerbook.insecure? "http" : "https"
            const url = `${schema}://${terminal7.conf.net.peerbook}/we`
            if (token)
                this.headers.set("Authorization", `Bearer ${token}`)
            const session = new HTTPWebRTCSession(url, this.headers)
            this.session = session
            session.onStateChange = (state, failure?) => {
                if (state == 'connected') {
                    terminal7.log("Connected PB webrtc connection")
                    // send a ping to get the uid
                    this.getUID().then(uid => {
                        if (uid == "TBD") {
                            terminal7.log("Got TBD as uid")
                            reject("Unregistered")
                        } else {
                            Purchases.logIn({ appUserID: uid })
                            resolve()
                        }
                    }).catch(e => {
                        this.session = null
                        terminal7.log("Failed to get user id", e.toString())
                        resolve()
                    })
                    return
                }
                else if (state == 'disconnected' || state == 'failed' || state == 'closed') {
                    // TODO: retry connection
                    // symbol = ERROR_HTML_SYMBOL
                    this.session.close()
                    this.session = null
                    console.log("PB webrtc connection failed", failure, this.uid)
                    if (failure == "Unauthorized")
                        reject(failure)
                    else {
                        if  (count > 3)
                            reject(failure)
                        else {
                            setTimeout(() => {
                                this.connect(token, count+1).then(resolve).catch(reject)
                            }, 100)
                        }
                    }
                    return
                }
            }
            session.onCMD = (msg) => this.onMessage(msg)
            session.connect()
        })
    }
    close() {
        if (this.ws) {
            this.ws.onopen = undefined
            this.ws.onmessage = undefined
            this.ws.onerror = undefined
            this.ws.onclose = undefined
            this.ws.close()
            this.ws = null
        }
        if (this.session) {
            this.session.onStateChange = undefined
            this.session.close()
            this.session = null
        }
    }
    isOpen() {
        return (this.session && this.session.isOpen())
    }
    syncPeers(gates: Array<Gate>, nPeers: Array<Peer>) {
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
            }
            for (const k in p) {
                gate[k] = p[k]
            }
            gate.updateNameE()
        })
        return ret
    }
    async verifyFP(fp: string, prompt?: string) {
        let validated = false
        // TODO:gAdd biometrics verification
        while (!validated) {
            console.log("Verifying FP", fp)
            let otp: string
            try {
                otp = await this.shell.askValue(prompt || "Enter OTP to verify gate")
            } catch(e) {
                return
            }
            if (!this.session) {
                console.log("verifyFP: creating new session")
                await this.connect()
            }
            try {
                await this.adminCommand({
                    type: "verify",
                    args: {
                        target: fp, 
                        otp: otp
                    }
                })
                validated = true
            } catch(e) {
                if (e.toString().match(/invalid/i)) 
                    this.echo("Invalid OTP, please try again")
                else {
                    console.log("verifyFP: failed to verify", e.toString())
                    this.echo("Failed to verify, please try again")
                } 
            }
        } 
        const gate = terminal7.gates.find(g => g.fp === fp) 
        if (gate) {
            gate.verified = true
            gate.updateNameE()
        } else {
            terminal7.log("Failed to update gate status as it wasn't found")
            terminal7.gates.forEach((g,i: number) => terminal7.log(`gate ${i}:`, g.fp))
        }
    }
    purchase(aPackage): Promise<void> {
        return new Promise((resolve, reject) => {
            // ensure there's only one listener
            Purchases.purchasePackage({ aPackage }).then(customerInfo => {
                this.onPurchasesUpdate(customerInfo).then(resolve).catch(reject)
            }).catch(e => {
                console.log("purchase failed", e)
                reject(e)
            })
        })
    }   
    stopSpinner() {
        const statusE = document.getElementById("peerbook-status") as HTMLElement
        statusE.style.opacity = "1"
        if (this.spinnerInterval) {
            clearInterval(this.spinnerInterval)
            this.spinnerInterval = null
        }
    }
    startSpinner() {
        const statusE = document.getElementById("peerbook-status")
        let i = 0.1, change = 0.1
        if (this.spinnerInterval)
            return
        this.spinnerInterval = setInterval(() => {
            i = i + change 
            if (i > 1 || i < 0) {
                change = -change
                i = i + change
            }
            statusE.style.opacity = String(i)
        }, 200)
        statusE.innerHTML = OPEN_HTML_SYMBOL
        statusE.style.opacity = "0"
    }
    // handle incomming peerbook messages
    async onMessage(m) {
        const statusE = document.getElementById("peerbook-status")
        terminal7.log("got pb message", m)
        if (m["code"] !== undefined) {
            if (m["code"] == 200) {
                statusE.innerHTML = OPEN_HTML_SYMBOL
                this.uid = m["text"]
            } else
                // TODO: update statusE
                terminal7.notify(`{PB}  ${m["text"]}`)
            return
        }
        if (m["peers"] !== undefined) {
            terminal7.gates = this.syncPeers(terminal7.gates, m.peers)
            terminal7.map.refresh()
            return
        }
        // TODO: is this needed?
        if (m["verified"] !== undefined) {
            if (!m["verified"])
                terminal7.notify(`${PB} Unverified client. Please check you email.`)
            return
        }
        const fp = m.source_fp
        // look for a gate where g.fp == fp
        const myFP = await terminal7.getFingerprint()
        if (fp == myFP) {
            return
        }
        let lookup =  terminal7.gates.filter(g => g.fp == fp)

        if (!lookup || (lookup.length != 1)) {
            if (m["peer_update"] !== undefined) {
                lookup =  terminal7.gates.filter(g => g.name == m.peer_update.name)
            }
            if (!lookup || (lookup.length != 1)) {
                terminal7.log("Got a pb message with unknown peer: ", fp)
                return
            }
        }
        const g = lookup[0]

        if (m["peer_update"] !== undefined) {
            g.online = m.peer_update.online
            g.verified = m.peer_update.verified
            if (g.name != m.peer_update.name) {
                g.name = m.peer_update.name
                terminal7.storeGates()
            }
            await g.updateNameE()
            return
        }
        if (!g.session) {
            console.log("session is close ignoring message", m)
            return
        }
        const session = g.session as PeerbookSession
        if (m.candidate !== undefined) {
            session.peerCandidate(m.candidate)
            return
        }
        if (m.answer !== undefined ) {
            const answer = JSON.parse(atob(m.answer))
            session.peerAnswer(answer)
            return
        }
    }
}
