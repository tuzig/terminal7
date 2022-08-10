/* Terminal 7

 *  This file contains the code that makes terminal 7 - a webrtc based
 *  touchable terminal multiplexer.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { Gate } from './gate.ts'
import { Window } from './window.js'
import { CyclicArray } from './cyclic.js'
import * as Hammer from 'hammerjs'
import * as TOML from '@tuzig/toml'
import { imageMapResizer } from './imageMapResizer.js'
import CodeMirror from '@tuzig/codemirror/src/codemirror.js'
import { vimMode } from '@tuzig/codemirror/keymap/vim.js'
import { tomlMode} from '@tuzig/codemirror/mode/toml/toml.js'
import { dialogAddOn } from '@tuzig/codemirror/addon/dialog/dialog.js'
import { formatDate } from './utils.js'
import { openDB } from 'idb'

import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Clipboard } from '@capacitor/clipboard'
import { Network } from '@capacitor/network'
import { Storage } from '@capacitor/storage'
import { Device } from '@capacitor/device'
import { Form, openFormsTerminal } from './form'
import { PeerbookConnection } from './peerbook'



const DEFAULT_DOTFILE = `[theme]
foreground = "#00FAFA"
background = "#000"
selection = "#D9F505"

[indicators]
flash = 100

[exec]
shell = "*"

[net]
timeout = 3000
retries = 3
ice_server = "stun:stun2.l.google.com:19302"

[ui]
quickest_press = 1000
max_tabs = 10
cut_min_distance = 80
cut_min_speed = 2.5
# no pinch when scrolling -> y velocity higher than XTZ px/ms
pinch_max_y_velocity = 0.1
# auto_restore = false
`

export class Terminal7 {
    /*
     * Terminal7 constructor, all properties should be initiated here
     */
    constructor(settings) {
        settings = settings || {}
        this.gates = []
        // peerbook gats are a map of fingerprints to gates
        this.PBGates = new Map()
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
        this.ws = null
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
                    `Using default conf as parsing the dotfile failed:<br>${err}`, 
                10))

        }
        this.loadConf(d)

        // buttons
        document.getElementById("trash-button")
                .addEventListener("click",
                    ev =>  {
                        if (this.activeG)
                            this.activeG.activeW.activeP.close()})
        document.getElementById("home-button")
                .addEventListener("click", ev => this.goHome())
        document.getElementById("log-button")
                .addEventListener("click", ev => this.logDisplay())
        document.getElementById("search-button")
                .addEventListener("click", ev => 
                   this.activeG && this.activeG.activeW.activeP.toggleSearch())
        document.getElementById("help-gate")
                .addEventListener("click", ev => this.toggleHelp())
        document.getElementById("help-button")
                .addEventListener("click", ev => this.toggleHelp())
        document.getElementById("refresh")
                .addEventListener("click", () => this.log("not refreshing peerbook:"))
        document.querySelectorAll("#help-copymode, #keys-help").forEach(e => 
                e.addEventListener("click", ev => this.clear()))
        document.getElementById("divide-h")
                .addEventListener("click", ev =>  {
                    if (this.activeG && this.activeG.activeW.activeP.sy >= 0.04)
                        this.activeG.activeW.activeP.split("rightleft", 0.5)})
        document.getElementById("divide-v")
                .addEventListener("click", ev =>  {
                    if (this.activeG && this.activeG.activeW.activeP.sx >= 0.04)
                        this.activeG.activeW.activeP.split("topbottom", 0.5)})
        let addHost = document.getElementById("add-host")
        document.getElementById('add-static-host').addEventListener(
            'click', async () => {
                this.logDisplay(false)
                if (addHost.classList.contains('hidden')) {
                    const fp = await this.getFingerprint(),
                        rc = `bash -c "$(curl -sL https://get.webexec.sh)"\necho "${fp}" >> ~/.config/webexec/authorized_fingerprints`
                    addHost.classList.remove("hidden")
                    const e = addHost.querySelector(".terminal-container")
                    const t = openFormsTerminal(e)
                    const f = new Form([
                        { prompt: "Name", validator: Gate.validateHostName },
                        { prompt: "Hostname" },
                        { prompt: "Username" },
                        { prompt: "Remember hostname", default: "y", values: ["y", "n"] },
                        {
                            prompt: `\x1Bc\n  To use WebRTC the server needs webexec:\n\n\x1B[1m${rc}\x1B[0m\n\n  Copy to clipboard?`,
                            validator: v => {
                                if (v == "y")
                                    Clipboard.write({ string: rc })
                                return ''
                            },
                            default: "y"
                        }
                    ])
                    f.start(t).then(results => {
                        const gate = this.addGate({
                            name: results[0], addr: results[1],
                            username: results[2],
                            store: results[3] == "y"
                        })
                        if (results[3] == "y")
                            this.storeGates()
                        this.clear()
                        if (this.netStatus && this.netStatus.connected)
                            gate.connect()
                    }).catch(() => this.clear())
                }
            })
        // hide the modal on xmark click
        addHost.querySelector(".close").addEventListener('click',  () =>  {
            this.clear()
        })
        // Handle network events for the indicator
        Network.addListener('networkStatusChange', s => 
            this.updateNetworkStatus(s))
        this.catchFingers()
        // setting up edit host events
        document.getElementById("edit-unverified-pbhost").addEventListener(
            "click", () => this.clear())
        let editHost = document.getElementById("edit-host")
        editHost.querySelector(".close").addEventListener('click',  () =>
            terminal7.clear())
        editHost.querySelector(".trash").addEventListener('click',  () => {
            editHost.gate.delete()
            terminal7.clear()
        })
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
        // setting up reset host event
        let resetHost = document.getElementById("reset-host")
        resetHost.querySelector("form").addEventListener('submit', ev => {
            ev.preventDefault()
            editHost.gate.restartServer()
        })
        resetHost.querySelector(".close").addEventListener('click',  ev =>
            ev.target.parentNode.parentNode.parentNode.classList.add("hidden"))
        // setting up reset cert events
        let resetCert = document.getElementById("reset-cert")
        resetCert.querySelector(".reset").addEventListener('click',  ev => {
            openDB("t7", 1).then(db => {
                let tx = db.transaction("certificates", "readwrite"),
                    store = tx.objectStore("certificates")
                store.clear().then(() => this.pbConnect())
            })
            ev.target.parentNode.parentNode.classList.add("hidden")

        })
        resetCert.querySelector(".close").addEventListener('click',  ev =>
            ev.target.parentNode.parentNode.parentNode.classList.add("hidden"))



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
        }
        if (Capacitor.isNativePlatform())  {
            App.addListener('appStateChange', state => {
                if (!state.isActive) {
                    // We're getting suspended. disengage.
                    this.notify("Benched")
                    this.disengage().then(() => this.clearTimeouts())
                } else {
                    // We're back! ensure we have the latest network status and 
                    // reconnect to the active gate
                    terminal7.log("☀️")
                    this.clearTimeouts()
                    Network.getStatus().then(s => this.updateNetworkStatus(s))
                }
            })
        }
        document.getElementById("log").addEventListener("click",
            () => this.logDisplay(false))

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
            ev => {
                document.getElementById("dotfile-button").classList.remove("on")
                this.clear()
            }
        )
        modal.querySelector(".save").addEventListener('click',
            ev => this.wqConf())
        modal.querySelector(".copy").addEventListener('click',
            ev => {
                var area = document.getElementById("edit-conf")
                this.confEditor.save()
                Clipboard.write({string: area.value})
                this.clear()
            })
        // peerbook button and modal
        modal = document.getElementById("peerbook-modal")
        modal.querySelector(".close").addEventListener('click',
            () => this.clear() )
        document.getElementById('add-peerbook').addEventListener(
            'click', () => {
                this.logDisplay(false)
                // modal.querySelector("form").reset()
                modal.classList.remove("hidden")
                this.peerbookForm()
            })
        Network.getStatus().then(s => {
            this.updateNetworkStatus(s)
            if (!s.connected) {
                this.goHome()
                return
            }
            this.restoreState().catch(() => {
                // no gate restored going home and on boarding
                this.goHome()
                if (!((window.matchMedia('(display-mode: standalone)').matches)
                    || (window.matchMedia('(display-mode: fullscreen)').matches)
                    || window.navigator.standalone
                    || (Capacitor.getPlatform() != "web")
                    || document.referrer.includes('android-app://')))
                    if (navigator.getInstalledRelatedApps) 
                        navigator.getInstalledRelatedApps().then(relatedApps => {
                            if (relatedApps.length == 0)
                                // case we're not in an app
                                this.showGreetings()
                            else
                                this.notify("PWA installed, better use it")
                        })
                    else
                       this.showGreetings()
                else {
                    this.onBoard()
                }
            })
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
                          fp = state.fp,
                          name = state.name
                    let gate

                    if (fp) {
                        gate = this.PBGates.get(fp)
                        if (!gate) {
                            gate = new Gate({fp: fp, name: name})
                            this.PBGates.set(fp, gate)
                            gate.open(this.e)
                        }
                    } else
                        gate = this.gates.find(gate => gate.name == name)

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
        var e   = document.getElementById("peerbook-modal").querySelector(".terminal-container"),
            dotfile = (await Storage.get({key: 'dotfile'})).value || DEFAULT_DOTFILE

        const t = openFormsTerminal(e)
        const f = new Form([
            {
                prompt: "email (will only be used to manage your peers)",
                validator: email => !email.match(/.+@.+\..+/) ? "Must be a valid email" : ''
            },
            { prompt: "Peer's name" }
        ])
        f.start(t).then(results => {
            const email = results[0],
                peername = results[1]

            dotfile += `
[peerbook]
email = "${email}"
peer_name = "${peername}"\n`

            Storage.set({ key: "dotfile", value: dotfile })
            this.loadConf(TOML.parse(dotfile))
            e.classList.add("hidden")
            this.notify("Your email was added to the dotfile")
            this.clear()
        }).catch(() => this.clear())
    }
    pbConnect() {
        return new Promise((resolve) => {
            if (!this.conf.peerbook.email || 
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
                this.pb.onUpdate = (peers) => this.onPBUpdate(peers)
                return this.pb.connect()
            })
        })
    }
    async toggleSettings(ev) {
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
    }
    catchFingers() {
        var start,
            last,
            firstPointer = null,
            gesture = null
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
    addGate(props) {
        let out = [],
            p = props || {},
            addr = p.addr,
            nameFound = false
        // add the id
        p.id = this.gates.length
        p.verified = false

        let g = new Gate(p)
        this.gates.push(g)
        g.open(this.e)
        return g
    }
    async storeGates() { 
        let out = []
        this.gates.forEach((h) => {
            if (h.store) {
                let ws = []
                h.windows.forEach((w) => ws.push(w.id))
                out.push({id: h.id, addr: h.addr, user: h.user, secret: h.secret,
                    name:h.name, windows: ws, store: true, verified: h.verified,
                    username:h.username})
            }
        })
        this.log("Storing gates:", out)
        await Storage.set({key: 'gates', value: JSON.stringify(out)})
    }
    clear() {
        this.e.querySelectorAll('.temporal').forEach(e => e.remove())
        this.e.querySelectorAll('.modal').forEach(e => {
            if (!e.classList.contains("non-clearable"))
                e.classList.add("hidden")
            const terminalContainer = e.querySelector(".terminal-container")
            if (terminalContainer)
                terminalContainer.innerHTML = ''
        })
        this.logDisplay(false)
        this.focus()
        this.longPressGate = null
    }
    goHome() {
        Storage.remove({key: "last_state"}) 
        let s = document.getElementById('home-button'),
            h = document.getElementById('home')
        s.classList.add('on')
        if (this.activeG) {
            this.activeG.e.classList.add("hidden")
            this.activeG = null
        }
        // hide the modals
        this.clear()
        document.querySelectorAll(".pane-buttons").forEach(
            e => e.classList.add("off"))
        window.location.href = "#home"
    }
    /* 
     * Terminal7.logDisplay display or hides the notifications.
     * if the parameters in udefined the function toggles the displays
     */
    logDisplay(show) {
        let e = document.getElementById("log")
        if (show === undefined)
            // if show is undefined toggle current state
            show = !e.classList.contains("show")
        if (show) {
            e.classList.add("show")
            document.getElementById("log-button")
                .classList.add("on")
        } else {
            e.classList.remove("show")
            document.getElementById("log-button")
                .classList.remove("on")
        }
        this.focus()
    }
    /*
     * onDisconnect is called when a gate disconnects.
     */
    onDisconnect(gate) {
        if (!this.netStatus.connected || 
            ((this.activeG != null) && (gate != this.activeG)))
            return
        let e = document.getElementById("disconnect-template")
        e = e.content.cloneNode(true)
        this.clear()
        // clear pending messages to let the user start fresh
        this.pendingCDCMsgs = []
        e.querySelector("h1").textContent =
            `${gate.name} communication failure`
        e.querySelector("form").addEventListener('submit', ev => {
            ev.target.closest(".modal").remove()
            gate.clear()
            gate.session = null
            gate.connect()
            ev.stopPropagation()
            ev.preventDefault()
        })
        e.querySelector(".close").addEventListener('click', ev => {
            ev.target.closest(".modal").remove()
            gate.clear()
            this.goHome()
        })
        this.e.appendChild(e)
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
    onNoSignal(gate, error) {
        let e = document.getElementById("nosignal-template")
        e = e.content.cloneNode(true)
        this.clear()
        // clear pending messages to let the user start fresh
        this.pendingCDCMsgs = []
        e.querySelectorAll(".name").forEach(e => e.textContent = gate.name)
        e.querySelectorAll(".address").forEach(e => e.textContent = gate.addr)
        e.querySelector(".edit-link").addEventListener('click', () => {
            this.clear()
            gate.edit()
        })
        e.querySelector(".close").addEventListener('click', ev => {
            if (gate) {
                gate.disengage()
                gate.clear()
            }
            this.goHome()
        })
        e.querySelector(".reconnect").addEventListener('click', ev => {
            gate.reset()
        })
        e.querySelector(".server-error").innerHTML = error.message
        this.e.appendChild(e)
    }
    /*
     * noitify adds a message to the teminal7 notice board
     */
    notify(message) {    
        let ul = document.getElementById("log-msgs"),
            li = document.createElement("li"),
            d = new Date(),
            t = formatDate(d, "HH:mm:ss.fff")

        let lines = ul.querySelectorAll('li')
        li.innerHTML = `<time>${t}</time><p>${message}</p>`
        li.classList = "log-msg"
        ul.appendChild(li)
        this.logDisplay(true)
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
        return new Promise((resolve, reject) => {
            var count = 0
            this.gates.forEach(g => {
                if (g.boarding) {
                    count++
                    g.disengage().then(() => {
                        g.boarding = false
                        count--
                    })
                }
            })
            if (this.PBGates.size > 0)
                this.PBGates.forEach((fp, g) => {
                    if (g.boarding) {
                        count++
                        g.disengage().then(() => {
                            g.boarding = false
                            count--
                        })
                    }
                })
            if (this.ws != null) {
                this.ws.onopen = undefined
                this.ws.onmessage = undefined
                this.ws.onerror = undefined
                this.ws.onclose = undefined
                this.ws.close()
                this.ws = null
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
            if (gate)
                gate.connect()
        } else {
            off.remove("hidden")
            this.gates.forEach(g => g.session = null)
        }
    }
    loadConf(conf) {
        this.conf = conf
        this.conf.exec.shell = this.conf.exec.shell || "*"
        this.conf.ui = this.conf.ui || {}
        this.conf.ui.quickest_press = this.conf.ui.quickest_press || 1000
        this.conf.ui.max_tabs = this.conf.ui.max_tabs || 3
        this.conf.ui.leader = this.conf.ui.leader || "a"
        this.conf.ui.cutMinSpeed = this.conf.ui.cut_min_speed || 2.2
        this.conf.ui.cutMinDistance = this.conf.ui.cut_min_distance || 50
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
        this.conf.net.httpTimeout = this.conf.net.http_timeout || 1000
        this.conf.net.retries = this.conf.net.retries || 3
        var apb = document.getElementById("add-peerbook"),
            rpb = document.getElementById("refresh")
        if (!this.conf.peerbook) {
            apb.style.removeProperty("display")
            rpb.style.display = "none"
            this.conf.peerbook = {}
        } else {
            rpb.style.removeProperty("display")
            apb.style.display = "none"
        }
        if (!this.conf.peerbook.peer_name)
            this.conf.peerbook.peer_name = "John Doe"
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
    log (...args) {
        var line = ""
        args.forEach(a => line += JSON.stringify(a) + " ")
        console.log(line)
        this.logBuffer.push(line)
    }
    async dumpLog() {
        var data = "",
            suffix = new Date().toISOString().replace(/[^0-9]/g,""),
            path = `terminal7_${suffix}.log`
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
    onPointerCancel(ev) {
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
        let e = ev.target
        /*
        if ((ev.pointerType == "mouse") && (ev.pressure == 0))
            return
            */
        this.pointer0 = Date.now() 
        this.firstPointer = {pageX: ev.pageX, pageY: ev.pageY}
        if (e.gate) {
            if (!this.longPressGate)
                this.longPressGate = this.run(ev => {
                    e.gate.edit()
                }, this.conf.ui.quickest_press)
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
    onPointerUp(ev) {
        let e = ev.target,
            hosts = e.closest(".hosts button")

        if (!this.pointer0)
            return
        if (hosts) {
            let deltaT = Date.now() - this.pointer0
            clearTimeout(this.longPressGate)
            this.longPressGate = null
            if (deltaT > this.conf.ui.quickest_press) {
                ev.stopPropagation()
                ev.preventDefault()
            } else {
                // that's for the refresh and static host add
                if (!e.gate)
                    return
                if (!e.gate.fp || e.gate.verified && e.gate.online)
                    e.gate.connect()
                else
                    e.gate.edit()
            }
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
        }        this.pointer0 = null
        this.firstPointer = null
        this.gesture = null
    }
    showGreetings() {
        let modal = document.getElementById("greetings-modal")
            
        modal.querySelector(".play-button").addEventListener('click', () => {
            this.clear()
            this.onBoard()
        })
        document.getElementById("install-button").addEventListener('click', ev => {
            if (window.installPrompt !== undefined) {
                window.installPrompt.prompt()
                window.installPrompt.userChoice.then(outcome => {
                    if (outcome) {
                        this.clear()
                        this.onBoard()
                    }
                })
            } else {
                let m = document.getElementById('manual-install')
                modal.classList.add('hidden')
                m.classList.remove('hidden')
                m.querySelector(".close").addEventListener('click', () => this.clear())
            }
            ev.preventDefault()
            ev.stopPropagation()
        })
        modal.classList.remove("hidden")
    }
    onBoard() {
        var a = localStorage.getItem("onboard")
        if ((a !== null) || (Capacitor.getPlatform() != "web"))
            return
        var modal = document.getElementById("onboarding")
        modal.classList.remove("hidden")
        modal.querySelector(".onmobile").addEventListener('click', ev => {
            localStorage.setItem("onboard", "yep")
            modal = document.getElementById("mobile-instructions")
            modal.classList.remove("hidden")
            modal.querySelector(".close").addEventListener('click', () =>
                this.clear())
            modal.querySelector(".copy").addEventListener('click', ev => {
                this.clear()
                Clipboard.write({string: 'bash -c "$(curl -sL https://get.webexec.sh)"'})
                this.notify("Command copied to the clipboard")
                ev.stopPropagation()
                ev.preventDefault()
            })
        })
        modal.querySelector(".ongpos").addEventListener('click', ev => {
            localStorage.setItem("onboard", "yep")
            var gate = this.addGate({
                addr: "localhost",
                name: "localhost",
                online: true,
                store: true
            })
            this.storeGates()
            modal = document.getElementById("localhost-instructions")
            modal.classList.remove("hidden")
            modal.querySelector(".close").addEventListener('click', () =>
                this.clear())
            modal.querySelector(".copy").addEventListener('click', ev => {
                this.notify("Command copied to the clipboard")
                Clipboard.write({string: 'bash -c "$(curl -sL https://get.webexec.sh)"'})
                ev.stopPropagation()
                ev.preventDefault()
            })
            modal.querySelector(".connect").addEventListener('click', ev => {
                this.clear()
                gate.connect()
                ev.stopPropagation()
                ev.preventDefault()
            })
        })
    }
    onPBUpdate(peers) {
        peers.forEach(p => {
            var g = this.PBGates.get(p.fp)
            if (g != undefined) {
                g.online = p.online
                g.name = p.name
                g.verified = p.verified
                g.updateNameE()
            } else if (p.kind == "webexec") {
                let g = new Gate(p)
                this.PBGates.set(p.fp, g)
                g.open(this.e)
            }
        })
    }
}
