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
import * as TOML from '@iarna/toml'
import { imageMapResizer } from './imageMapResizer.js'
import CodeMirror from 'codemirror/src/codemirror.js'
import { vimMode } from 'codemirror/keymap/vim.js'
import { tomlMode} from 'codemirror/mode/toml/toml.js'
import { dialogAddOn } from 'codemirror/addon/dialog/dialog.js'
import { formatDate } from './utils.js'
import { openDB } from 'idb'

import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Clipboard } from '@capacitor/clipboard'
import { Network } from '@capacitor/network'
import { Storage } from '@capacitor/storage'
import { Device } from '@capacitor/device'


var PBPending = []

const DEFAULT_DOTFILE = `[theme]
foreground = "#00FAFA"
background = "#000"
selection = "#D9F505"

[indicators]
flash = 100

[exec]
shell = "bash"

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
        this.pbSendTask = null
        this.logBuffer = CyclicArray(settings.logLines || 101)
        this.zoomedE = null
        this.pendingPanes = {}
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
            terminal7.run(_ =>
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
                .addEventListener("click", ev => this.pbVerify())
        document.querySelectorAll("#help-copymode, #keys-help").forEach(e => 
                e.addEventListener("click", ev => this.clear()))
        document.getElementById("divide-h")
                .addEventListener("click", ev =>  {
                    if (this.activeG)
                        this.activeG.activeW.activeP.split("rightleft", 0.5)})
        document.getElementById("divide-v")
                .addEventListener("click", ev =>  {
                    if (this.activeG)
                        this.activeG.activeW.activeP.split("topbottom", 0.5)})
        let addHost = document.getElementById("add-host")
        document.getElementById('add-static-host').addEventListener(
            'click', ev => {
                this.logDisplay(false)
                addHost.querySelector("form").reset()
                addHost.classList.remove("hidden")
            })
        addHost.querySelector("form").addEventListener('submit', (ev) => {
            ev.preventDefault()
            let remember = addHost.querySelector('[name="remember"]').checked,
                gate = this.addGate({
                    addr: addHost.querySelector('[name="hostaddr"]').value,
                    name: addHost.querySelector('[name="hostname"]').value,
                    store: remember
                })
            if (remember)
                this.storeGates()
            if (typeof gate == "string")
                this.notify(gate)
            else {
                this.clear()
                if (this.netStatus && this.netStatus.connected)
                    gate.connect()
            }
        })
        // hide the modal on xmark click
        addHost.querySelector(".close").addEventListener('click',  _ =>  {
            this.clear()
        })
        // Handle network events for the indicator
        Network.getStatus().then(s => this.updateNetworkStatus(s))
        Network.addListener('networkStatusChange', s => 
            this.updateNetworkStatus(s))
        this.catchFingers()
        // setting up edit host events
        document.getElementById("edit-unverified-pbhost").addEventListener(
            "click", _ => this.clear())
        let editHost = document.getElementById("edit-host")
        editHost.querySelector("form").addEventListener('submit', ev => {
            ev.preventDefault()
            editHost.gate.editSubmit(ev)
        })
        editHost.querySelector(".close").addEventListener('click',  _ =>
            terminal7.clear())
        editHost.querySelector(".trash").addEventListener('click',  _ => {
            editHost.gate.delete()
            terminal7.clear()
        })
        editHost.querySelector(".reset").addEventListener('click',  ev => {
            this.clear()
            editHost.gate.showResetHost(ev)
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
                store.clear().then(() => this.pbVerify())
            })
            ev.target.parentNode.parentNode.classList.add("hidden")

        })
        resetCert.querySelector(".close").addEventListener('click',  ev =>
            ev.target.parentNode.parentNode.parentNode.classList.add("hidden"))



        document.addEventListener("keydown", ev => {
            if (ev.key == "Meta") {
                this.metaPressStart = Date.now()
                this.run(_ => this.showKeyHelp(), terminal7.conf.ui.quickest_press)
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
                    terminal7.log("Active ☀️")
                    this.clearTimeouts()
                    Network.getStatus().then(s => this.updateNetworkStatus(state))
                }
            })
        }
        document.getElementById("log").addEventListener("click",
            _ => this.logDisplay(false))

        // settings button and modal
        var modal   = document.getElementById("settings-modal")
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
            ev => this.clear() )
        modal.querySelector(".save").addEventListener('click',
            ev => {
                this.setPeerbook()
                this.clear()
            })
        document.getElementById('add-peerbook').addEventListener(
            'click', ev => {
                this.logDisplay(false)
                // modal.querySelector("form").reset()
                document.getElementById("peerbook-modal").classList.remove("hidden")
            })
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
    }
    restoreState() {
        return new Promise((resolve, reject) => {
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
    async setPeerbook() {
        var e   = document.getElementById("peerbook-modal"),
            dotfile = (await Storage.get({key: 'dotfile'})).value || DEFAULT_DOTFILE,
            email = e.querySelector('[name="email"]').value,
            peername = e.querySelector('[name="peername"]').value
        if (email == "")
            return
        dotfile += `
[peerbook]
email = "${email}"
peer_name = "${peername}"\n`

        Storage.set({key: "dotfile", value: dotfile})
        this.loadConf(TOML.parse(dotfile))
        e.classList.add("hidden")
        this.notify("Your email was added to the dotfile")
    }
    pbVerify() {
        return new Promise((resolve, reject) => {
           var email = this.conf.peerbook.email,
                insecure = this.conf.peerbook.insecure,
                host = this.conf.net.peerbook

            if ((typeof host != "string") || (typeof email != "string") || (email == "")) {
                resolve()
                return
            }
            this.notify("\uD83D\uDCD6 Refreshing")

            this.getFingerprint().then(fp => {
                const schema = insecure?"http":"https",
                      url = `${schema}://${host}/verify`
                console.log("fetching from " + url)
                fetch(url,  {
                    headers: {"Content-Type": "application/json"},
                    method: 'POST',
                    body: JSON.stringify({kind: "terminal7",
                        name: this.conf.peerbook.peer_name,
                        email: email,
                        fp: fp
                    })
                }).then(async response => {
                    console.log("got response", response.status)
                    if (response.ok)
                        return response.json()
                    if (response.status == 409) {
                        var e = document.getElementById("reset-cert"),
                            pbe = document.getElementById("reset-cert-error")
                        pbe.innerHTML = response.data 
                        e.classList.remove("hidden")
                    }
                    response.body.getReader().read().then(({done, value}) => {
                        this.notify(
                            "&#x1F4D6;&nbsp;"+String.fromCharCode(...value))
                    })
                    reject(new Error(`verification failed`))
                }).then(m => {
                    this.onPBMessage(m)
                    resolve()

                }).catch(e => { reject(e) })
            }).catch(e => console.log("Failed to get FP" + e))
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
        this.pbVerify()

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

        // if no port specify, use the default port
        if (addr && (addr.indexOf(":") == -1))
            p.addr = `${addr}:7777`

        this.gates.forEach(i => {
            if (props.name == i.name) {
                i.online = props.online
                nameFound = true
            }
        })
        if (nameFound) {
            return "Gate name is not unique"
        }

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
                    name:h.name, windows: ws, store: true, verified: h.verified})
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
        })
        this.logDisplay(false)
        this.focus()
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
        if (!terminal7.netStatus.connected || (gate != this.activeG))
            return
        let e = document.getElementById("disconnect-template")
        e = e.content.cloneNode(true)
        this.clear()
        // clear pending messages to let the user start fresh
        this.pendingCDCMsgs = []
        e.querySelector("h1").textContent =
            `${gate.name} communication failure`
        e.querySelector("form").addEventListener('submit', ev => {
            this.clear()
            gate.boarding = false
            gate.connect()
        })
        e.querySelector(".close").addEventListener('click', ev => {
            gate.clear()
            terminal7.goHome()
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
    ssh(e, gate, cmd, cb) {
        let uname = e.querySelector('[name="uname"]').value,
            pass = e.querySelector('[name="pass"]').value,
            addr = gate.addr.substr(0, gate.addr.indexOf(":"))
        this.notify("ssh is connecting...")
        window.cordova.plugins.sshConnect.connect(uname, pass, addr, 22,
            resp => {
                this.notify("ssh connected")
                if (resp) {
                    // TODO: make it work with non-standrad webexec locations
                    window.cordova.plugins.sshConnect.executeCommand(
                        cmd, 
                        msg =>  {
                            this.notify("ssh executed command success")
                            if (typeof cb === "function")
                                cb(msg)
                        },
                        msg => this.notify(`ssh failed: ${msg}`))
                    window.cordova.plugins.sshConnect.disconnect()
                }
            }, ev => {
                if (ev == "Connection failed. Could not connect")
                    if (gate.verified)
                        this.notify(ev)
                    else
                        this.notify(`Failed the connect. Maybe ${gate.addr} is wrong`)
                else
                    this.notify("Wrong password")
                this.log("ssh failed to connect", ev)
            })
    }
    onNoSignal(gate, error) {
        let e = document.getElementById("nosignal-template")
        e = e.content.cloneNode(true)
        this.clear()
        // clear pending messages to let the user start fresh
        this.pendingCDCMsgs = []
        e.querySelectorAll(".name").forEach(e => e.textContent = gate.name)
        e.querySelectorAll(".address").forEach(e => e.textContent = gate.addr)
        e.querySelector(".edit-link").addEventListener('click', _ => {
            this.clear()
            gate.edit()
        })
        e.querySelector(".close").addEventListener('click', ev => {
            if (gate) {
                gate.disengage()
                gate.clear()
            }
            terminal7.goHome()
        })
        e.querySelector(".reconnect").addEventListener('click', ev => {
            this.clear()
            gate.clear()
            gate.connect()
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
        if (status.connected || (status.connected === undefined)) {
            off.add("hidden")
            if (this.activeG) {
                this.activeG.connect()
                this.activeG.focus()
            }
            else 
                this.pbVerify()
        } else {
            off.remove("hidden")
            this.gates.forEach(g => g.stopBoarding())
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
    pbSend(m) {
        // null message are used to trigger connection, ignore them
        if (m != null) {
            if (this.ws != null && this.ws.readyState == WebSocket.OPEN) {
                this.log("sending to pb:", m)
                this.ws.send(JSON.stringify(m))
                return
            }
            PBPending.push(m)
        }
        this.wsConnect()
    }
    wsConnect() {
        var email = this.conf.peerbook.email
        if ((this.ws != null) || ( typeof email != "string")) return
        this.getFingerprint().then(fp => {
            const host = this.conf.net.peerbook,
                  name = this.conf.peerbook.peer_name,
                  insecure = this.conf.peerbook.insecure,
                  schema = insecure?"ws":"wss",
                  url = encodeURI(`${schema}://${host}/ws?fp=${fp}&name=${name}&kind=terminal7&email=${email}`),
                  ws = new WebSocket(url)
            this.ws = ws
            ws.onmessage = ev => {
                var m = JSON.parse(ev.data)
                this.log("got ws message", m)
                this.onPBMessage(m)
            }
            ws.onerror = ev => {
                // TODO: Add some info avour the error
                this.notify("\uD83D\uDCD6 WebSocket Error")
            }
            ws.onclose = ev => {
                ws.onclose = undefined
                ws.onerror = undefined
                ws.onmessage = undefined
                this.ws = null

            }
            ws.onopen = ev => {
                this.log("on open ws", ev)
                if (this.pbSendTask == null)
                    this.pbSendTask = this.run(_ => {
                        PBPending.forEach(m => {
                            this.log("sending ", m)
                            this.ws.send(JSON.stringify(m))})
                        this.pbSendTask = null
                        PBPending = []
                    }, 10)
            }
        })
    }
    onPBMessage(m) {
        if (m["code"] !== undefined) {
            this.notify(`\uD83D\uDCD6 ${m["text"]}`)
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
        var g = this.PBGates.get(m.source_fp)
        if (typeof g != "object") {
            this.log("received bad gate", m)
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
        if (m.peer_update !== undefined) {
            g.online = m.peer_update.online
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
        this.longPressGate = null
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
                        ? y / document.body.offsetHeight
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
            
        modal.querySelector(".play-button").addEventListener('click', _ => {
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
                m.querySelector(".close").addEventListener('click', _ => this.clear())
            }
            ev.preventDefault()
            ev.stopPropagation()
        })
        modal.classList.remove("hidden")
    }
    onBoard() {
        var a = localStorage.getItem("onboard")
        if (a !== null)
            return
        var modal = document.getElementById("onboarding")
        modal.classList.remove("hidden")
        modal.querySelector(".onmobile").addEventListener('click', ev => {
            localStorage.setItem("onboard", "yep")
            modal = document.getElementById("mobile-instructions")
            modal.classList.remove("hidden")
            modal.querySelector(".close").addEventListener('click', _ =>
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
                addr: "localhost:7777",
                name: "localhost",
                online: true,
                store: true
            })
            this.storeGates()
            modal = document.getElementById("localhost-instructions")
            modal.classList.remove("hidden")
            modal.querySelector(".close").addEventListener('click', _ =>
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
    syncPBPeers(peers) {
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
