/* Terminal 7

 *  This file contains the code that makes terminal 7 - a webrtc based
 *  touchable terminal multiplexer.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { Gate } from './gate'
import { T7Map } from './map'
import CyclicArray from './cyclic'
import * as TOML from '@tuzig/toml'
import { formatDate } from './utils'
import { openDB } from 'idb'
import { marked } from 'marked'
// @ts-ignore
import changelogURL  from '../CHANGELOG.md?url'
import ssh from 'ed25519-keygen/ssh'
import { randomBytes } from 'ed25519-keygen/utils'

import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Clipboard } from '@capacitor/clipboard'
import { Network } from '@capacitor/network'
import { Preferences } from '@capacitor/preferences'
import { Device } from '@capacitor/device'
import { NativeBiometric } from "capacitor-native-biometric"
import { RateApp } from 'capacitor-rate-app'


import { PeerbookConnection, PB } from './peerbook'
import { Failure } from './session'
import { Cell } from "./cell"
import { Pane } from "./pane"

declare type NavType = {
    standalone?: boolean
    getInstalledRelatedApps(): Promise<{
        id?: string,
        platform: "chrome_web_store" | "play" | "chromeos_play" | "webapp" | "windows" | "f-droid" | "amazon",
        url?: string,
        version?: string,
    }[]>
} & Navigator

declare let window: {
    navigator: NavType
} & Window

declare let navigator: NavType

export const OPEN_HTML_SYMBOL = "📡"
export const ERROR_HTML_SYMBOL = "🤕"
export const CLOSED_HTML_SYMBOL = "🙁"
export const LOCK_HTML_SYMBOL = "🔒"
const WELCOME=`    🖖 Greetings & Salutations 🖖

Thanks for choosing Terminal7. This is TWR, a local
terminal used to control the terminal and log messages.
Most buttons launch a TWR command so you don't need to 
use \`help\`, just \`hide\`.
If some characters looks off try CTRL-l.`

const WELCOME_FOOTER=`
Enjoy!
PS - Found a bug? Missing a feature? Please use \`support\`
`
const WELCOME_NATIVE=WELCOME+`
For WebRTC 🍯  please \`subscribe\` to our PeerBook service.
` + WELCOME_FOOTER
const WELCOME_OTHER=WELCOME+`
Type \`install\` for instruction on how to install the agent.
If you are a PeerBook subscriber, please \`login\`.
(Sorry, no way to subscribe from here yet)
`  + WELCOME_FOOTER

export const DEFAULT_DOTFILE = `# Terminal7's configurations file
[theme]
# foreground = "#00FAFA"
# background = "#000"
# selectionBackground = "#D9F505"
# selectionForeground = "#271D30"

[exec]
# shell = "*"

[net]
# peerbook = "api.peerbook.io"
# timeout = 5000
# retries = 3
# ice_server = "stun:stun2.l.google.com:19302"
# recovery_time = 4000

[ui]
# leader = "a"
# quickest_press = 1000
# max_tabs = 10
# max_panes = 7
# min_pane_size = 0.04
# cut_min_distance = 80
# cut_min_speed_x = 2.5
# by default cut_min_speed_y is set at 10 to avoid confusion with scroll
# cut_min_speed_y = 2.5
# no pinch when scrolling -> y velocity higher than XTZ px/ms
# pinch_max_y_velocity = 0.1
# auto_restore = false
# flash = 100
# verification_ttl = 900000
`

function compactCert(cert) {
    const ret = cert.getFingerprints()[0].value.toUpperCase().replaceAll(":", "")
    return ret
}

declare global {
    let terminal7: Terminal7
    interface Window {
        terminal7: Terminal7
    }
}

export interface IceServers {
    credential: string,
    credentialType: "password" | string,
    urls: string[],
    username?: string
}

export class Terminal7 {
    gates: Gate[]
    cells: Cell[]
    timeouts: number[]
    activeG?: Gate
    scrollLingers4: number
    shortestLongPress: number
    borderHotSpotSize: number
    certificates?: RTCCertificate[] = null
    netConnected = true
    logBuffer: CyclicArray
    zoomedE?: HTMLDivElement
    pendingPanes
    pb?: PeerbookConnection = null
    ignoreAppEvents = false
    iceServers?: IceServers[]
    recovering?: boolean
    metaPressStart: number
    map: T7Map
    lastActiveState: boolean
    e: HTMLDivElement
    conf:{
        theme
        exec
        net
        ui
        peerbook?
        retries?: number
    }
    longPressGate: number
    gesture?: {
        where: "left" | "top",
        pane: Pane
    }
    pointer0: number
    firstPointer: {
        pageX: number,
        pageY: number
    }
    lastIdVerify: number
    keys: {publicKey: string, privateKey: string}

    DEFAULT_KEY_TAG = "dev.terminal7.keys.default"
    /*
     * Terminal7 constructor, all properties should be initiated here
     */
    constructor(settings: {
        scrollLingers4?: number,
        shortestLongPress?: number,
        borderHotSpotSize?: number,
        logLines?: number,
        iceServers?: IceServers[]
    } = {}) {
        this.gates = []
        this.cells = []
        this.timeouts = []
        this.activeG = null
        window.terminal7 = this
        this.scrollLingers4     = settings.scrollLingers4 || 2000
        this.shortestLongPress  = settings.shortestLongPress || 1000
        this.borderHotSpotSize  = settings.borderHotSpotSize || 30

        this.logBuffer = new CyclicArray(settings.logLines || 101)
        this.zoomedE = null
        this.pendingPanes = {}

        this.iceServers = settings.iceServers || null
    }
    showKeyHelp () {
        if (Date.now() - this.metaPressStart > 987) {
            if (this.activeG && this.activeG.activeW.activeP.copyMode )
                this.map.shell.runCommand('help', ['copymode'])
            else
                document.getElementById('keys-help').classList.remove('hidden')
        }
    }
    onAppStateChange(state) {
        const active =  state.isActive
        if (this.lastActiveState == active) {
            this.log("app state event on unchanged state ignored")
            return
        }
        this.lastActiveState = active
        this.log("app state changed", this.lastActiveState, this.ignoreAppEvents)
        if (this.ignoreAppEvents) {
            terminal7.log("ignoring app event", active)
            return
        }
        if (!active)
            this.updateNetworkStatus({connected: false}, false)
        else {
            // We're back! puts us in recovery mode so that it'll
            // quietly reconnect to the active gate on failure
            this.clearTimeouts()
            Network.getStatus().then(s => this.updateNetworkStatus(s))
        }
    }
    /*
     * Terminal7.open opens terminal on the given DOM element,
     * loads the gates from local storage and redirects to home
     */
    async open() {
        const e = document.getElementById('terminal7')
        this.log("in open")
        this.lastActiveState = true
        this.e = e as HTMLDivElement
        await Preferences.migrate()
        // reading conf
        let d = {},
            { value } = await Preferences.get({key: 'dotfile'})
        if (value == null) {
            value = DEFAULT_DOTFILE
            Preferences.set({key: 'dotfile', value: value})
        }
        try {
            d = TOML.parse(value)
        } catch(err) {
            d = TOML.parse(DEFAULT_DOTFILE)
            this.run(() =>
                this.notify(
                    `Using default conf as parsing the dotfile failed:\n ${err}`, 
                true), 10)

        }
        this.loadConf(d)

		this.loadChangelog()

        // buttons
        document.getElementById("trash-button")
                .addEventListener("click",
                    () =>  {
                        if (this.activeG?.activeW?.activeP)
                            this.activeG.activeW.activeP.close()})
        document.getElementById("map-button")
                .addEventListener("click", () => this.goHome())
        document.getElementById("log-button")
                .addEventListener("click", () => this.map.showLog())
        document.getElementById("video-button")
                .addEventListener("click", () => 
                   this.activeG && this.activeG.activeW.activeP.showVideo())
        document.getElementById("search-button")
                .addEventListener("click", () => 
                   this.activeG && this.activeG.activeW.activeP.toggleSearch())
        document.getElementById("help-gate")
                .addEventListener("click", () => this.toggleHelp())
        document.getElementById("help-button")
                .addEventListener("click", () => this.toggleHelp())
        const dH = document.getElementById("divide-h")
        const dV = document.getElementById("divide-v")
        dH.addEventListener("click", () =>  {
                    if (this.activeG)
                        this.activeG.activeW.activeP.split("rightleft", 0.5)})
        dV.addEventListener("click", () =>  {
                    if (this.activeG)
                        this.activeG.activeW.activeP.split("topbottom", 0.5)})
        document.getElementById('add-gate').addEventListener(
            'click', async (ev) => {
                setTimeout(() => this.map.shell.runCommand('add', []), 50)
                ev.stopPropagation()
            })
		document.getElementById('toggle-changelog')
				.addEventListener('click', ev => {
                    this.showChangelog()
                    ev.stopPropagation()
                    ev.preventDefault()
                })
        document.getElementById('peerbook-legend').addEventListener(
            'click', async (ev) => {
                setTimeout(() => this.map.shell.runCommand('subscribe', []), 50)
                ev.stopPropagation()
            })
        // hide the modal on xmark click
        // Handle network events for the indicator
        Network.addListener('networkStatusChange', s => 
            this.updateNetworkStatus(s))
        this.catchFingers()
        // setting up edit host events
        document.getElementById("edit-unverified-pbhost").addEventListener(
            "click", async() => await this.clear())
        // keyboard
        document.addEventListener("keydown", ev => {
            if ((ev.key == "Meta") && (Capacitor.getPlatform() != "ios")) {
                this.metaPressStart = Date.now()
                this.run(() => this.showKeyHelp(), terminal7.conf.ui.quickest_press)
            } else
                this.metaPressStart = Number.MAX_VALUE
        })
        document.addEventListener("keyup", async ev => {
            // hide the modals when releasing the meta key
            if ((ev.key == "Meta") &&
                (Date.now() - this.metaPressStart > terminal7.conf.ui.quickest_press)) {
                await this.clear()
            }
            this.metaPressStart = Number.MAX_VALUE
        })
        this.map = new T7Map()
        // Load gates from local storage
        this.loadLocalGates()
        if (Capacitor.isNativePlatform())  {
            // this is a hack as some operation, like bio verification
            // fire two events
            App.addListener('appStateChange', state => this.onAppStateChange(state))

        }

        e.addEventListener("click", e => { 
            this.map.showLog(false)
            this.showChangelog(false)
            e.stopPropagation()
            e.preventDefault()
        })

        // settings button and modal
        document.getElementById("dotfile-button")
                .addEventListener("click", () => this.map.shell.confEditor ?
                    this.map.shell.closeConfig(false)
                    : this.map.shell.runCommand("config", []))
        this.map.open().then(() => {
           this.goHome()
           setTimeout(async () => {
                this.showGreetings()
                const got = await Preferences.get({key: "activated"})
                let runs = Number(got.value)
                if (isNaN(runs))
                    runs = 0
                Preferences.set({key: "activated", value: String(runs+1)})
                if (runs % 12 == 11)
                    RateApp.requestReview()
           }, 100)
        })
        this.pbConnect()
            .catch(e => this.log("pbConnect failed", e))
            .finally(() =>
            Network.getStatus().then(s => {
                this.updateNetworkStatus(s)
                if (!s.connected) {
                    this.goHome()
                }
            }))
        const resizeObserver = new ResizeObserver(() => {
            if (this.activeG)
                this.activeG.setFitScreen()
        })
        resizeObserver.observe(document.body)
    }
    /*
     * restoreState is a future feature that uses local storage to restore
     * terminal7 to it's last state
     */
    restoreState(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.conf.ui.autoRestore) {
                reject()
                return
            }
            Preferences.get({key: "last_state"}).then(({ value }) => {
                if (!value)
                    reject()
                else {
                    const state = JSON.parse(value)
                    const gate = this.gates[state.gateId]
                    if (!gate) {
                        console.log("Invalid restore state. Starting fresh", state)
                        this.notify("Invalid restore state. Starting fresh")
                        reject()
                    } else {
                        this.notify("Restoring last gate")
                        this.getFingerprint().then(() => {
                            gate.connect()
                            resolve()
                        })
                    }
                }
            })
        })
    }
    pbClose() {
        if (this.pb) {
            this.pb.close()
        }
    }
    async pbConnect(): Promise<void> {
        const statusE = document.getElementById("peerbook-status") as HTMLSpanElement
        // TODO: refactor this to an sync function
        return new Promise((resolve, reject) => {
            function callResolve() {
                statusE.style.opacity = "1"
                resolve()
            }
            function callReject(e, symbol = "") {
                statusE.style.opacity = "1"
                statusE.innerHTML = symbol
                console.log("pbConnect failed", e)
                reject(e)
            }
            function catchConnect(e) {
                let symbol = LOCK_HTML_SYMBOL
                if (e =="Unregistered")
                    this.notify(Capacitor.isNativePlatform()?
                        `${PB} You need to register, please \`subscribe\``:
                        `${PB} You need to regisrer, please \`subscribe\` on your tablet`)
                    
                else if (e == Failure.NotSupported) {
                    // TODO: this should be changed to a notification
                    // after we upgrade peerbook
                    symbol = "🚱"
                    console.log("PB not supported")
                }
                else if (e != "Unauthorized") {
                    terminal7.log("PB connect failed", e)
                    this.notify(Capacitor.isNativePlatform()?
                        `${PB} Failed to connect, please try \`subscribe\``:
                        `${PB} Failed to connect, please try \`login\``)
                    this.notify("If the problem persists, `support`")
                    symbol = ERROR_HTML_SYMBOL
                } else

                callReject(e, symbol)
            }

            const complete = () => this.pb.connect()
                .then(callResolve)
                .catch(catchConnect)

            if (this.pb) {
                if (this.pb.isOpen())
                    callResolve()
                else
                    complete()
                return
            } else {
                this.getFingerprint().then(fp => {
                    this.pb = new PeerbookConnection({
                        fp: fp,
                        host: this.conf.net.peerbook,
                        insecure: this.conf.peerbook && this.conf.peerbook.insecure,
                        shell: this.map.shell
                    })
                    this.pb.startPurchases()
                        .then(complete) 
                        .catch(callReject)
                })
            }
        })
    }
    catchFingers() {
        this.e.addEventListener("pointerdown", ev => this.onPointerDown(ev))
        this.e.addEventListener("pointerup", ev => this.onPointerUp(ev))
        this.e.addEventListener("pointercancel", () => this.onPointerCancel())
        this.e.addEventListener("pointermove", ev => this.onPointerMove(ev))
    }
    /*
     * Terminal7.addGate is used to add a new gate.
     * the function ensures the gate has a unique name adds the gate to
     * the `gates` property, stores and returns it.
     */
    // TOFO: add onMap to props
    addGate(props, onMap = true) {
        const p = props || {}
        // add the id
        p.id = p.fp || p.name
        const g = new Gate(p)
        g.onlySSH = p.onlySSH
        this.gates.push(g)
        g.open(this.e)
        if (onMap) {
            g.nameE = this.map.add(g)
            g.updateNameE()
        }
        return g
    }
    async storeGates() { 
        const out = []
        this.gates.forEach(g => {
            if (g.store) {
                const ws = []
                g.windows.forEach((w) => ws.push(w.id))
                out.push({id: g.id, addr: g.addr, user: g.user, secret: g.secret,
                    name:g.name, windows: ws, store: true, verified: g.verified,
                    username:g.username, onlySSH: g.onlySSH })
            }
        })
        this.log("Storing gates:", out)
        await Preferences.set({key: 'gates', value: JSON.stringify(out)})
        this.map.refresh()
    }
    async clear() {
        this.e.querySelectorAll('.temporal').forEach(e => e.remove())
        this.e.querySelectorAll('.modal').forEach(e => {
            if (!e.classList.contains("non-clearable"))
                e.classList.add("hidden")
        })
        this.map.showLog(false)
        this.focus()
        this.longPressGate = null
        await this.map.shell.escapeActiveForm()
    }
    async goHome() {
        await Preferences.remove({key: "last_state"})
        const s = document.getElementById('map-button')
        s.classList.add('off')
        if (this.activeG) {
            this.activeG.e.classList.add("hidden")
            this.activeG = null
        }
        // hide the modals
        await this.clear()
        document.querySelectorAll(".pane-buttons").forEach(
            e => e.classList.add("off"))
        window.location.href = "#map"
        document.getElementById("map").classList.remove("hidden")
        document.title = "Terminal 7"
        if (!document.getElementById("log").classList.contains("hidden"))
            this.map.t0.focus()
    }
    /*
     * focus restores the focus to the ative pane, if there is one
     */
    focus() {
        if (this.activeG && this.activeG.activeW &&
            this.activeG.activeW.activeP)
            this.activeG.activeW.activeP.focus()
        else
            this.e.focus()
    }
    /*
     * notify adds a message to the teminal7 notice board
     */
    notify(message, dontShow = false) {
        const d = new Date(),
            t = formatDate(d, "HH:mm:ss.fff")
        // TODO: add color based on level and ttl
        this.map.interruptTTY()
        this.map.t0.scrollToBottom()
        const formatted = `\x1B[2m${t}\x1B[0m ${message}`
        this.map.shell.printAbove(formatted)
        if (!dontShow)
            this.map.showLog(true)
    }
    run(cb, delay) {
        const i = this.timeouts.length,
            r = window.setTimeout(ev => {
                this.timeouts.splice(i, 1)
                cb(ev)
            }, delay)
        this.timeouts.push(r)
        return r
    }
    clearTimeouts() {
        this.timeouts.forEach(t => window.clearTimeout(t))
        this.timeouts = []
    }
    /*
     * disengage gets each active gate to disengae
     */
    disengage(): Promise<void> {
        return new Promise(resolve => {
            this.pbClose()
            let count = 0
            if (this.activeG && this.activeG.boarding)
                this.notify("🌜 Benched", true)
            if (this.gates.length > 0) {
                this.gates.forEach(g => {
                    if (g.boarding) {
                        count++
                        g.disengage().then(() => {
                            count--
                        })
                    }
                })
            }
            const callCB = () => terminal7.run(() => {
                if (count == 0)
                    resolve()
                 else 
                    callCB()
            }, 50)
            callCB()
        })
    }
    async updateNetworkStatus (status, updateNetPopup = true) {
        const off = document.getElementById("offline").classList
        if (this.netConnected == status.connected) {
            if (updateNetPopup) {
                if (this.netConnected)
                    off.add("hidden")
                else
                    off.remove("hidden")
            }
            return
        }
        this.netConnected = status.connected
        this.log(`updateNetworkStatus: ${status.connected}`)
        if (status.connected) {
            if (updateNetPopup)
                off.add("hidden")
            const gate = this.activeG
            const firstGate = (await Preferences.get({key: "first_gate"})).value
            const toReconnect = gate && gate.boarding && (firstGate == "nope") && this.recovering
            console.log("toReconnect", toReconnect, "firstGate", firstGate)
            if (toReconnect ) {
                this.notify("🌞 Recovering")
                this.map.shell.startWatchdog().catch(() => {
                    if (this.pb.isOpen())
                        gate.notify("Timed out")
                    else
                        this.notify(Capacitor.isNativePlatform()?
                            `${PB} timed out, please retry with \`subscribe\``:
                            `${PB} timed out, please retry with \`login\``)
                    gate.stopBoarding()
                })
            }
            if (toReconnect) {
                try {
                    await gate.reconnect()
                } catch(e) {
                    console.log("recoonect failed", e)
                    this.map.shell.runCommand("reset", [gate.name])
                } finally {
                        this.recovering = false
                        this.map.shell.stopWatchdog()
                        this.map.shell.printPrompt()
                }
            } else {
                try {
                    await this.pbConnect()
                } catch(e) {
                    this.log("pbConnect failed", e)
                }
            }
        } else {
            this.disengage().finally(() => this.recovering = true)
        }
    }
    loadConf(conf) {
        this.conf = conf
        this.conf.exec = this.conf.exec || {}
        this.conf.exec.shell = this.conf.exec.shell || "*"
        this.conf.ui = this.conf.ui || {}
        this.conf.ui.quickest_press = this.conf.ui.quickest_press || 1000
        this.conf.ui.max_tabs = this.conf.ui.max_tabs || 10
        this.conf.ui.max_panes = this.conf.ui.max_panes || 7
        this.conf.ui.min_pane_size = this.conf.ui.min_pane_size || 0.04
        this.conf.ui.leader = this.conf.ui.leader || "a"
        this.conf.ui.cutMinSpeedX = this.conf.ui.cut_min_speed_x || 2.5
        this.conf.ui.cutMinSpeedY = this.conf.ui.cut_min_speed_y || 10
        this.conf.ui.cutMinDistance = this.conf.ui.cut_min_distance || 80
        this.conf.ui.pinchMaxYVelocity = this.conf.ui.pinch_max_y_velocity || 0.1
        this.conf.ui.autoRestore = this.conf.ui.auto_restore || false
        this.conf.ui.verificationTTL = this.conf.ui.verification_ttl || 15 * 60 * 1000
        this.conf.ui.subscribeTimeout = this.conf.ui.subscribe_timeout || 60 * 1000

        this.conf.net = this.conf.net || {}
        this.conf.net.iceServer = this.conf.net.ice_server || []
        this.conf.net.peerbook = this.conf.net.peerbook ||
            "api.peerbook.io"
        if (this.conf.net.peerbook == "pb.terminal7.dev")
            terminal7.notify(`\uD83D\uDCD6 Your setting include an old peerbook addres.<br/>
                              Please click <i class="f7-icons">gear</i> and change net.peerbook to "api.peerbook.io"`)
        this.conf.net.timeout = this.conf.net.timeout || 5000
        this.conf.net.retries = this.conf.net.retries || 3
        this.conf.net.recoveryTime = this.conf.net.recovery_time || 4000
        this.conf.theme = this.conf.theme || {}
        this.conf.theme.foreground = this.conf.theme.foreground || "#00FAFA"
        this.conf.theme.background = this.conf.theme.background || "#000"
        this.conf.theme.selectionBackground = this.conf.theme.selectionBackground || "#D9F505"
        this.conf.theme.selectionForeground = this.conf.theme.selectionForeground || "#271D30"
        if (conf.peerbook) {
            this.conf.peerbook = {
                insecure: conf.peerbook.insecure || false,
            }
            if (conf.peerbook.peerName)
                this.conf.peerbook.peerName = conf.peerbook.peer_name
            else
                Device.getInfo().then(i =>
                    this.conf.peerbook.peerName = `${i.name}'s ${i.model}`)
                .catch(err => {
                    console.log("Device info error", err)
                    this.conf.peerbook.peerName = "John Doe"
                })
        } else
            this.conf.peerbook = {insecure: false}
    }

    // gets the will formatted fingerprint from the current certificate
    getFingerprint(): Promise<string> {
        // gets the certificate from indexDB. If they are not there, create them
        return new Promise((resolve, reject) => {
            if (this.certificates) {
                resolve(compactCert(this.certificates[0]))
                return
            }
            openDB("t7", 1, { 
                    upgrade(db) {
                        db.createObjectStore('certificates', {keyPath: 'id',
                            autoIncrement: true})
                    },
            }).then(db => {
                const tx = db.transaction("certificates"),
                    store = tx.objectStore("certificates")
                 store.getAll().then(certificates => {
                     if (certificates.length == 0) {
                         console.log("got no certificates, generating", certificates)
                         this.generateCertificate()
                         .then(cert => resolve(compactCert(cert)))
                         .catch(reject)
                         return
                     }
                     db.close()
                     this.certificates = certificates
                     resolve(compactCert(certificates[0]))
                 }).catch(e => {
                     this.log("caught an error reading store", e)
                     this.generateCertificate()
                     .then(cert => resolve(compactCert(cert)))
                     .catch(reject)
                })
            }).catch(e => {
                this.log(`got an error opening db ${e}`)
                this.generateCertificate()
                .then(cert => resolve(compactCert(cert)))
                .catch(reject)
            })
        })
    }
    generateCertificate() {
        return new Promise((resolve, reject)=> {
            this.log('generating the certificate')
            RTCPeerConnection.generateCertificate({
              name: "ECDSA",
                // @ts-ignore
              namedCurve: "P-256",
              expires: 31536000000
            }).then(cert => {
                this.log("Generated cert")
                this.certificates = [cert]
                this.storeCertificate()
                .then(() => resolve(cert))
                .catch(reject)
            }).catch(e => {
                this.log(`failed generating cert ${e}`)
                reject(e)
            })
        })
    }
    storeCertificate(): Promise<RTCCertificate | void> {
        return new Promise((resolve, reject) => {
            openDB("t7", 1, { 
                    upgrade(db) {
                        db.createObjectStore('certificates', {keyPath: 'id',
                            autoIncrement: true})
                    },
            }).then(db => {
                const tx = db.transaction("certificates", "readwrite"),
                    store = tx.objectStore("certificates"),
                    c = this.certificates[0] as RTCCertificate & {id:number}
                c.id = 1
                store.add(c).then(() => {
                    db.close()
                    console.log("stored certificate")
                    resolve(this.certificates[0])
                }).catch(reject)
            }).catch(e => {
                this.log (`got error from open db ${e}`)
                resolve(null)
            })
        })
    }
    toggleHelp() {
        // TODO: add help for home & copy-mode
        // var helpId = (this.activeG)? "help-gate":"help-home",
        // var helpId = (this.activeG && this.activeG.activeW.activeP.copyMode)?
        // "help-copymode":"help-gate",
        const helpId = "help-gate",
            ecl = document.getElementById(helpId).classList,
            bcl = document.getElementById("help-button").classList
            
        ecl.toggle("show")
        bcl.toggle("on")
        if (!ecl.contains("show"))
            this.focus()
        // TODO: When at home remove the "on" from the home butto
    }
    log (...args) {
        let line = ""
        args.forEach(a => line += JSON.stringify(a) + " ")
        console.log(line)
        this.logBuffer.push(line)
    }
    async dumpLog() {
        let data = ""
        while (this.logBuffer.length > 0) {
            data += this.logBuffer.shift() + "\n"
        }
        await Clipboard.write({string: data})
        this.notify("Log copied to clipboard")
        /* TODO: wwould be nice to store log to file, problme is 
         * Preferences pluging failes
        try { 
            await Filesystem.writeFile({
                path: path,
                data: data,
                directory: FilesystemDirectory.Documents
            })i
        } catch(e) { 
            terminal7.log(e)
        }
        */
    }
    onPointerCancel() {
        this.pointer0 = null
        this.firstPointer = null
        this.gesture = null
        if (this.longPressGate) {
            clearTimeout(this.longPressGate)
            this.longPressGate = null
        }
        return
    }
    onPointerDown(ev) {
        const e = ev.target
        const gatePad = e.closest(".gate-pad")
        /*
        if ((ev.pointerType == "mouse") && (ev.pressure == 0))
            return
            */
        this.pointer0 = Date.now() 
        this.firstPointer = {pageX: ev.pageX, pageY: ev.pageY}
        if (gatePad) {
            const gate = gatePad.gate
            if (!this.longPressGate && gate)
                this.longPressGate = this.run(() => {
                    this.map.shell.runCommand("edit", [gate.name])
                }, this.conf.ui.quickest_press)
            ev.stopPropagation()
            ev.preventDefault()
            return
        }
        // only dividers know their panes
        if (e.pane === undefined)
            return
        // identify pan gesture
        if (e.classList.contains("left-divider"))
            this.gesture = { where: "left", pane: e.pane}
        else if (e.classList.contains("top-divider"))
            this.gesture = { where: "top", pane: e.pane}
        else  {
            console.log("failed to identify pan directorion")
            return
        }
        this.log(`identified: ${this.gesture}`)
    } 
    onPointerMove(ev) {
        const x  = ev.pageX,
            y  = ev.pageY

        /*
        if ((ev.pointerType == "mouse") && (ev.pressure == 0))
            return
            */

        if (this.gesture) {
            const where = this.gesture.where,
                dest = Math.min(1.0, (where == "top")
                    ? y / (document.querySelector('.windows-container') as HTMLDivElement).offsetHeight
                    : x / document.body.offsetWidth)
            this.gesture.pane.layout.moveBorder(this.gesture.pane, where, dest)
            ev.stopPropagation()
            ev.preventDefault()
        }
    }
    async onPointerUp(ev) {
        const e = ev.target,
            gatePad = e.closest(".gate-pad")

        if (!this.pointer0)
            return
        if (gatePad) {
            const gate = gatePad.gate
            const isExpand = e.classList.contains("gate-edit")
            if (!gate)
                return
            else {
                const deltaT = Date.now() - this.pointer0
                clearTimeout(this.longPressGate)
                this.longPressGate = null
                if (deltaT < this.conf.ui.quickest_press) {
                    // that's for the refresh and static host add
                    if (isExpand) {
                        this.map.shell.runCommand("edit", [gate.name])
                    } else {
                        await this.map.shell.runCommand("connect", [gate.name])
                    }
                }
            }
            ev.stopPropagation()
            ev.preventDefault()
        } else if (this.gesture) {
            if (this.activeG && this.activeG.fitScreen)
                this.activeG.sendState()
        } else if (this.firstPointer) {
            const deltaT = Date.now() - this.pointer0,
                    x  = ev.pageX,
                    y  = ev.pageY,
                    dx = this.firstPointer.pageX - x,
                    dy = this.firstPointer.pageY - y,
                    d  = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2)),
                    s  = d/deltaT,
                    r = Math.abs(dx / dy)

            if (d > this.conf.ui.cutMinDistance) {
                const minS = (dx > dy)?this.conf.ui.cutMinSpeedY:this.conf.ui.cutMinSpeedX
                if  (s > minS) {
                    // it's a cut!!
                    const cell = ev.target.closest(".cell"),
                        pane = (cell != null)?cell.cell:undefined
                    if (pane && !pane.zoomed)  {
                        if (r < 1.0)
                            pane.split("topbottom",
                                (x / document.body.offsetWidth - pane.xoff) / pane.sx)
                        else
                            pane.split("rightleft",
                                (y / document.body.offsetHeight - pane.yoff) / pane.sy)
                        ev.stopPropagation()
                        ev.preventDefault()
                        // t.focus()
                    }
                }
            }
        }
        this.pointer0 = null
        this.firstPointer = null
        this.gesture = null
    }
    async showGreetings() {
        const greeted = (await Preferences.get({key: 'greeted'})).value
        if (!greeted) {
            await Preferences.set({key: "greeted", value: "yep"})
            if (Capacitor.isNativePlatform())
                this.map.tty(WELCOME_NATIVE)
            else
                this.map.tty(WELCOME_OTHER)
        } else {
            this.map.shell.printPrompt()
            if (!((window.matchMedia('(display-mode: standalone)').matches)
                || (window.matchMedia('(display-mode: fullscreen)').matches)
                || window.navigator.standalone
                || (Capacitor.getPlatform() != "web")
                || document.referrer.includes('android-app://')))
                if (navigator.getInstalledRelatedApps)
                    navigator.getInstalledRelatedApps().then(relatedApps => {
                        if (relatedApps.length > 0)
                            this.map.tty("PWA installed, better use it\n")
                    })
        }
  
    }
    clearTempGates() {
        this.gates.forEach(g => {
            if (g.name.startsWith("temp_"))
                g.delete()
        })
    }
    validateHostAddress(addr) {
        const lookup = this.gates.filter(g => g.addr == addr)
        return (lookup.length > 0)?"Gate with this address already exists" : ""
    }
    validateHostName(name) {
        const lookup = this.gates.filter(g => g.name == name)
        return (lookup.length > 0)? "Name already exists" : ""
    }
    resetGates() {
        if (this.activeG)
            this.activeG.close()
        this.gates.forEach(g => {
            g.e.remove()
            this.map.remove(g)
            // remove g from the gates array
        })
        this.gates = []
        this.storeGates()
    }
    async deleteFingerprint() {
        const db = await openDB("t7", 1)
        const tx = db.transaction("certificates", "readwrite"),
            store = tx.objectStore("certificates")
        await store.clear()
    }
    async factoryReset() {
        // setting up reset cert events
        return new Promise(resolve => {
            this.resetGates()
            Preferences.clear().then(() => 
                Preferences.set({key: 'dotfile', value: DEFAULT_DOTFILE}))
            const d = TOML.parse(DEFAULT_DOTFILE)
            this.loadConf(d)
            this.pbClose()
            this.deleteFingerprint().then(resolve)
            NativeBiometric.deleteCredentials({ server: "dev.terminal7.default" })
        })
    }
	async loadChangelog() {
		const resp = await fetch(changelogURL)
		const changelog = await resp.text()
		const e = document.getElementById("changelog-content")
		e.innerHTML = marked.parse(changelog)
		// add prefix to all ids to avoid conflicts
        e.querySelectorAll("[id]").forEach(e => e.id = "changelog-" + e.id)
        document.querySelectorAll("a[href]").forEach((e: HTMLAnchorElement) => {
            e.addEventListener("click", ev => {
                ev.stopPropagation()
                ev.preventDefault()
                window.open(e.href, '_blank')
            })
        })
	}
    // if show is undefined the change log view state is toggled
	showChangelog(show = undefined) {
		const e = document.getElementById("changelog")
        if (show === undefined)
            // if show is undefined toggle current state
            show = !e.classList.contains("show")
        
        if (show)
            e.classList.add("show")
        else
            e.classList.remove("show")
    }
    /*
     * collects the default id and returns a { publicKet, privateKey
     */
    async readId(): Promise<{publicKey: string, privateKey: string}> {
        const now = Date.now()
        if (this.keys && (now - this.lastIdVerify  < this.conf.ui.verificationTTL))
            return this.keys
        let verified
        this.ignoreAppEvents = true
        try {
            verified = await NativeBiometric.verifyIdentity({
                reason: "Use private key to connect",
                title: "Access Private Key",
            })
        } catch(e) {
            this.notify(`Biometric failed: ${e.message}`)
            throw "Biometric failed: " + e.message
        } finally {
            this.ignoreAppEvents = false
        }
        console.log("Got biometric verified ", verified)
        this.lastActiveState = false

        let publicKey
        let privateKey
        try {
            const def = await NativeBiometric.getCredentials({
                server: "dev.terminal7.default"})
            privateKey = def.password
            publicKey = def.username
        } catch {
            this.notify("Forging 🔑")
            const sseed = randomBytes(32)
            const i = await Device.getInfo()
            const skeys = await ssh(sseed, `${i.name}@${i.model}`)
            privateKey = skeys.privateKey
            publicKey = skeys.publicKey
            await NativeBiometric.setCredentials({
                username: publicKey,
                password: privateKey,
                server: "dev.terminal7.default",
            })
        }
        this.keys = {publicKey: publicKey, privateKey: privateKey}
        this.lastIdVerify = now
        return this.keys
    }
    async getDotfile() {
        return (await Preferences.get({key: "dotfile"})).value || DEFAULT_DOTFILE
    }
    saveDotfile(text) {
        this.cells.forEach(c => {
            if (c instanceof Pane)
                c.setTheme(this.conf.theme)
        })
        terminal7.loadConf(TOML.parse(text))
        if (this.pb &&
            ((this.pb.host != this.conf.net.peerbook)
                // TODO: is bug?
                // @ts-ignore
             || (this.pb.peerName != this.conf.peerbook.peer_name)
             || (this.pb.insecure != this.conf.peerbook.insecure)
                // @ts-ignore
             || (this.pb.email != this.conf.peerbook.email))) {
            this.pbClose()
            this.pb = null
            this.pbConnect()
        }
        return Preferences.set({key: "dotfile", value: text})
    }
    async pbVerify() {
        const fp = await this.getFingerprint()
        const schema = this.pb.insecure?"http":"https"
        let response
        try {
            response = await fetch(`${schema}://${this.conf.net.peerbook}/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({fp: fp}),
            })
        } catch(e) {
            console.log("Error verifying peerbook", e)
            return {verified: false}
        }
        const ret = await response.json()
        terminal7.log("Peerbook verification response", ret)
        return ret
    }
    async loadLocalGates() {
        let gates
        const { value } = await Preferences.get({key: 'gates'})

        if (value) {
            try {
                gates = JSON.parse(value)
            } catch(e) {
                 terminal7.log("failed to parse gates", value, e)
                gates = []
            }
        } else if (!Capacitor.isNativePlatform()) {
            gates = [{
                addr: "localhost",
                id: "localhost",
                name: "localhost",
            }]
        }
        gates.forEach(g => {
            g.store = true
            this.addGate(g).e.classList.add("hidden")
        })
        this.map.refresh()
    }
}
