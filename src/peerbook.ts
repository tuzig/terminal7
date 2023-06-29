/* Terminal7 PeerBook connection
 * 
 * This file contains the code for the class used to comunicate with 
 * PeerBook 
 *
 *  Copyright: (c) 2022 Tuzig LTD
 *  License: GPLv3
 */

const PB = "\uD83D\uDCD6"

import { Device } from '@capacitor/device';
import { CapacitorPurchases } from '@capgo/capacitor-purchases'
import { Failure } from './session'
import { HTTPWebRTCSession } from './webrtc_session'
import { Gate } from './gate'
import { Shell } from './shell'

export class PeerbookConnection {
    ws: WebSocket = null
    host = "https://api.peerbook.io"
    insecure = false
    fp: string
    pbSendTask = null
    onUpdate: (r: string) => void
    pending: Array<string>
    verified: boolean
    session: HTTPWebRTCSession | null = null
    token: string
    shell: Shell
    updateingStore = false

    constructor(props:Map<string, Any>) {
        // copy all props to this
        Object.assign(this, props)
        this.pending = []
        this.verified = false
        this.token = ""
        this.headers = new Map<string, string>()
    }

    async adminCmd(cmd: string, ...args: string[]) {
        const c = args?[cmd, ...args]:[cmd]
        if (!this.session) {
            await this.connect()
        }   

        return new Promise(resolve => {
            const reply = []
            console.log("adminCmd w/ session", this.session)
            this.session.openChannel(c, 0, 80, 24).then(channel  => {
                channel.onClose = () => {
                    const ret =  new TextDecoder().decode(new Uint8Array(reply))
                    terminal7.log(`cmd ${cmd} ${args} closed with: ${ret}`)
                    resolve(ret)
                }
                channel.onMessage = (data) => {
                    reply.push(...data)
                }
            })
        })
    }

    async register() {
        let email: string
        let peerName: string
        let repStr: string
        let fp: string
        let userData

        try {
            peerName = await this.shell.askValue("Peer name", (await Device.getInfo()).name)
            email = await this.shell.askValue("Recovery email")
        } catch (e) {
            console.log("Registration Cancelled", e)
            this.shell.t.writeln("Cancelled. Use `subscribe` to try again")
            await this.escapeActiveForm()
            return
        }
        try {
            repStr = await this.adminCmd("register", email, peerName)
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
        // eslint-disable-next-line
        this.echo("Please scan this QR code with your OTP app")
        this.echo(QR)
        this.echo()
        this.echo("and use it to generate a One Time Password")
        // verify ourselves - it's the first time and we were approved thanks 
        // to the revenuecat's user id
        this.shell.startWatchdog().catch(() => {
            this.shell.t.writeln("Timed out waiting for OTP")
            this.shell.printPrompt()
        }, 3000)
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
        await CapacitorPurchases.logIn({ appUserID: uid })
        this.shell.t.writeln(`Validated! User ID is ${uid}`)
        this.shell.t.writeln("Type `install` to install on a server")
        this.wsConnect()
        this.shell.printPrompt()
    }
    async startPurchases() {
        console.log("Starting purchases")
        const props = {
            apiKey: 'appl_qKHwbgKuoVXokCTMuLRwvukoqkd',
        }

        try {
            await CapacitorPurchases.setDebugLogsEnabled({ enabled: true }) 
            await CapacitorPurchases.setup(props)
        } catch (e) {
            terminal7.log("Failed to setup purchases", e)
            return
        }
    }

    /*
     * gets customer info from revenuecat and act on it
    */
    async updateCustomerInfo() {
        let data: CapacitorPurchases.PurchasesUpdatedPurchaserInfo
        try {
            data = await CapacitorPurchases.getCustomerInfo()
        } catch (e) {
            terminal7.log("Failed to get customer info", e)
            return
        }
        await this.onPurchasesUpdate(data)
    }

    /*
    * Open a session with PeerBook
    * first opens a webrtc connection, then pings to get the uid
    * and finally starts the purchases
    */
    async onPurchasesUpdate(data) {
        console.log("onPurchasesUpdate", data)
            // intialize the http headers with the bearer token
        if (this.updateingStore) {
            terminal7.log("got anotyher evenm while updateingStore")
            return
        }
        const active = data.customerInfo.entitlements.active
        this.close()
        if (!active.peerbook) {
            // log out to clear the cache
            /*
            try {
                CapacitorPurchases.logOut()
            } catch (e) {
                terminal7.log("Failed to log out", e)
            }
            */
            this.updateingStore = false
            return
        }
        const uid = data.customerInfo.originalAppUserId
        terminal7.log("Subscribed to PB, uid: ", uid)
        // if uid is temp then we need to complete registration
        // we identify temp id by checking if they contain a letter
        if (uid[0]=="$")
            try {
                await this.connect(uid)
                // await this.register(uid)
            } catch (e) {
                terminal7.log("Failed to register", e.toString())
                this.updateingStore = false
                return
            }
        else {
            terminal7.notify(`${PB} Regsitered uid: uid`)
            this.wsConnect()
        }
        this.updateingStore = false
    }
    async echo(data: string) {
        this.shell.t.writeln(data)
    }


    async connect(token?: string) {
        if (this.session)
            return
        return new Promise<void>((resolve, reject) =>{
            // connect to admin over webrtc
            const schema = terminal7.conf.peerbook.insecure? "http" : "https"
            const url = `${schema}://${terminal7.conf.net.peerbook}/we`
            if (token)
                this.headers.set("Authorization", `Bearer ${token}`)
            const session = new HTTPWebRTCSession(url, this.headers)
            this.session = session
            session.onStateChange = async (state, failure?) => {
                if (state == 'connected') {
                    terminal7.log("Connected PB webrtc connection")
                    // send a ping to get the uid
                    this.adminCmd("ping").then(uid => {
                        if (uid == "TBD") {
                            terminal7.log("Got TBD as uid")
                            this.register(token).then(resolve).catch(reject)
                        } else {
                            terminal7.notify(`${PB} Your PeerBook user id is ${uid}`)
                            CapacitorPurchases.logIn({ appUserID: uid })
                            this.wsConnect().then(resolve).catch(reject)
                        }
                    }).catch(e => {
                        this.session = null
                        terminal7.log("Failed to get user id", e.toString())
                        resolve()
                    })
                    return
                }
                else if (state == 'failed') {
                    this.session = null
                    // TODO: remove websocket
                    if (failure == Failure.TimedOut) {
                        this.echo("Connection timed out")
                        this.echo("Please try again and if persists, `open issue`")
                    } else if (failure == Failure.Unauthorized) {
                        terminal7.log("peerbook connection unauthorized")
                    } else {
                        this.echo("Connection failed: " + failure)
                        this.echo("Please try again and if persists, contact support")
                    }
                    this.shell.printPrompt()
                    reject(failure)
                    return
                }
            }
            session.connect()
        })
    }
    async wsConnect() {
        console.log("peerbook wsConnect called")
        return new Promise<void>((resolve, reject) => {
            if (this.ws != null) {
                this.ws.onopen = undefined
                this.ws.onmessage = undefined
                this.ws.onerror = undefined
                this.ws.onclose = undefined
                this.ws.close()
            }
            const schema = this.insecure?"ws":"wss",
                  url = encodeURI(`${schema}://${this.host}/ws?fp=${this.fp}`)
            this.ws = new WebSocket(url)
            this.ws.onmessage = ev => {
                const m = JSON.parse(ev.data)
                if (m.code >= 400) {
                    console.log("peerbook connect got code", m.code)
                    if (m.code == 401) {
                        window.terminal7.notify(`${PB} Terminal7 is unverified`)
                    } else {
                        window.terminal7.notify(`${PB} PeerBook connection error ${m.code}`)
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
                window.terminal7.notify(`${PB} Web socket closed`)
                this.ws = null
            }
            this.ws.onopen = () => {
                console.log("peerbook ws open")
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
            this.ws = null
        }
        if (this.session) {
            this.session.close()
            this.session = null
        }
    }
    isOpen() {
        return (this.session != null) && (this.ws ? this.ws.readyState === WebSocket.OPEN : false)
    }
    syncPeers(gates: Array<Gate>, nPeers: Array<Peer>) {
        console.log("syncPeers", gates, nPeers)
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
                terminal7.map.shell.verifyPeer(gate).catch(() => {})
            }
            for (const k in p) {
                gate[k] = p[k]
            }
            gate.updateNameE()
        })
        return ret
    }
    async verifyFP(fp: string, prompt: string) {
        let validated = false
        // TODO:gAdd biometrics verification
        while (!validated) {
            console.log("Verifying FP", fp)
            let otp
            try {
                otp = await this.shell.askValue(prompt || "Enter OTP to verify gate")
            } catch(e) {
                return
            }
            if (!this.session) {
                console.log("verifyFP: creating new session")
                await this.connect()
            }
            let data
            try {
                data = await this.adminCmd("verify", fp, otp)
            } catch(e) {
                console.log("verifyFP: failed to verify", e.toString())
                this.echo("Failed to verify, please try again")
                continue
            }
            console.log("Got verify reply", data[0])
            validated = data[0] == "1"
            if (!validated)
                this.echo("Invalid OTP, please try again")
        }
    }
    async purchaseCurrent(): Promise<void> {
        const { offerings } = await CapacitorPurchases.getOfferings()
        const offer = offerings.current
        const pack = offer.availablePackages[0]
        await this.purchase(pack.identifier, pack.offeringIdentifier)
    }
    purchase(id, offeringId): Promise<void> {
        return new Promise((resolve, reject) => {
            // ensure there's only one listener
            CapacitorPurchases.purchasePackage({
                identifier: id,
                offeringIdentifier: offeringId,
            }).then(customerInfo => {
                this.onPurchasesUpdate(customerInfo).then(resolve).catch(reject)
            }).catch(e => {
                console.log("purchase failed", e)
                reject(e)
            })
        })
    }   
}
