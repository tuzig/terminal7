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
import { imageMapResizer } from './imageMapResizer.js'
import CodeMirror from '@tuzig/codemirror/src/codemirror.js'
import { vimMode } from '@tuzig/codemirror/keymap/vim.js'
import { tomlMode} from '@tuzig/codemirror/mode/toml/toml.js'
import { dialogAddOn } from '@tuzig/codemirror/addon/dialog/dialog.js'
import { formatDate } from './utils.js'
import { openDB } from 'idb'
import { marked } from 'marked'
import changelogURL  from '../CHANGELOG.md?url'

import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Clipboard } from '@capacitor/clipboard'
import { Network } from '@capacitor/network'
import { Storage } from '@capacitor/storage'
import { Form } from './form'
import { PeerbookConnection } from './peerbook'



const WELCOME=`    🖖 Greetings & Salutations 🖖

Thanks for trying Terminal7. This is TWR, a local
terminal used to print log messages and get your input.

To use a real terminal you'll need a remote server.
T7 can connect to a server using SSH or WebRTC.
Our WebRTC server, webexec, is an open 
source terminal server based on pion and written in go.
In addition to WebRTC, webexec adds resilient sessions,
behind-the-NAT connections and more.

Enjoy!

(hit Escape or tap outside to minimize TWR)
`
const DEFAULT_DOTFILE = `# Terminal7's configurations file
[theme]
# foreground = "#00FAFA"
# background = "#000"
# selection = "#D9F505"

[exec]
# shell = "*"

[net]
# timeout = 3000
# retries = 3
# ice_server = "stun:stun2.l.google.com:19302"

[ui]
# leader = "a"
# quickest_press = 1000
# max_tabs = 10
# cut_min_distance = 80
# cut_min_speed = 2.5
# no pinch when scrolling -> y velocity higher than XTZ px/ms
# pinch_max_y_velocity = 0.1
# auto_restore = false
# flash = 100
`

export class Terminal7 {
    /*
     * Terminal7 constructor, all properties should be initiated here
     */
    constructor(settings) {
        settings = settings || {}
        this.gates = new Map()
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
        this.netStatus = null
        this.logBuffer = CyclicArray(settings.logLines || 101)
        this.zoomedE = null
        this.pendingPanes = {}
        this.pb = null
    }
    showKeyHelp () {
        if (Date.now() - this.metaPressStart > 987) {
            var e
            if (this.activeG && this.activeG.activeW.activeP.copyMode )
                e = document.getElementById('help-copymode')
            else
                e = document.getElementById('keys-help')
            e.classList.remove('hidden')
        }
    }
    /*
     * Terminal7.open opens terminal on the given DOM element,
     * loads the gates from local storage and redirects to home
     */
    async open() {
        let e = document.getElementById('terminal7')
        this.log("in open")
        this.e = e
        await Storage.migrate()
        // reading conf
        let d = {},
            { value } = await Storage.get({key: 'dotfile'})
        if (value == null) {
            value = DEFAULT_DOTFILE
            Storage.set({key: 'dotfile', value: value})
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
                        if (this.activeG)
                            this.activeG.activeW.activeP.close()})
        document.getElementById("map-button")
                .addEventListener("click", () => this.goHome())
        document.getElementById("log-button")
                .addEventListener("click", () => this.map.showLog())
        document.getElementById("search-button")
                .addEventListener("click", () => 
                   this.activeG && this.activeG.activeW.activeP.toggleSearch())
        document.getElementById("help-gate")
                .addEventListener("click", () => this.toggleHelp())
        document.getElementById("help-button")
                .addEventListener("click", () => this.toggleHelp())
        document.querySelectorAll("#help-copymode, #keys-help").forEach(e => 
                e.addEventListener("click", () => this.clear()))
        document.getElementById("divide-h")
                .addEventListener("click", () =>  {
                    if (this.activeG && this.activeG.activeW.activeP.sy >= 0.04)
                        this.activeG.activeW.activeP.split("rightleft", 0.5)})
        document.getElementById("divide-v")
                .addEventListener("click", () =>  {
                    if (this.activeG && this.activeG.activeW.activeP.sx >= 0.04)
                        this.activeG.activeW.activeP.split("topbottom", 0.5)})
        document.getElementById('add-gate').addEventListener(
            'click', async (ev) => {
                this.map.interruptTTY()
                this.map.showLog(true)
                setTimeout(() => this.connect(), 50)
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
            "click", () => this.clear())
        // add webexec installation instructions
        const fp = await this.getFingerprint(),
            rc = `bash -c "$(curl -sL https://get.webexec.sh)"
echo "${fp}" >> ~/.config/webexec/authorized_fingerprints`
        e.querySelectorAll('.webexec-install').forEach(e => {
            e.innerHTML = `<p>To use WebRTC the server needs webexec:</p>
<div>
<pre>${rc}</pre>
<button type="button" class="copy"><i class="f7-icons">doc_on_clipboard</i></button>
</div>
`
            e.querySelector('button').addEventListener('click', () => {
                this.notify("Copied commands to the clipboard")
                Clipboard.write( {string: rc })
            })

        })

        // keyboard
        document.addEventListener("keydown", ev => {
            if ((ev.key == "Meta") && (Capacitor.getPlatform() != "ios")) {
                this.metaPressStart = Date.now()
                this.run(() => this.showKeyHelp(), terminal7.conf.ui.quickest_press)
            } else
                this.metaPressStart = Number.MAX_VALUE
        })
        document.addEventListener("keyup", ev => {
            // hide the modals when releasing the meta key
            if ((ev.key == "Meta") &&
                (Date.now() - this.metaPressStart > terminal7.conf.ui.quickest_press)) {
                this.clear()
            }
            this.metaPressStart = Number.MAX_VALUE
        })
        this.map = new T7Map()
        // Load gates from local storage
        let gates
        value = (await Storage.get({key: 'gates'})).value
        if (value) {
            try {
                gates = JSON.parse(value)
            } catch(e) {
                 terminal7.log("failed to parse gates", value, e)
                gates = []
            }
            gates.forEach((g) => {
                g.store = true
                this.addGate(g).e.classList.add("hidden")
            })
            this.map.refresh()
        }
        if (Capacitor.isNativePlatform())  {
            App.addListener('appStateChange', state => {
                if (!state.isActive) {
                    // this prevents a resizing bug that keeps the font tiny
                    this.showLog(true)
                    if (this.pb) {
                        this.pb.close()
                        this.pb = null
                    }
                    // We're getting suspended. disengage.
                    this.disengage().then(() => {
                        this.clearTimeouts()
                    })
                } else {
                    // We're back! ensure we have the latest network status and 
                    // reconnect to the active gate
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
        var modal   = document.getElementById("settings-modal")
        modal.addEventListener('click',
            () => {
                document.getElementById("dotfile-button").classList.remove("on")
                this.clear()
            }
        )
        document.getElementById("dotfile-button")
                .addEventListener("click", ev => this.toggleSettings(ev))
        modal.querySelector(".close").addEventListener('click',
            () => {
                document.getElementById("dotfile-button").classList.remove("on")
                this.clear()
            }
        )
        modal.querySelector(".save").addEventListener('click',
            () => this.wqConf())
        modal.querySelector(".copy").addEventListener('click',
            () => {
                var area = document.getElementById("edit-conf")
                this.confEditor.save()
                Clipboard.write({string: area.value})
                this.clear()
            })
        this.map.open().then(() => {
           this.goHome()
           setTimeout(() => this.showGreetings(), 100)
        })
        Network.getStatus().then(s => {
            this.updateNetworkStatus(s)
            if (!s.connected) {
                this.goHome()
                return
            }
        })
    }
    restoreState() {
        return new Promise((resolve, reject) => {
            if (!this.conf.ui.autoRestore) {
                reject()
                return
            }
            Storage.get({key: "last_state"}).then(({ value }) => {
                if (!value)
                    reject()
                else {
                    const state = JSON.parse(value),
                          id = state.id
                    let gate

                    gate = this.gates.get(id)
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
    async peerbookForm() {
        let dotfile = (await Storage.get({key: 'dotfile'})).value || DEFAULT_DOTFILE

        const f = new Form([
            {
                prompt: "Email",
                validator: email => !email.match(/.+@.+\..+/) ? "Must be a valid email" : ''
            },
            { prompt: "Peer's name" }
        ])
        f.start(this.map.t0).then(results => {
            const email = results[0],
                peername = results[1]

            dotfile += `
[peerbook]
email = "${email}"
peer_name = "${peername}"\n`

            Storage.set({ key: "dotfile", value: dotfile })
            this.loadConf(TOML.parse(dotfile))
            this.notify("Your email was added to the dotfile")
            this.pbConnect()
            this.clear()
        }).catch(() => {
            this.map.showLog(false)
        })
    }
    pbConnect() {
        return new Promise((resolve) => {
            if (!this.conf.peerbook || !this.conf.peerbook.email || 
               (this.pb  && this.pb.isOpen())) {
                resolve()
                return
            }
            this.getFingerprint().then(fp => {
                this.pb = new PeerbookConnection(fp,
                    this.conf.peerbook.email,
                    this.conf.peerbook.peer_name,
                    this.conf.net.peerbook,
                    this.conf.peerbook.insecure
                )
                this.pb.onUpdate = (m) => this.onPBMessage(m)
                this.pb.connect().then(resolve)
            })
        })
    }
    async toggleSettings() {
        var modal   = document.getElementById("settings-modal"),
            button  = document.getElementById("dotfile-button"),
            area    =  document.getElementById("edit-conf"),
            conf    =  (await Storage.get({key: "dotfile"})).value || DEFAULT_DOTFILE

        area.value = conf

        button.classList.toggle("on")
        modal.classList.toggle("hidden")
        if (button.classList.contains("on")) {
           if (this.confEditor == null) {
                vimMode(CodeMirror)
                tomlMode(CodeMirror)
                dialogAddOn(CodeMirror)
                CodeMirror.commands.save = () => this.wqConf()

                this.confEditor  = CodeMirror.fromTextArea(area, {
                   value: conf,
                   lineNumbers: true,
                   mode: "toml",
                   keyMap: "vim",
                   matchBrackets: true,
                   showCursorWhenSelecting: true
                })
            }
            this.confEditor.focus()
        }

    }
    /*
     * wqConf saves the configuration and closes the conf editor
     */
    wqConf() {
        var area    =  document.getElementById("edit-conf")
        document.getElementById("dotfile-button").classList.remove("on")
        this.confEditor.save()
        this.loadConf(TOML.parse(area.value))
        Storage.set({key: "dotfile", value: area.value})
        this.cells.forEach(c => {
            if (typeof(c.setTheme) == "function")
                c.setTheme(this.conf.theme)
        })
        document.getElementById("settings-modal").classList.add("hidden")
        this.confEditor.toTextArea()
        this.confEditor = null
        if (this.pb &&
            ((this.pb.host != this.conf.net.peerbook) 
             || (this.pb.peerName != this.conf.peerbook.peer_name)
             || (this.pb.insecure != this.conf.peerbook.insecure)
             || (this.pb.email != this.conf.peerbook.email))
        )
        this.pb.close()
        this.pbConnect()
		this.pb = null
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
        let p = props || {},
            addr = p.addr
        // add the id
        p.id = p.fp || addr

        let g = new Gate(p)
        this.gates.set(p.id, g)
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
                    username:g.username})
            }
        })
        this.log("Storing gates:", out)
        await Storage.set({key: 'gates', value: JSON.stringify(out)})
        this.map.refresh()
    }
    clear() {
        this.e.querySelectorAll('.temporal').forEach(e => e.remove())
        this.e.querySelectorAll('.modal').forEach(e => {
            if (!e.classList.contains("non-clearable"))
                e.classList.add("hidden")
        })
        this.map.showLog(false)
        this.focus()
        this.longPressGate = null
        if (Form.activeForm)
            Form.activeForm.escape(this.map.t0)
    }
    goHome() {
        Storage.remove({key: "last_state"}) 
        const s = document.getElementById('map-button')
        s.classList.add('off')
        if (this.activeG) {
            this.activeG.e.classList.add("hidden")
            this.activeG = null
        }
        // hide the modals
        this.clear()
        document.querySelectorAll(".pane-buttons").forEach(
            e => e.classList.add("off"))
        window.location.href = "#map"
        document.title = "Terminal 7"
        document.getElementById('log').classList.remove('hidden', 'show')
    }
    /*
     * onDisconnect is called when a gate disconnects.
     */
    async onDisconnect(gate) {
        if (!this.netStatus.connected || 
            ((this.activeG != null) && (gate != this.activeG)))
            return
        
        const reconnectForm = new Form([
            { prompt: "Reconnect" },
            { prompt: "Close" }
        ])
        let res
        try {
            res = await reconnectForm.menu(this.map.t0)
        } catch(e) {
            res = null
        }
        if (res == "Reconnect") {
            gate.session = null
            gate.connect(gate.onConnected)
        } else {
            this.map.showLog(false)
            gate.clear()
            this.goHome()
        }
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
        this.map.t0.writeln(` \x1B[2m${t}\x1B[0m ${message}`)
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
            var count = 0
            if (this.gates.size > 0)
                this.gates.forEach(g => {
                    if (g.boarding) {
                        count++
                        g.disengage().then(() => {
                            g.boarding = false
                            count--
                        })
                    }
                })
            if (this.pb) {
                this.pb.close()
                this.pb = null
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
    updateNetworkStatus (status) {
        let off = document.getElementById("offline").classList
        this.netStatus = status
        this.log(`updateNetworkStatus: ${status.connected}`)
        if (status.connected) {
            off.add("hidden")
            this.pbConnect()
            const gate = this.activeG
            if (gate) {
                gate.reconnect().catch(() => gate.connect())
            }
        } else {
            off.remove("hidden")
            // this.gates.forEach(g => g.session = null)
            this.pb = null
        }
    }
    loadConf(conf) {
        this.conf = conf
        this.conf.exec = this.conf.exec || {}
        this.conf.exec.shell = this.conf.exec.shell || "*"
        this.conf.ui = this.conf.ui || {}
        this.conf.ui.quickest_press = this.conf.ui.quickest_press || 1000
        this.conf.ui.max_tabs = this.conf.ui.max_tabs || 10
        this.conf.ui.leader = this.conf.ui.leader || "a"
        this.conf.ui.cutMinSpeed = this.conf.ui.cut_min_speed || 2.5
        this.conf.ui.cutMinDistance = this.conf.ui.cut_min_distance || 80
        this.conf.ui.pinchMaxYVelocity = this.conf.ui.pinch_max_y_velocity || 0.1
        this.conf.ui.autoRestore = this.conf.ui.auto_restore || false
        this.conf.net = this.conf.net || {}
        this.conf.net.iceServer = this.conf.net.ice_server ||
            "stun:stun2.l.google.com:19302"
        this.conf.net.peerbook = this.conf.net.peerbook ||
            "api.peerbook.io"
        if (this.conf.net.peerbook == "pb.terminal7.dev")
            terminal7.notify(`\uD83D\uDCD6 Your setting include an old peerbook addres.<br/>
                              Please click <i class="f7-icons">gear</i> and change net.peerbook to "api.peerbook.io"`)
        this.conf.net.timeout = this.conf.net.timeout || 3000
        this.conf.net.retries = this.conf.net.retries || 3
        this.conf.theme = this.conf.theme || {}
        this.conf.theme.foreground = this.conf.theme.foreground || "#00FAFA"
        this.conf.theme.background = this.conf.theme.background || "#000"
        this.conf.theme.selection = this.conf.theme.selection || "#D9F505"
/*
            Device.getInfo()
            .then(i =>
                this.conf.peerbook.peer_name = `${i.name}'s ${i.model}`)
            .catch(err => {
                console.log("Device info error", err)
                this.conf.peerbook.peer_name = "John Doe"
            })
            */
    }


    // gets the will formatted fingerprint from the current certificate
    getFingerprint() {
        // gets the certificate from indexDB. If they are not there, create them
        return new Promise((resolve, reject) => {
            if (this.certificates) {
                var cert = this.certificates[0].getFingerprints()[0]
                resolve(cert.value.toUpperCase().replaceAll(":", ""))
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
                     this.certificates = certificates
                     db.close()
                     const cert = certificates[0].getFingerprints()[0]
                     resolve(cert.value.toUpperCase().replaceAll(":", ""))
                 }).catch(() => {
                    this.generateCertificate()
                    .then(cert => resolve(
                        cert.getFingerprints()[0].value.toUpperCase().replaceAll(":", "")))
                    .catch(reject)
                })
            }).catch(e => {
                db.close()
                this.log(`got an error opening db ${e}`)
                reject(e)
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
                db.close()
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
        if (ecl.contains("show"))
            imageMapResizer()
        else
            this.focus()
        // TODO: When at home remove the "on" from the home butto
    }
    onPBMessage(data) {
        this.log("got ws message", data)
        const  m = JSON.parse(data)
                
        if (m["code"] !== undefined) {
            this.notify(`\uD83D\uDCD6  ${m["text"]}`)
            return
        }
        if (m["peers"] !== undefined) {
            this.syncPBPeers(m["peers"])
            return
        }
        if (m["verified"] !== undefined) {
            if (!m["verified"])
                this.notify("\uD83D\uDCD6 UNVERIFIED. Please check you email.")
            return
        }
        var g = this.gates.get(m.source_fp)
        if (!g)
            return

        if (m["peer_update"] !== undefined) {
            g.online = m.peer_update.online
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
         * Storage pluging failes
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
                    gate.edit()
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
            let deltaT = Date.now() - this.pointer0
            clearTimeout(this.longPressGate)
            this.longPressGate = null
            if (deltaT > this.conf.ui.quickest_press) {
                ev.stopPropagation()
                ev.preventDefault()
            } else {
                // that's for the refresh and static host add
                const gate = gatePad.gate
                if (!gate)
                    return
                if (!gate.fp || gate.verified && gate.online) {
                    this.activeG = gate
                    this.map.interruptTTY()
                    await gate.connect()
                }
                else
                    gate.edit()
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

            if ((d > this.conf.ui.cutMinDistance)
                && (s > this.conf.ui.cutMinSpeed)) {
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
        this.pointer0 = null
        this.firstPointer = null
        this.gesture = null
    }
    async showGreetings() {
        const  { greeted } = await Storage.get({key: 'greeted'})
        if (greeted == null) {
            Storage.set({key: "greeted", value: "yep"})
            this.map.tty(WELCOME)
        } else {
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
    syncPBPeers(peers) {
        peers.forEach(p => {
            if (p.kind != "webexec")
                return
            var g = this.gates.get(p.fp)
            if (g != undefined) {
                g.online = p.online
                g.name = p.name
                g.verified = p.verified
                g.updateNameE()
            } else {
                p.id = p.fp
                g = new Gate(p)
                this.gates.set(p.fp, g)
                g.nameE = this.map.add(g)
                g.updateNameE()
                g.open(this.e)
            }
        })
        this.map.refresh()
    }
    async connect() {
        if (!this.conf.peerbook) {
            const pbForm = new Form([
                { prompt: "Add static host" },
                { prompt: "Setup peerbook" }
            ])
            let choice
            try {
                choice = await pbForm.menu(this.map.t0)
            } catch (e) {
                this.map.showLog(false)
                return
            }
            if (choice == "Setup peerbook") {
                this.peerbookForm()
                return
            }
        }
        const f = new Form([
            { prompt: "Enter destination (ip or domain)" }
        ])
        let hostname
        try {
            hostname = (await f.start(this.map.t0))[0]
        } catch (e) { 
            this.map.showLog(false)
            return
        }

        if (this.validateHostAddress(hostname)) {
            this.map.t0.writeln(`  ${hostname} already exists, connecting...`)
            this.gates.get(hostname).connect()
            return
        }
        this.activeG = this.addGate({
            name: "temp_" + Math.random().toString(16).slice(2), // temp random name
            addr: hostname,
            id: hostname
        }, false)
        this.map.refresh()
        this.activeG.CLIConnect()
    }
    clearTempGates() {
        this.gates.forEach(g => {
            if (g.name.startsWith("temp_"))
                g.delete()
        })
    }
    validateHostAddress(addr) {
        return this.gates.has(addr) ? "Host already exists" : ""
    }
    validateHostName(name) {
        for (const [, gate] of this.gates) {
            if (gate.name == name)
                return "Name already taken"
        }
        return ""
    }
    factoryReset() {
        // setting up reset cert events
        return new Promise(resolve => {
            this.gates.forEach(g => {
                g.e.remove()
                this.map.remove(g)
                this.gates.delete(g.id)
            })
            Storage.delete({key: 'gates'}).then(() => 
                Storage.delete({key: 'greeted'}).then(() => 
                    Storage.set({key: 'dotfile', value: DEFAULT_DOTFILE})))
            const d = TOML.parse(DEFAULT_DOTFILE)
            this.loadConf(d)
            if (this.pb) {
                this.pb.close()
                this.pb = null
            }
            openDB("t7", 1).then(db => {
                let tx = db.transaction("certificates", "readwrite"),
                    store = tx.objectStore("certificates")
                store.clear().then(() => {
                    resolve()
                })
            })
        })
    }
	async loadChangelog() {
		const resp = await fetch(changelogURL)
		const changelog = await resp.text()
		const e = document.getElementById("changelog-content")
		e.innerHTML = marked.parse(changelog)
		// add prefix to all ids to avoid conflicts
        e.querySelectorAll("[id]").forEach(e => e.id = "changelog-" + e.id)
		e.querySelectorAll("a").forEach(a => a.target = "_blank")
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
}
