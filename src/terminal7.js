/* Terminal 7

 *  This file contains the code that makes terminal 7 - a webrtc based
 *  touchable terminal multiplexer.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { Gate } from './gate.ts'
import { T7Map } from './map.ts'
import { CyclicArray } from './cyclic.js'
import * as TOML from '@tuzig/toml'
import CodeMirror from '@tuzig/codemirror/src/codemirror.js'
import { vimMode } from '@tuzig/codemirror/keymap/vim.js'
import { tomlMode} from '@tuzig/codemirror/mode/toml/toml.js'
import { dialogAddOn } from '@tuzig/codemirror/addon/dialog/dialog.js'
import { formatDate } from './utils.js'
import { openDB } from 'idb'
import { marked } from 'marked'
import changelogURL  from '../CHANGELOG.md?url'
import ssh from 'ed25519-keygen/ssh';
import { randomBytes } from 'ed25519-keygen/utils';

import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Clipboard } from '@capacitor/clipboard'
import { Network } from '@capacitor/network'
import { Preferences } from '@capacitor/preferences'
import { Device } from '@capacitor/device'
import { NativeBiometric } from "capacitor-native-biometric"
import { RateApp } from 'capacitor-rate-app'


import { PeerbookConnection, PB } from './peerbook'
import { Failure } from './session';

const WELCOME=`    🖖 Greetings & Salutations 🖖

Thanks for choosing Terminal7. This is TWR, a local
terminal used to control the terminal and log messages.
Type \`hide\`, \`help\` or \`add\` if you're ready to board. 
For WebRTC 🍯 please \`subscribe\` to our online service.

Enjoy!

`
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
export class Terminal7 {
    DEFAULT_KEY_TAG = "dev.terminal7.keys.default"
    /*
     * Terminal7 constructor, all properties should be initiated here
     */
    constructor(settings) {
        settings = settings || {}
        this.gates = []
        this.cells = []
        this.timeouts = []
        this.activeG = null
        window.terminal7 = this
        this.scrollLingers4     = settings.scrollLingers4 || 2000
        this.shortestLongPress  = settings.shortestLongPress || 1000
        this.borderHotSpotSize  = settings.borderHotSpotSize || 30
        this.certificates = null
        this.confEditor = null
        this.flashTimer = null
        this.netConnected = true
        this.logBuffer = CyclicArray(settings.logLines || 101)
        this.zoomedE = null
        this.pendingPanes = {}
        this.pb = null
        this.ignoreAppEvents = false
        this.purchasesStarted = false
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
    /*
     * Terminal7.open opens terminal on the given DOM element,
     * loads the gates from local storage and redirects to home
     */
    async open() {
        let e = document.getElementById('terminal7')
        this.log("in open")
        this.lastActiveState = true
        this.e = e
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
                10))

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
            App.addListener('appStateChange', state => {
                const active =  state.isActive
                if (this.lastActiveState == active) {
                    this.log("app state event on unchanged state ignored")
                    return
                }
                this.lastActiveState = active
                console.log("app state changed", this.ignoreAppEvents)
                if (!active) {
                    if (this.ignoreAppEvents) {
                        terminal7.log("ignoring benched app event")
                        return
                    }
                    this.updateNetworkStatus({connected: false}, false)
                } else {
                    // We're back! puts us in recovery mode so that it'll
                    // quietly reconnect to the active gate on failure
                    if (this.ignoreAppEvents) {
                        this.ignoreAppEvents = false
                        return
                    }
                    this.clearTimeouts()
                    Network.getStatus().then(s => this.updateNetworkStatus(s))
                }
            })
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
        this.pbConnect().finally(() =>
            Network.getStatus().then(s => {
                this.updateNetworkStatus(s)
                if (!s.connected) {
                    this.goHome()
                }
            })
        )
    }
    /*
     * restoreState is a future feature that uses local storage to restore
     * terminal7 to it's last state
     */
    restoreState() {
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
                    let gate = this.gates[state.gateId]
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
    async pbConnect() {
        return new Promise((resolve, reject) => {
            const catchConnect = e => {
                if (e =="Unregistered")
                    this.notify(`${PB} You are unregistered, please \`subscribe\``)
                else if (e == Failure.NotSupported)
                    // TODO: this should be changed to a notification
                    // after we upgrade peerbook
                    console.log("PB not supported")
                else if (e != "Unauthorized") {
                    terminal7.log("PB connect failed", e)
                    this.notify(`${PB} Failed to connect, please try \`sub\``)
                    this.notify("If the problem persists, `support`")
                }
                reject(e)
            }

            // do nothing when no subscription or already connected
            if (this.pb) {
                if ((this.pb.uid != "TBD")  && (this.pb.uid != "")) {
                    this.pb.wsConnect().then(resolve).catch(reject)
                    return
                }
                if (this.pb.isOpen())
                    resolve()
                else
                    this.pb.connect().then(resolve).catch(catchConnect)
                return
            }
            this.getFingerprint().then(fp => {
                this.pb = new PeerbookConnection({
                    fp: fp,
                    host: this.conf.net.peerbook,
                    insecure: this.conf.peerbook && this.conf.peerbook.insecure,
                    shell: this.map.shell
                })
                this.pb.onUpdate = (m) => this.onPBMessage(m)
                if (!this.purchasesStarted) {
                    this.pb.startPurchases().then(() => 
                        this.pb.connect().then(resolve).catch(catchConnect)
                        // this.pb.updateCustomerInfo().then(resolve).catch(reject)
                    ).catch(reject).finally(() => this.purchasesStarted = true)
                } else
                    this.pb.connect().then(resolve).catch(catchConnect)
            })
        })
    }
    catchFingers() {
        this.e.addEventListener("pointerdown", ev => this.onPointerDown(ev))
        this.e.addEventListener("pointerup", ev => this.onPointerUp(ev))
        this.e.addEventListener("pointercancel", ev => this.onPointerCancel(ev))
        this.e.addEventListener("pointermove", ev => this.onPointerMove(ev))
    }
    /*
     * Terminal7.addGate is used to add a new gate.
     * the function ensures the gate has a unique name adds the gate to
     * the `gates` property, stores and returns it.
     */
    // TOFO: add onMap to props
    addGate(props, onMap = true) {
        let p = props || {}
        // add the id
        p.id = p.fp || p.name
        let g = new Gate(p)
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
        let out = []
        this.gates.forEach(g => {
            if (g.store) {
                let ws = []
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
        Preferences.remove({key: "last_state"}) 
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
        var i = this.timeouts.length,
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
    disengage() {
        return new Promise(resolve => {
            this.pbClose()
            var count = 0
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
            let callCB = () => terminal7.run(() => {
                if (count == 0)
                    resolve()
                 else 
                    callCB()
            }, 50)
            callCB()
        })
    }
    async updateNetworkStatus (status, updateNetPopup = true) {
        let off = document.getElementById("offline").classList
        if (this.netConnected == status.connected)
            return
        this.netConnected = status.connected
        this.log(`updateNetworkStatus: ${status.connected}`)
        if (status.connected) {
            if (updateNetPopup)
                off.add("hidden")
            const gate = this.activeG
            const firstGate = (await Preferences.get({key: "first_gate"})).value
            const toReconnect = gate && gate.boarding && (firstGate == "nope")
            console.log("toReconnect", toReconnect, "firstGate", firstGate)
            if (toReconnect ) {
                this.notify("🌞 Recovering")
                this.map.shell.startWatchdog().catch(() => {
                    if (this.pb.isOpen())
                        gate.notify("Timed out")
                    else
                        this.notify(`${PB} timed out, please try \`subscribe\``)
                    gate.stopBoarding()
                })
            } else
                this.recovering = false
            this.pbConnect().catch(e => this.log("pbConnect failed", e))
                .finally(() => {
                    if (toReconnect) {
                        gate.reconnect()
                            .catch(() => this.map.shell.runCommand("reset", [gate.name]))
                            .finally(() =>  {
                                this.recovering = false
                                this.map.shell.stopWatchdog()
                            })
                    }
                })
        } else {
            if (updateNetPopup)
                off.remove("hidden")
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
    getFingerprint() {
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
                let tx = db.transaction("certificates"),
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
    storeCertificate() {
        return new Promise((resolve, reject) => {
            openDB("t7", 1, { 
                    upgrade(db) {
                        db.createObjectStore('certificates', {keyPath: 'id',
                            autoIncrement: true})
                    },
            }).then(db => {
                let tx = db.transaction("certificates", "readwrite"),
                    store = tx.objectStore("certificates"),
                    c = this.certificates[0]
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
        var helpId = "help-gate",
            ecl = document.getElementById(helpId).classList,
            bcl = document.getElementById("help-button").classList
            
        ecl.toggle("show")
        bcl.toggle("on")
        if (!ecl.contains("show"))
            this.focus()
        // TODO: When at home remove the "on" from the home butto
    }
    // handle incomming peerbook messages (coming over sebsocket)
    async onPBMessage(m) {
        this.log("got pb message", m)
        if (m["code"] !== undefined) {
            this.notify(`\uD83D\uDCD6  ${m["text"]}`)
            return
        }
        if (m["peers"] !== undefined) {
            this.gates = this.pb.syncPeers(this.gates, m.peers)
            this.map.refresh()
            return
        }
        if (m["verified"] !== undefined) {
            if (!m["verified"])
                this.notify("\uD83D\uDCD6 UNVERIFIED. Please check you email.")
            return
        }
        const fp = m.source_fp
        // look for a gate where g.fp == fp
        const myFP = await this.getFingerprint()
        if (fp == myFP) {
            return
        }
        let lookup =  this.gates.filter(g => g.fp == fp)

        if (!lookup || (lookup.length != 1)) {
            if (m["peer_update"] !== undefined) {
                lookup =  this.gates.filter(g => g.name == m.peer_update.name)
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
            g.fp = m.source_fp
            g.updateNameE()
            return
        }
        if (!g.session) {
            console.log("session is close ignoring message", m)
            return
        }
        if (m.candidate !== undefined) {
            g.session.peerCandidate(m.candidate)
            return
        }
        if (m.answer !== undefined ) {
            var answer = JSON.parse(atob(m.answer))
            g.session.peerAnswer(answer)
            return
        }
    }
    log (...args) {
        var line = ""
        args.forEach(a => line += JSON.stringify(a) + " ")
        console.log(line)
        this.logBuffer.push(line)
    }
    async dumpLog() {
        var data = ""
        while (this.logBuffer.length > 0) {
            data += this.logBuffer.shift() + "\n"
        }
        Clipboard.write({string: data})
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
        this.lastT = null
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
        let x  = ev.pageX,
            y  = ev.pageY

        /*
        if ((ev.pointerType == "mouse") && (ev.pressure == 0))
            return
            */

        if (this.gesture) {
            let where = this.gesture.where,
                dest = Math.min(1.0, (where == "top")
                    ? y / document.querySelector('.windows-container').offsetHeight
                    : x / document.body.offsetWidth)
            this.gesture.pane.layout.moveBorder(this.gesture.pane, where, dest)
            ev.stopPropagation()
            ev.preventDefault()
        }
    }
    async onPointerUp(ev) {
        let e = ev.target,
            gatePad = e.closest(".gate-pad")

        if (!this.pointer0)
            return
        if (gatePad) {
            const gate = gatePad.gate
            const isExpand = e.classList.contains("gate-edit")
            if (!gate)
                return
            else {
                let deltaT = Date.now() - this.pointer0
                clearTimeout(this.longPressGate)
                this.longPressGate = null
                if (deltaT < this.conf.ui.quickest_press) {
                    // that's for the refresh and static host add
                    if (isExpand) {
                        if (gate.fp) {
                            const insecure = this.conf.peerbook.insecure,
                                schema = insecure?"http":"https"
                            window.open(`${schema}://${this.conf.net.peerbook}`, "_blank")
                        }
                        else
                            this.map.shell.runCommand("edit", [gate.name])
                    } else {
                        await this.map.shell.runCommand("connect", [gate.name])
                    }
                }
            }
            ev.stopPropagation()
            ev.preventDefault()
        } else if (this.gesture) {
            this.activeG.sendState()
        } else if (this.firstPointer) {
            let deltaT = Date.now() - this.pointer0,
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
                    let cell = ev.target.closest(".cell"),
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
            Preferences.set({key: "greeted", value: "yep"})
            this.map.tty(WELCOME)
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
    async factoryReset() {
        // setting up reset cert events
        return new Promise(resolve => {
            this.resetGates()
            Preferences.clear().then(() => 
                Preferences.set({key: 'dotfile', value: DEFAULT_DOTFILE}))
            const d = TOML.parse(DEFAULT_DOTFILE)
            this.loadConf(d)
            this.pbClose()
            openDB("t7", 1).then(db => {
                let tx = db.transaction("certificates", "readwrite"),
                    store = tx.objectStore("certificates")
                store.clear().then(() => {
                    resolve()
                })
            })
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
        document.querySelectorAll("a[href]").forEach(e => {
            e.addEventListener("click", ev => {
                ev.stopPropagation()
                ev.preventDefault()
                window.open(e.href, '_blank')
            })
        })
	}
    // if show is undefined the change log view state is toggled
	showChangelog(show) {
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
    async readId() {
        const now = Date.now()
        if (this.keys && (now - this.lastIdVerify  < this.conf.ui.verificationTTL))
            return this.keys
        this.ignoreAppEvents = true
        let verified
        try {
            verified = await NativeBiometric.verifyIdentity({
                reason: "Use private key to connect",
                title: "Access Private Key",
            })
        } catch(e) {
            this.notify(`Biometric failed: ${e.message}`)
            this.ignoreAppEvents = false
            throw "Biometric failed: " + e.message
        }
        console.log("Got biometric verified ", verified)
        this.lastActiveState = false
        // wait for the app events to bring the ignoreAppEvents to false
        while (this.ignoreAppEvents)
            await (() => { return new Promise(r => setTimeout(r, 50)) })()

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
            if (typeof(c.setTheme) == "function")
                c.setTheme(this.conf.theme)
        })
        terminal7.loadConf(TOML.parse(text))
        if (this.pb &&
            ((this.pb.host != this.conf.net.peerbook) 
             || (this.pb.peerName != this.conf.peerbook.peer_name)
             || (this.pb.insecure != this.conf.peerbook.insecure)
             || (this.pb.email != this.conf.peerbook.email))) {
            this.pbClose()
            this.pb = null
            this.pbConnect()
        }
        return Preferences.set({key: "dotfile", value: text})
    }
    async pbVerify() {
        const fp = await this.getFingerprint()
        const schema = this.insecure?"http":"https"
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
            gates.forEach(g => {
                g.store = true
                this.addGate(g).e.classList.add("hidden")
            })
            this.map.refresh()
        }
    }
}
