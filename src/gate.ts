/* Terminal 8 Gate
 *  This file contains the code that makes a terminal 7 gate. The gate class
 *  represents a server and it may be boarding - aka connected - or not.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { Clipboard } from '@capacitor/clipboard'
import { Storage } from '@capacitor/storage'

import { Pane } from './pane.js'
import { Failure, Session } from './session'
import { SSHSession } from './ssh_session'
import { Terminal7 } from './terminal7'

import { Storage } from '@capacitor/storage'
import { Form, openFormsTerminal, Fields } from './form.js'
import { HTTPWebRTCSession, PeerbookSession } from './webrtc_session'
import { Window } from './window.js'
import { Terminal } from 'xterm'


const FAILED_COLOR = "red"// ashort period of time, in milli
/*
 * The gate class abstracts a host connection
 */
export class Gate {
    activeW: Window
    addr: string
    boarding: boolean
    e: Element
    id: string
    marker: number
    name: string
    pass: string | undefined
    secret: string
    session: Session
    tryWebexec: boolean
    user: string
    username: string
    nameE: Element
    t7: Terminal7
    onConnected: any
    fp: string | undefined

    constructor (props) {
        // given properties
        this.id = props.id
        // this shortcut allows cells to split without knowing t7
        this.addr = props.addr
        this.user = props.user
        this.secret = props.secret
        this.store = props.store
        this.name = (!props.name)?`${this.user}@${this.addr}`:props.name
        this.username = props.username
        this.pass = props.pass
        this.tryWebexec = props.tryWebexec || true
        this.online = props.online
        this.verified = props.verified || false
        // 
        this.windows = []
        this.boarding = false
        this.lastMsgId = 0
        // a mapping of refrence number to function called on received ack
        this.breadcrumbs = []
        this.sendStateTask  = null
        this.timeoutID = null
        this.fp = props.fp
        this.t7 = window.terminal7
        this.session = null
    }

    /*
     * Gate.open opens a gate element on the given element
     */
    open(e) {
        // create the gate element - holding the tabs, windows and tab bar
        this.e = document.createElement('div')
        this.e.className = "gate hidden"
        this.e.style.zIndex = 2
        this.e.id = `gate-${this.id}`
        e.appendChild(this.e)
        // add the tab bar
        let t = document.getElementById("gate-template")
        if (t) {
            t = t.content.cloneNode(true)
            t.querySelector(".reset").addEventListener('click', () => 
                this.reset())
            t.querySelector(".add-tab").addEventListener(
                'click', _ => this.newTab())
            t.querySelector(".search-close").addEventListener('click', _ =>  {
                this.t7.logDisplay(false)
                this.activeW.activeP.exitSearch()
                this.activeW.activeP.focus()
            })
            t.querySelector(".search-up").addEventListener('click', _ =>
                this.activeW.activeP.findPrev())

            t.querySelector(".search-down").addEventListener('click', _ => 
                this.activeW.activeP.findNext())

            t.querySelector(".rename-close").addEventListener('click', () => 
                this.e.querySelector(".rename-box").classList.add("hidden"))
            /* TODO: handle the bang
            let b = t.querySelector(".bang")
            b.addEventListener('click', (e) => {new window from active pane})
            */
            this.e.appendChild(t)
        }
    }
        // Add the gates' signs to the home page
    addToMap() {
        const d = document.createElement('div')
        const b = document.createElement('button')
        d.className = "gate-pad"
        b.className = "text-button"
        d.gate = this
        b.gate = this
        b.innerHTML = this.name || this.addr
        this.nameE = d
        d.appendChild(b)
        this.updateNameE()
        return d
    }
    delete() {
        this.t7.gates.delete(this.id)
        this.t7.storeGates()
        // remove the host from the home screen
        if (this.nameE)
            this.nameE.remove()
    }
    /*
     * edit start the edit-host user-assitance
     */
    edit() {
        var editHost
        if (typeof(this.fp) == "string") {
            if (this.verified) {
                this.notify("Got peer from \uD83D\uDCD6, connect only")
                return
            }
            editHost = document.getElementById("edit-unverified-pbhost")
            editHost.querySelector("a").setAttribute("href",
                "https://"+ this.t7.conf.net.peerbook)
        } else {
            editHost = document.getElementById("edit-host")
            if (Form.activeForm) 
                this.t7.logTerminal.focus()
            else {
                this.t7.logDisplay(true)
                const f1 = new Form([
                    { prompt: "Connect" },
                    { prompt: "Edit" },
                    { prompt: "\x1B[31mDelete\x1B[0m" },
                ])
                const f2 = new Form([
                    {
                        prompt: "Name",
                        default: this.name,
                        validator: (a) => this.t7.validateHostName(a)
                    },
                    { 
                        prompt: "Hostname",
                        default: this.addr,
                        validator: (a) => this.t7.validateHostAddress(a)
                    },
                    { prompt: "Username", default: this.username }
                ])
                const fDel = new Form([{
                    prompt: `Delete ${this.name}?`,
                    values: ["y", "n"],
                    default: "n",
                }])
                f1.menu(this.t7.logTerminal, `\x1B[4m${this.name}\x1B[0m`)
                    .then(choice => {
                        switch (choice) {
                            case 'Connect':
                                this.connect()
                                break
                            case 'Edit':
                                f2.chooseFields(this.t7.logTerminal, `\x1B[4m${this.name}\x1B[0m edit`).then((enabled) => {
                                    if (!enabled) {
                                        this.t7.clear()
                                        return
                                    }
                                    f2.start(this.t7.logTerminal).then(results => {
                                        ['name', 'addr', 'username']
                                            .filter((_, i) => enabled[i])
                                            .forEach((k, i) => this[k] = results[i])
                                        if (enabled[1]) {
                                            this.t7.gates.delete(this.id)
                                            this.id = this.addr
                                            this.t7.gates.set(this.id, this)
                                        }
                                        this.t7.storeGates()
                                        this.t7.refreshMap()
                                        this.nameE.querySelector("button").innerHTML = this.name
                                        this.t7.clear()
                                    }).catch(() => this.t7.clear())
                                }).catch(() => this.t7.clear())
                                break
                            case "\x1B[31mDelete\x1B[0m":
                                fDel.start(this.t7.logTerminal).then(res => {
                                    if (res[0] == "y")
                                        this.delete()
                                    this.t7.clear()
                                })
                                break
                        }
                    })
            }
        }
        // editHost.gate = this
        // editHost.classList.remove("hidden")
    }
    focus() {
        this.t7.logDisplay(false)
        // hide the current focused gate
        document.getElementById("map-button").classList.remove("off")
        document.querySelectorAll(".pane-buttons").forEach(
            e => e.classList.remove("off"))
        let activeG = this.t7.activeG
        if (activeG) {
            activeG.e.classList.add("hidden")
        }
        this.t7.activeG = this
        this.e.classList.remove("hidden")
        this.e.querySelectorAll(".window")
              .forEach(w => w.classList.add("hidden"))
        this.activeW.focus()
        this.storeState()
    }
    // stops all communication 
    stopBoarding() {
        this.boarding = false
    }
    setIndicatorColor(color) {
            this.e.querySelector(".tabbar-names").style.setProperty(
                "--indicator-color", color)
    }
    /*
     * onSessionState(state) is called when the connection
     * state changes.
     */
    onSessionState(state: string, failure: Failure) {
        if (!this.session) {
            this.t7.log(`Ignoring ${this.name} change state to ${state} as session is closed`)
            return
        }
        this.t7.log(`updating ${this.name} state to ${state}`)
        if (state == "connected") {
            this.notify("Connected")
            this.setIndicatorColor("unset")
            var m = this.t7.e.querySelector(".disconnect")
            if (m != null)
                m.remove()
            // show help for first timer
            Storage.get({key: "first_gate"}).then(v => {
                if (v.value != "1") {
                    this.t7.run(this.t7.toggleHelp, 1000)
                    Storage.set({key: "first_gate", value: "1"}) 
                }
            })
            if (this.onConnected)
                this.onConnected()
                this.onConnected = this.load
        } else if (state == "disconnected") {
            // TODO: add warn class
            this.lastDisconnect = Date.now()
            // TODO: start the rain
            this.setIndicatorColor(FAILED_COLOR)
        } else if (state == "failed")  {
            this.handleFailure(failure)
        }
    }
    // handle connection failures
    handleFailure(failure: Failure) {
        this.t7.log(failure)

        this.session = null

        if (!this.boarding)
            return
        if (failure == Failure.WrongPassword) {
            this.t7.logTerminal.write("  Wrong password")
            const retryForm = new Form([{
                prompt: "Retry connection?",
                default: "y"
            }])
            retryForm.start(this.t7.logTerminal).then(res => {
                if (res[0] == "y") {
                    this.CLIConnect()
                } else {
                    this.t7.clear()
                    this.delete()
                }
            }).catch(() => {
                this.t7.clear()
                this.delete()
            })
            return
        }
        if (failure == Failure.Unauthorized) {
            this.copyFingerprint()
            return
        }
        if (failure == Failure.BadMarker) {
            this.notify("Session restore failed, trying a fresh session")
            this.clear()
            this.connect(this.onConnected)
            return
        }
        if (failure == Failure.TimedOut) {
            if ((!this.fp) && this.tryWebexec) {
                this.t7.logTerminal.writeln("  Timed out\n  Trying SSH...")
                this.tryWebexec = false
                this.connect(this.onConnected)
                return
            }
        }
        if (failure == Failure.BadRemoteDescription) {
            this.notify("Session signalling failed, please try again")
        }
        if (failure == Failure.NotImplemented)
            this.notify("FAILED: not implemented yet")
        if (!failure)
            this.notify("Connection FAILED")
        if (this.name.startsWith("temp")) {
            (async () => {
                const rc = `bash -c "$(curl -sL https://get.webexec.sh)"\necho "${this.fp}" >> ~/.config/webexec/authorized_fingerprints`
                this.t7.logTerminal.writeln("  Failed to connect")
                let ans
                const verifyForm = new Form([{
                    prompt: `Does the address \x1B[1;37m${this.addr}\x1B[0m seem correct?`,
                    values: ["y", "n"],
                    default: "y"
                }])
                try {
                    ans = (await verifyForm.start(this.t7.logTerminal))[0]
                } catch (e) {
                    this.t7.clear()
                    this.delete()
                }
                if (!ans) {
                    this.t7.logTerminal.writeln("ESC")
                    return
                }
                if (ans == "n")
                    return this.t7.connect()
                const webexecForm = new Form([{
                    prompt: `Make sure webexec is running on ${this.addr}:
                        \n\x1B[1m${rc}\x1B[0m\n \n  Copy to clipboard?`,
                    default: "y"
                }])
                try {
                    ans = (await webexecForm.start(this.t7.logTerminal))[0]
                } catch (e) {
                    this.t7.clear()
                    this.delete()
                }
                if (ans == "y")
                    Clipboard.write({ string: rc })
                const retryForm = new Form([{
                    prompt: "Retry connection?",
                    default: "y"
                }])
                try {
                    ans = (await retryForm.start(this.t7.logTerminal))[0]
                } catch (e) {
                    this.t7.clear()
                    this.delete()
                }
                if (ans == "y") {
                    this.t7.logTerminal.writeln("\n  Retrying...")
                    this.CLIConnect()
                }
                else {
                    this.t7.clear()
                    this.delete()
                }
            })()
        } else
            this.t7.onDisconnect(this)
    }
    /*
     * connect connects to the gate
     */
    async connect(onConnected = () => this.load()) {
        
        this.onConnected = onConnected
        // do nothing when the network is down
        if (!this.t7.netStatus || !this.t7.netStatus.connected)
            return
        document.title = `Terminal 7: ${this.name}`
        // if we're already boarding, just focus
        if (this.session) {
            // TODO: check session's status
            this.t7.log("already connected")
            if (!this.windows || (this.windows.length == 0))
                this.activeW = this.addWindow("", true)
            this.focus()
            return
        }
        this.boarding = true
        // TODO add the port
        if (!this.pass && !this.fp && !this.tryWebexec) {
            const canary = new SSHSession(this.addr)
            canary.onStateChange = (state, failure) => {
                if (failure == Failure.NotImplemented) {
                    this.t7.logTerminal.writeln("  Unavailable")
                    this.completeConnect()
                } else {
                    this.t7.logTerminal.writeln("  SSH implemented, connecting...")
                    this.askPass()
                } 
            }
            canary.connect()
        } else
            this.completeConnect()
    }

    notify(message) {
        if (!this.name.startsWith("temp"))
            message = `\x1B[4m${this.name}\x1B[0m: ${message}`
        this.t7.notify(message)
    }
    /*
     * returns an array of panes
     */
    panes() {
        var r = []
        this.t7.cells.forEach(c => {
            if (c instanceof Pane && (c.gate == this))
                r.push(c)
        })
        return r
    }
    // reset reset's a gate connection by disengaging and reconnecting
    reset() {
        this.disengage().then(() => {
            this.t7.run(() =>  {
                this.connect()
            }, 100)
        }).catch(() => this.connect())
                
    }
    async loseState () {
        const fp = await this.t7.getFingerprint(),
              rc = `bash -c "$(curl -sL https://get.webexec.sh)"
echo "${fp}" >> ~/.config/webexec/authorized_fingerprints
`
        let e = document.getElementById("lose-state-template")
        e = e.content.cloneNode(true)

        e.querySelector("pre").innerText = rc
        e.querySelector(".continue").addEventListener('click', evt => {
            this.t7.e.querySelector('.lose-state').remove()
            this.clear()
            this.activeW = this.addWindow("", true)
            this.focus()
        })
        e.querySelector(".copy").addEventListener('click', evt => {
            this.t7.e.querySelector('.lose-state').remove()
            Clipboard.write( {string: rc })
            this.tryWebexec = true
            this.clear()
            this.activeW = this.addWindow("", true)
            this.focus()
        })
        e.querySelector(".close").addEventListener('click', evt => {
            this.t7.e.querySelector('.lose-state').remove()
            this.clear()
            this.t7.goHome()
        })
        this.t7.e.appendChild(e)
    }
    setLayout(state: object) {
        const winLen = this.windows.length
        // got an empty state
        if ((state == null) || !(state.windows instanceof Array) || (state.windows.length == 0)) {
            // create the first window and pane
            this.t7.log("Fresh state, creating the first pane")
                this.activeW = this.addWindow("", true)
        } else if (winLen > 0) {
            // TODO: validate the current layout is like the state
            this.t7.log("Restoring with marker, opening channel")
            this.panes().forEach(p => {
                if (p.d)
                    p.openChannel({id: p.d.id})
            })
        } else {
            this.t7.log("Setting layout: ", state)
            this.clear()
            state.windows.forEach(w =>  {
                let win = this.addWindow(w.name)
                if (w.active) 
                    this.activeW = win
                win.restoreLayout(w.layout)
                win.nameE?.setAttribute("href", `#pane-${win.activeP?.id}`)
            })
        }

        if (!this.activeW)
            this.activeW = this.windows[0]
        this.focus()
    }
    /*
     * Adds a window, opens it and returns it
     */
    addWindow(name, createPane) {
        this.t7.log(`adding Window: ${name}`)
        let id = this.windows.length
        let w = new Window({name:name, gate: this, id: id})
        this.windows.push(w)
        if (this.windows.length >= this.t7.conf.ui.max_tabs)
            this.e.querySelector(".add-tab").classList.add("off")
        w.open(this.e.querySelector(".windows-container"))
        if (createPane) {
            let paneProps = {sx: 1.0, sy: 1.0,
                             xoff: 0, yoff: 0,
                             w: w,
                             gate: this},
                layout = w.addLayout("TBD", paneProps)
            w.activeP = layout.addPane(paneProps)
        }
        return w
    }
    /*
     * clear clears the gates memory and display
     */
    clear() {
        this.t7.log("Clearing gate")
        this.e.querySelector(".tabbar-names").innerHTML = ""
        this.e.querySelectorAll(".window").forEach(e => e.remove())
        this.e.querySelectorAll(".modal").forEach(e => e.classList.add("hidden"))
        if (this.activeW && this.activeW.activeP.zoomed)
            this.activeW.activeP.toggleZoom()
        this.windows = []
        this.breadcrumbs = []
        this.msgs = {}
    }
    /*
     * dump dumps the host to a state object
     * */
    dump() {
        var wins = []
        this.windows.forEach((w, i) => {
            let win = {
                name: w.name,
                layout: w.dump()
            }
            if (w == this.activeW)
                win.active = true
            wins.push(win)
        })
        return { windows: wins }
    }
    storeState() {
        const dump = this.dump()
        var lastState = {windows: dump.windows}

        if (this.fp)
            lastState.id = this.fp
        else
            lastState.id = this.addr
        lastState.name = this.name
        Storage.set({key: "last_state",
                     value: JSON.stringify(lastState)})
    }

    sendState() {
        if (this.sendStateTask != null)
            return

        this.storeState()
        // send the state only when all panes have a channel
        if (this.session && (this.panes().every(p => p.d != null)))
           this.sendStateTask = setTimeout(() => {
               this.sendStateTask = null
               if (!this.session)
                   return
               this.session.setPayload(this.dump()).then(() => {
                    if ((this.windows.length == 0) && (this.session != null)) {
                        this.t7.log("Closing gate after updating to empty state")
                        this.session.close()
                        this.session = null
                        this.boarding = false
                    }
               })
            }, 100)
    }
    onPaneConnected(pane) {
        // hide notifications
        this.t7.clear()
        //enable search
        document.querySelectorAll(".pane-buttons").forEach(
            e => e.classList.remove("off"))
    }
    goBack() {
        var w = this.breadcrumbs.pop()
        this.breadcrumbs = this.breadcrumbs.filter(x => x != w)
        if (this.windows.length == 0) {
            this.stopBoarding()
            this.clear()
            this.t7.goHome()
        }
        else
            if (this.breadcrumbs.length > 0)
                this.breadcrumbs.pop().focus()
            else
                this.windows[0].focus()
    }
    showResetHost() {
        let e = document.getElementById("reset-host"),
            addr = this.addr.substr(0, this.addr.indexOf(":"))

        document.getElementById("rh-address").innerHTML = addr
        document.getElementById("rh-name").innerHTML = this.name
        e.classList.remove("hidden")
    }
    fit() {
        this.windows.forEach(w => w.fit())
    }
    /*
     * disengage orderly disengages from the gate's connection.
     * It first sends a mark request and on it's ack store the restore marker
     * and closes the peer connection.
     */
    disengage() {
        return new Promise((resolve, reject) => { 
            this.t7.log(`disengaging. boarding is ${this.boarding}`)
            if (!this.session) {
                reject("session is null")
                return
            }
            return this.session.disconnect().then(marker => {
                this.session = null
                this.marker = marker
                this.notify("Disconnected")
                resolve()
            }).catch(() => {
                this.session = null
                this.notify("Disconnected")
                resolve()
            })
        })
    }
    closeActivePane() {
        this.activeW.activeP.close()
    }
    newTab() {
        if (this.windows.length < this.t7.conf.ui.max_tabs) {
            let w = this.addWindow("", true)
            this.breadcrumbs.push(w)
            w.focus()
        }
    }
    updateNameE() {
        const button = this.nameE.children[0]
        button.innerHTML = this.name
        if (!this.fp) {
            // there's nothing more to update for static hosts
            return
        }
        if (this.verified)
            button.classList.remove("unverified")
        else
            button.classList.add("unverified")
        if (this.online)
            button.classList.remove("offline")
        else
            button.classList.add("offline")
    }
    async copyFingerprint() {
        const fp = await this.t7.getFingerprint(),
              cmd = `echo "${fp}" >> ~/.config/webexec/authorized_fingerprints`
        let ans
        const fpForm = new Form([{ 
            prompt: `\n  We're sorry, but the host at ${this.addr} refused our fingerprint.
  To connect copy Terminal7's fingerprint to the server and try again:
  \n\x1B[1m${cmd}\x1B[0m\n
  Copy to clipboard?`,
            default: "y"
        }])
        try {
            ans = (await fpForm.start(this.t7.logTerminal))[0]
        } catch (e) {
            this.t7.clear()
            this.delete()
        }
        if (ans == "y")
            Clipboard.write({ string: cmd })
        const retryForm = new Form([{
            prompt: "Retry connection?",
            default: "y"
        }])
        try {
            ans = (await retryForm.start(this.t7.logTerminal))[0]
        } catch (e) {
            this.t7.clear()
            this.delete()
        }
        if (ans == "y")
            this.connect(this.onConnected)
        else {
            this.t7.clear()
            this.delete()
        }
    }
    askPass() {
        const hideModal = evt => evt.target.closest(".modal").classList.toggle("hidden")
        const e = document.getElementById("askpass")
        
        const authForm = new Form([
            { prompt: "Username" },
            { prompt: "Password", password: true }
        ])
        authForm.start(this.t7.logTerminal).then(res => {
            this.username = res[0]
            this.pass = res[1]
            this.t7.logTerminal.writeln("Connecting")
            this.completeConnect()
        }).catch(() => {
            this.t7.clear()
            this.delete()
        })
    }
    completeConnect(): void {
        if (this.session == null)
            if (this.fp) {
                this.notify("\uD83D\uDCD6  PeerBook")
                this.session = new PeerbookSession(this.fp, this.t7.pb)
            }
            else {
                if (this.tryWebexec) {
                    this.notify("🎌  webexec server")
                    this.session = new HTTPWebRTCSession(this.fp, this.addr)
                } else {
                    this.notify("Starting SSH session")
                    this.session = new SSHSession(this.addr, this.username, this.pass)
                    // next time go back to trying webexec
                    this.tryWebexec = true
                }
            }
        this.session.onStateChange = (state, failure?) => this.onSessionState(state, failure)
        this.session.onPayloadUpdate = layout => {
            this.notify("TBD: update new layout")
            this.t7.log("TBD: update layout", layout)
        }
        this.t7.log("opening session")
        this.session.connect(this.marker)
    }
    load() {
        this.t7.log("loading gate")
        this.session.getPayload().then(layout => this.setLayout(layout))
    }
    CLIConnect() {
        this.connect(() => {
            this.t7.logTerminal.write(" Success!")
            const saveForm = new Form([{
                prompt: "Save gate?",
                default: "y",
                values: ["y", "n"]
            } ])
            saveForm.start(this.t7.logTerminal).then(res => {
                if (res[0] == "y") {
                    const validated = this.t7.validateHostName(this.addr)
                    const fields: Fields = [{
                        prompt: "Enter name",
                        validator: (a) => this.t7.validateHostName(a),
                    }]
                    if (!validated)
                        fields[0].default = this.addr
                    const nameForm = new Form(fields)
                    nameForm.start(this.t7.logTerminal).then(res => {
                        const name = res[0]
                        this.name = name
                        const nameE = this.addToMap()
                        document.getElementById("gates").prepend(nameE)
                        this.store = true
                        this.t7.storeGates()
                        this.t7.refreshMap()
                        this.t7.clear()
                        this.load()
                    })
                } else {
                    this.t7.clear()
                    this.load()
                    this.delete()
                }
            })
        })
    }
}
