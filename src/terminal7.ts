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
import { Network } from '@capacitor/network'
import { Preferences } from '@capacitor/preferences'
import { Device } from '@capacitor/device'
import { NativeAudio } from '@capacitor-community/native-audio'
import { NativeBiometric } from "capacitor-native-biometric"
import { RateApp } from 'capacitor-rate-app'


import { PeerbookConnection, PB } from './peerbook'
import { ControlMessage } from './webrtc_session'
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

export const DEFAULT_STUN_SERVER = "stun:stun2.l.google.com:19302"
export const OPEN_ICON = "📡"
export const ERROR_ICON = "🤕"
export const CLOSED_ICON = "🙁"
export const LOCK_ICON = "🔒"
const DEFAULT_LOG_LINES = 200
const WELCOME=`    🖖 Greetings & Salutations 🖖

Thanks for trying Terminal7. This is TWR, a local
terminal used to control the terminal and log messages.
Most buttons launch a TWR command so there's no need to 
use \`help\` and you can just \`hide\`.
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

// DEFAULT_DOTFILE is the default configuration file for Terminal7
const DEFAULT_PB_HOST = "api.peerbook.io"
export const DEFAULT_DOTFILE = `# Terminal7's configurations file
[theme]
# foreground = "#00FAFA"
# background = "#000"
# selection_background = "#D9F505"
# selection_foreground = "#271D30"
# font_family = "FiraCode"
# font_size = 14

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
# scrollback = 10000
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

        this.logBuffer = new CyclicArray(settings.logLines || DEFAULT_LOG_LINES)
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
        if (this.ignoreAppEvents) {
            terminal7.log("ignoring app event", active)
            return
        }
        this.log("app state changed", this.lastActiveState, this.ignoreAppEvents)
        if (!active) {
            this.clearTimeouts()
            this.updateNetworkStatus({connected: false}, false).finally(() =>
                this.recovering = true)
        }
        else if (this.recovering) {
            // We're back!
            const gate = this.activeG
            if (gate)
                // the watchdog is stopped by the gate when it connects
                this.map.shell.startWatchdog().catch(() => {
                    if (!gate.session) {
                        terminal7.log("ignoring watchdos as session is closed")
                        return
                    }
                    if (!gate.session.isOpen()) {
                        gate.handleFailure(Failure.TimedOut)
                    } else if (!this.pb.isOpen())
                        this.pb.notify("Timed out, please refresh app and `support`")
                    this.map.shell.printPrompt()
                })
            this.run(() => this.recovering=false, this.conf.net.timeout)
            // real work is done in updateNetworkStatus
            Network.getStatus().then(async s => await this.updateNetworkStatus(s))
        }
    }
    /*
     * Terminal7.open opens terminal on the given DOM element,
     * loads the gates from local storage and redirects to home
     */
    async open() {
        const e = document.getElementById('terminal7')
        if (Capacitor.isNativePlatform())
            document.body.classList.add('native')
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
        NativeAudio.preload({ assetId: "bell", assetPath: "bell.mp3", isUrl: false })
                   .catch(e => this.log("failed to preload bell", e))

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
        document.getElementById("keys-help")
                .addEventListener("click", () => this.toggleHelp())
        document.getElementById("help-button")
            .addEventListener("pointerdown", () => this.toggleHelp(true))
        document.getElementById("help-button")
            .addEventListener("pointerup", () => this.toggleHelp(false))
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
        // setting up edit host events
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
                Preferences.set({ key: "activated", value: String(runs + 1) })
                if (runs % 12 == 11)
                    RateApp.requestReview()
            }, 100)
        })
        this.initSearch()
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
            this.gates.forEach(g => g.onResize())
        })
        resizeObserver.observe(document.body)
    }
    initSearch() {
        document.querySelector(".search-close").addEventListener('click', () =>  {
                this.map.showLog(false)
                this.activeG.activeW.activeP.exitSearch()
                this.activeG.activeW.activeP.focus()
            })
        document.querySelector(".search-up").addEventListener('click', () =>
                this.activeG.activeW.activeP.findPrev())

        document.querySelector(".search-down").addEventListener('click', () => 
                this.activeG.activeW.activeP.findNext())
        //rename box
        document.querySelector(".rename-close").addEventListener('click', () => 
                document.getElementById("rename").classList.add("hidden"))
        const textbox = document.querySelector("#name-input") as HTMLInputElement
        const renameHandler = (event) => {
            if (this.activeG) {
                this.activeG.activeW.onRenameEvent(event)
                event.preventDefault()
                event.stopPropagation()
            }
        }
        textbox.addEventListener('keyup', renameHandler)
        textbox.addEventListener('change', renameHandler)
    }

    /* FFU
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
    // TODO: move to Shell
    async pbConnect(): Promise<void> {
        const statusE = document.getElementById("peerbook-status") as HTMLSpanElement
        return new Promise<void>((resolve, reject) => {
            const callResolve = () => {
                statusE.style.opacity = "1"
                statusE.innerHTML = OPEN_ICON
                resolve()
            }
            const callReject = (e, symbol = ERROR_ICON) => {
                statusE.style.opacity = "1"
                statusE.innerHTML = symbol
                this.pb.close()
                terminal7.log("pbConnect failed", e)
                reject(e)
            }
            const catchConnect = (e: string) => {
                let symbol = LOCK_ICON
                if (e =="Unregistered")
                    this.notify(`${PB} Unregistered, please \`subscribe\``)

                else if (e == Failure.NotSupported) {
                    // TODO: this should be changed to a notification
                    // after we upgrade peerbook
                    symbol = "🚱"
                    this.log("PB not supported")
                    const pbHost = this.conf.net.peerbook
                    if (pbHost == DEFAULT_PB_HOST) {
                        this.notify(`${PB} Failed to connect, please try again later`)
                    } else {
                        const url = (this.conf.peerbook.insecure ? "http://" : "https://") + pbHost
                        this.notify(`${PB} Failed to connect to server at:`)
                        this.notify(`    ${url}`)
                    }
                    this.notify("If the problem persists, please \`support\`")

                }
                else if (e != "Unauthorized") {
                    this.log("PB connect failed", e)
                    this.notify(`${PB} Failed to connect, please try again later`)
                    this.notify("If the problem persists, \`support\`")
                    symbol = ERROR_ICON
                }
                callReject(e, symbol)
            }

            const complete = () => this.pb.connect()
                .then(callResolve)
                .catch(catchConnect)

            if (this.pb) {
                if (this.pb.isOpen())
                    resolve()
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
    /*
     * Terminal7.addGate is used to add a new gate.
     * the function ensures the gate has a unique name adds the gate to
     * the `gates` property, stores and returns it.
     */
    // TODO: add onMap to props
    addGate(props, onMap = true) {
        const container = this.e.querySelector(".gates-container")
        const p = props || {}
        // add the id
        p.id = p.fp || p.name
        const g = new Gate(p)
        g.onlySSH = p.onlySSH
        this.gates.push(g)
        g.open(container)
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
                out.push({
                    id: g.id, addr: g.addr, user: g.user, secret: g.secret,
                    name: g.name, windows: ws, store: true, verified: g.verified,
                    sshPort: g.sshPort || 22, username: g.username, onlySSH: g.onlySSH,
                    firstConnection: g.firstConnection,
                })
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
        const gatesContainer = this.e.querySelector(".gates-container")
        gatesContainer.classList.add('hidden')
        s.classList.add('off')
        if (this.activeG) {
            this.activeG.blur()
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
            let count = 0
            if (this.activeG && this.activeG.boarding)
                this.notify("🌜 Benched", true)
            if (this.gates.length > 0) {
                this.gates.forEach(g => {
                    if (g.boarding) {
                        count++
                        g.disengage()
                         .catch(e => terminal7.log("disengage failed", e))
                         .finally(() => count-- )
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
            const gate = this.activeG
            const firstGate = (await Preferences.get({key: "first_gate"})).value
            const wasSSH = gate?.session?.isSSH
            if (updateNetPopup)
                off.add("hidden")
            if (wasSSH) {
                await gate.handleFailure(Failure.NotSupported)
                return
            }
            const toReconnect = gate?.boarding && (firstGate == "nope") && this.recovering && (gate.reconnectCount == 0)
            console.log("toReconnect", toReconnect, "firstGate", firstGate, this.recovering, gate.reconnectCount)
            if (toReconnect ) {
                try {
                    await gate.reconnect()
                } catch(e) {
                    this.log("Reconnect failed", e)
                } finally {
                    this.log("Reconnect finalized")
                }
            }
        } else {
            await this.disengage()
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
        this.conf.ui.scrollback = this.conf.ui.scrollback || 10000

        this.conf.net = this.conf.net || {}
        this.conf.net.iceServer = this.conf.net.ice_server || [ DEFAULT_STUN_SERVER ]
        this.conf.net.peerbook = this.conf.net.peerbook ||
            DEFAULT_PB_HOST
        this.conf.net.timeout = this.conf.net.timeout || 5000
        this.conf.net.retries = this.conf.net.retries || 3
        this.conf.net.recoveryTime = this.conf.net.recovery_time || 4000
        this.conf.theme = this.conf.theme || {}
        this.conf.theme.foreground = this.conf.theme.foreground || "#00FAFA"
        this.conf.theme.background = this.conf.theme.background || "#000"
        this.conf.theme.selectionBackground = this.conf.theme.selection_background 
            || this.conf.theme.selectionBackground || "#D9F505"
        this.conf.theme.selectionForeground = this.conf.theme.selection_foreground
            || this.conf.theme.selectionForeground || "#271D30"
        this.conf.theme.fontFamily = this.conf.theme.font_family || "FiraCode"
        this.conf.theme.fontSize =  this.conf.theme.font_size || 14
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

    toggleHelp(doShow: boolean = null) {
        if (doShow == null) {
            this.isHelpShown = !this.isHelpShown
        } else {
            this.isHelpShown = doShow
        }
        const isPaneShown = terminal7.activeG?.boarding
        if (!this.buttonHelpBubbles)
            this.createHelpBubbles()
        const funcName = this.isHelpShown ? 'remove' : 'add'
        this.buttonHelpBubbles.forEach(bhb => {
            if ((!isPaneShown && !bhb.parentElement?.classList.contains('off')) || isPaneShown || funcName === 'add')
                bhb.classList[funcName]('hidden')
        })
        if (isPaneShown) {
            document.getElementById('help-gate').classList[funcName]('hidden')
            this.focus()
        }
        this.activeG?.activeW?.activeP?.hideSearch()
    }

    private isHelpShown = false

    private buttonHelpBubbles: HTMLDivElement[]

    private createHelpBubbles() {
        const buttons = document.querySelectorAll('.has-help[aria-label]')
        const helpBubbles: HTMLDivElement[] = []
        const metaKey = this.getModifierKey()
        buttons.forEach((c: HTMLElement) => {
            const hb = document.createElement('div')
            if (c.dataset.sc) {
                const shortCut = document.createElement('div')
                shortCut.innerHTML = `${metaKey} ${c.dataset.sc}`
                hb.appendChild(shortCut)
            }
            const text = document.createElement('div')
            text.innerHTML = c.ariaLabel
            hb.className = 'help-bubble-text hidden'
            hb.appendChild(text)
            c.appendChild(hb)
            helpBubbles.push(hb)
        })
        this.buttonHelpBubbles = helpBubbles
    }

    private getModifierKey() {
        let modifierKeyPrefix = "CTRL-A"
        if (
            navigator.platform.indexOf("Mac") === 0 ||
            navigator.platform === "iPhone"
        ) {
            modifierKeyPrefix = "⌘"
        }
        return modifierKeyPrefix
    }

    log(...args) {
        const now = new Date()
        const hours = now.getHours().toString().padStart(2, '0')
        const minutes = now.getMinutes().toString().padStart(2, '0')
        const seconds = now.getSeconds().toString().padStart(2, '0')
        const millis = now.getMilliseconds().toString().padStart(3, '0')
        let line = `${hours}:${minutes}:${seconds}.${millis} `
        args.forEach(a => line += JSON.stringify(a) + " ")
        console.log(line)
        this.logBuffer.push(line)
    }
    async dumpLog() {
        let data = ""
        while (this.logBuffer.length > 0) {
            data += this.logBuffer.shift() + "\n"
        }
        return data
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
            throw "Biometric failed: " + e.message
        } finally {
            this.ignoreAppEvents = false
        }
        this.log("Got biometric verified ", verified)
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
        // first, reload the conf
        terminal7.loadConf(TOML.parse(text))
        this.cells.forEach(c => {
            if (c instanceof Pane)
                c.setTheme(this.conf.theme)
        })
        // resize TWR
        if (this.map.t0.options.fontFamily != this.conf.theme.fontFamily) {
            this.map.t0.options.fontFamily = this.conf.theme.fontFamily
            setTimeout(() => this.map.fitAddon.fit(), 100)
        }
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
                firstConnection: true,
            }]
        }
        if (gates) {
            gates.forEach(g => {
                g.store = true
                this.addGate(g).e.classList.add("hidden")
            })
            this.storeGates()
        }
        this.map.refresh()
    }
    // isActive returns true if the component is active
    // TODO: refactor the code to use this
    isActive(com: unknown) {
        return this.activeG 
            && ((this.activeG == com)
                || (this.activeG.activeW==com)
                || (this.activeG.activeW && (this.activeG.activeW.activeP == com)))
    }
    getIceServers(): Promise<IceServers[]> {
        return new Promise((resolve, reject) => {
            if (this.iceServers) {
                resolve(this.iceServers)
                return
            }
            if (!this.pb.session || !this.pb.session.isOpen() ) {
                this.setIceServers([])
                resolve(this.iceServers)
                return
            }
            this.pb.session.sendCTRLMsg(new ControlMessage("ice_servers"))
            .then(resp => JSON.parse(resp))
            .then(servers => {
                this.setIceServers(servers)
                resolve(this.iceServers)
            }).catch(err =>
                reject("failed to get ice servers " + err.toString())
            )
        })
    }
    setIceServers(servers) {
        const iceServer = this.conf.net.iceServer
        if (iceServer?.length > 0) {
            if (servers && servers.length > 0)
                servers.unshift({ urls: iceServer })
            else
                servers = [{ urls: iceServer }]
        }
        this.iceServers = servers
    }
}
