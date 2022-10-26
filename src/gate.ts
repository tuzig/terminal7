/* Terminal 7Gate
  This file contains the code that makes a terminal 7 gate. The gate class
 *  represents a server and it may be boarding - aka connected - or not.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { Clipboard } from '@capacitor/clipboard'
import { Storage } from '@capacitor/storage'

import { Pane } from './pane.js'
import { T7Map } from './map'
import { Failure, Session } from './session'
import { SSHSession, HybridSession } from './ssh_session'
import { Terminal7 } from './terminal7'

import { Capacitor } from '@capacitor/core'
import { HTTPWebRTCSession, PeerbookSession } from './webrtc_session'
import { Window } from './window.js'
import { CLIConnect } from './commands.js'


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
    user: string
    username: string
    nameE: Element
    t7: Terminal7
    onConnected: () => void
    fp: string | undefined
    verified: boolean
    online: boolean
    store: boolean
    map: T7Map
    onlySSH: boolean

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
        // TODO: move t7 & map into props
        this.t7 = window.terminal7
        this.map = this.t7.map
        this.session = null
        this.onlySSH = props.onlySSH || false
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
            t.querySelector(".reset").addEventListener('click', ev => {
                this.t7.map.shell.runCommand("reset", [this.name])
                ev.preventDefault()
                ev.stopPropagation()
            })
            t.querySelector(".add-tab").addEventListener(
                'click', () => this.newTab())
            t.querySelector(".search-close").addEventListener('click', () =>  {
                this.map.showLog(false)
                this.activeW.activeP.exitSearch()
                this.activeW.activeP.focus()
            })
            t.querySelector(".search-up").addEventListener('click', () =>
                this.activeW.activeP.findPrev())

            t.querySelector(".search-down").addEventListener('click', () => 
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
    delete() {
        this.t7.gates.delete(this.id)
        this.t7.storeGates()
		this.map.remove(this)
    }
    /* TODO: updae edit in commands
     * edit start the edit-host user-assitance
    edit() {
        if (typeof(this.fp) == "string") {
            this.notify("Got peer from \uD83D\uDCD6, connect only")
            return
        } else {
            // TODO: check if we need this
            if (Form.activeForm) 
                this.map.t0.focus()
            else {
                this.map.showLog(true)
                // TODO: move this to the top of the function
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
                    { prompt: "Username", default: this.username },
                    { prompt: "SSH only", values: ["y", "n"], default: this.onlySSH?"y":"n" },
                ])
                const fDel = new Form([{
                    prompt: `Delete ${this.name}?`,
                    values: ["y", "n"],
                    default: "n",
                }])
                this.map.interruptTTY()
                this.map.t0.writeln(`\nMenu for \x1B[4m${this.name}\x1B[0m:`)
                f1.menu(this.map.t0)
                    .then(choice => {
                        switch (choice) {
                            case 'Connect':
                                this.connect()
                                break
                            case 'Edit':
                                f2.chooseFields(this.map.t0, `\x1B[4m${this.name}\x1B[0m edit`).then((enabled) => {
                                    if (!enabled) {
                                        this.t7.clear()
                                        return
                                    }
                                    f2.start(this.map.t0).then(results => {
                                        ['name', 'addr', 'username', 'onlySSH']
                                            .filter((_, i) => enabled[i])
                                            .forEach((k, i) => this[k] = results[i])
                                        this.onlySSH = this.onlySSH == 'y'
                                        if (enabled[1]) {
                                            this.t7.gates.delete(this.id)
                                            this.t7.gates.set(this.id, this)
                                        }
                                        this.t7.storeGates()
                                        this.updateNameE()
                                        this.map.showLog(false)
                                    }).catch(e => this.onFormError(e))
                                }).catch(e => this.onFormError(e))
                                break
                            case "\x1B[31mDelete\x1B[0m":
                                fDel.start(this.map.t0).then(res => {
                                    if (res[0] == "y")
                                        this.delete()
                                    this.t7.clear()
                                }).catch(e => this.onFormError(e))
                                break
                        }
                    }).catch(() => this.map.showLog(false))
            }
        }
    }
     */
    focus() {
        this.map.showLog(false)
        // hide the current focused gate
        document.getElementById("map-button").classList.remove("off")
        document.querySelectorAll(".pane-buttons").forEach(
            e => e.classList.remove("off"))
        this.e.classList.remove("hidden")
        this.e.querySelectorAll(".window")
              .forEach(w => w.classList.add("hidden"))
        this.activeW.focus()
        this.storeState()
    }
    // stops all communication 
    stopBoarding() {
        this.boarding = false
        this.updateNameE()
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
            this.marker = null
            this.notify(`🥂  over ${this.session.isSSH?"SSH":"WebRTC"}`)
            this.setIndicatorColor("unset")
            if (!this.verified) {
                this.verified = true
                this.updateNameE()
                this.t7.storeGates()
            }
            // first onConnected is special if it's a new gate but once
            // connected, we're back to loading the gate
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
        this.notify(`FAILED: ${failure || "Peer connection"}`)
        this.map.showLog(true)
        this.session.close()
        this.session = null
        this.marker = null
        if (!this.boarding)
            return
        this.stopBoarding()
        switch ( failure ) {
            case Failure.WrongPassword:
                this.pass = undefined
                this.retryForm(() => CLIConnect(this.map.shell, this), () => this.close())
                return
            case Failure.NotImplemented:
                this.notify("Please try again")
                break
            case Failure.Unauthorized:
                this.copyFingerprint()
                return
            case Failure.BadMarker:
                this.notify("Trying a fresh session")
                this.marker = null
                this.connect(this.onConnected)
                return
            case Failure.TimedOut:
                // TODO: probably should ask if to reconnect
                if (!this.fp && (Capacitor.getPlatform() == "ios")) {
                    this.connect(this.onConnected)
                    return
                }
                break
            case Failure.BadRemoteDescription:
                this.notify("Please try again")
                break
        }
        if (this.name.startsWith("temp")) {
            (async () => {
                const fp = await this.t7.getFingerprint(),
                    rc = `bash -c "$(curl -sL https://get.webexec.sh)"\necho "${fp}" >> ~/.config/webexec/authorized_fingerprints`
                this.map.t0.writeln("Failed to connect")
                let ans:string
                const verifyForm = [{
                    prompt: `Does the address \x1B[1;37m${this.addr}\x1B[0m seem correct?`,
                    values: ["y", "n"],
                    default: "y"
                }]
                try {
                    ans = (await this.map.shell.runForm(verifyForm, "text"))[0]
                } catch(e) {
                    this.delete()
                    return
                }

                if (ans == "n") {
                    this.delete()
                    setTimeout(() => this.map.shell.handleLine("add-host"), 100)
                    return
                }
                const webexecForm = [{
                    prompt: `Make sure webexec is running on ${this.addr}:
                        \n\x1B[1m${rc}\x1B[0m\n\nCopy to clipboard?`,
					values: ["y", "n"],
                    default: "y"
                }]
                try {
                    ans = (await this.map.shell.runForm(webexecForm, "text"))[0]
                } catch(e) {
                    this.delete()
                    return
                }
                if (ans == "y")
                    Clipboard.write({ string: rc })
				this.retryForm(async () => {
                    this.map.t0.writeln("Retrying...")
                    await CLIConnect(this.map.shell, this)
				}, () => this.delete())
            })()
        } else
            this.t7.onDisconnect(this)
    }
    reconnect(): Promise<void> {
        this.notify("Reconnecting")
        return new Promise((resolve, reject) => {
            if (!this.session)
                return this.connect()
            else 
                this.session.reconnect(this.marker).then(resolve)
                .catch(() => this.connect().then(resolve).catch(reject))
        })
    }
    /*
     * connect connects to the gate
     */
    async connect(onConnected = () => this.load()) {
        
        // do nothing when the network is down
        if (!this.t7.netStatus || !this.t7.netStatus.connected)
            return
        this.onConnected = onConnected
        this.t7.activeG = this
        document.title = `Terminal 7: ${this.name}`
        // if we're already boarding, just focus
        if (this.session && this.session.watchdog)
            return this.completeConnect()
        
        if (this.session) {
            // TODO: check session's status
            // hide the tower if needed
            const log = document.getElementById("log")
            if (!log.classList.contains("show"))
                log.classList.add("hidden")
            log.classList.add("hidden")
            this.focus()
            return
        }
        this.boarding = true
        this.updateNameE()
        return this.completeConnect()

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
        const r = []
        this.t7.cells.forEach(c => {
            if (c instanceof Pane && (c.gate == this))
                r.push(c)
        })
        return r
    }
    // reset reset's a gate connection by disengaging and reconnecting
    reset() {
        this.t7.map.shell.runCommand("reset", [this.name])
    }
    setLayout(state: object) {
        console.log("in setLayout", state)
        const winLen = this.windows.length
        // got an empty state
        if ((state == null) || !(state.windows instanceof Array) || (state.windows.length == 0)) {
            // create the first window and pane
            this.t7.log("Fresh state, creating the first pane")
            this.clear()
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
                const win = this.addWindow(w.name)
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
        const id = this.windows.length,
			w = new Window({name:name, gate: this, id: id})
        this.windows.push(w)
        if (this.windows.length >= this.t7.conf.ui.max_tabs)
            this.e.querySelector(".add-tab").classList.add("off")
        w.open(this.e.querySelector(".windows-container"))
        if (createPane) {
            const paneProps = {sx: 1.0, sy: 1.0,
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
            this.activeW.activeP.unzoom()
        this.windows = []
        this.breadcrumbs = []
        this.msgs = {}
        this.t7.cells.forEach((c, i, cells) => {
            if (c instanceof Pane && (c.gate == this))
                cells.splice(i, 1)
        })
    }
    /*
     * dump dumps the host to a state object
     * */
    dump() {
        const wins = []
        this.windows.forEach(w => {
            const win = {
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
        const lastState = {windows: dump.windows}

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
                        this.close()
                    }
               })
            }, 100)
    }
    onPaneConnected() {
        // hide notifications
        this.t7.clear()
        //enable search
        document.querySelectorAll(".pane-buttons").forEach(
            e => e.classList.remove("off"))
    }
    goBack() {
        const w = this.breadcrumbs.pop()
        this.breadcrumbs = this.breadcrumbs.filter(x => x != w)
        if (this.windows.length > 0 ) {
            if (this.breadcrumbs.length > 0)
                this.breadcrumbs.pop().focus()
            else
                this.windows[0].focus()
        }
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
                this.marker = marker
                resolve()
            }).catch(() => {
                resolve()
            })
        })
    }
    closeActivePane() {
        this.activeW.activeP.close()
    }
    newTab() {
        if (this.windows.length < this.t7.conf.ui.max_tabs) {
            const w = this.addWindow("", true)
            this.breadcrumbs.push(w)
            w.focus()
        }
    }
    async copyFingerprint() {
        const fp = await this.t7.getFingerprint(),
              cmd = `echo "${fp}" >> ~/.config/webexec/authorized_fingerprints`
        const fpForm = [{ 
            prompt: `\n  ${this.addr} refused our fingerprint.
  \n\x1B[1m${cmd}\x1B[0m\n
  Copy to clipboard and connect with SSH?`,
            values: ["y", "n"],
            default: "y"
        }]
        let ans: string
        try {
            ans = (await this.map.shell.runForm(fpForm, "text"))[0]
        } catch(e) { this.onFormError(e) }
        if (ans == "y") {
            Clipboard.write({ string: cmd })
            this.connect(this.onConnected)
        }
        else
            this.map.showLog(false)
    }
    async askPass() {
        const name = this.name.startsWith("temp_")?this.addr:this.name
        this.map.t0.writeln(`  Login to ${name}`)
        const authForm = [
            { prompt: "Username", default: this.username },
            { prompt: "Password", password: true }
        ]
        const res = await this.map.shell.runForm(authForm, "text")
        this.username = res[0]
        this.pass = res[1]
    }
    async completeConnect(): void {
        if (this.map.shell.activeForm)
            this.map.shell.escapeActiveForm()

        if (this.fp) {
            this.notify("🎌  PeerBook")
            this.session = new PeerbookSession(this.fp, this.t7.pb)
        }
        else {
            if (Capacitor.getPlatform() == "ios") {
                if (!this.pass) {
                    await this.askPass()
                }
                this.session = (this.onlySSH)?new SSHSession(this.addr, this.username, this.pass):
                   new HybridSession(this.addr, this.username, this.pass)
            } else {
                this.notify("🎌  webexec server")
                this.session = new HTTPWebRTCSession(this.addr)
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
        this.session.getPayload().then(layout => {
            console.log("got payload", layout)
            this.setLayout(layout)
        })
        document.getElementById("map").classList.add("hidden")
    }
	async retryForm(retry: () => void, cancel: () => void) {
        this.map.showLog(true)
		const retryForm = [{
			prompt: "Retry connection?",
			values: ["y", "n"],
			default: "y"
		}]
		this.map.shell.runForm(retryForm, "text").then(results => {
            if (results[0] == "y")
                retry()
            else {
                this.map.showLog(false)
                cancel()
            }
        }).catch(() => cancel())
	}
    onFormError(err) {
        this.t7.log("Form error:", err.message)
        this.t7.clearTempGates()
    }
    updateNameE() {
        const e = this.nameE
        // ignores gate with no nameE
        if (!e || (e.children.length < 1))
            return
        this.map.update({
            e: e,
            name: this.name || this.addr,
            boarding: this.boarding,
            offline: this.online === false,
            unverified: this.verified === false,
        })
    }
    close(){
        this.boarding = false
        this.clear()
        this.updateNameE()
        if (this.session) {
            this.session.close()
            this.session = null
        }
        // we need the timeout as cell.focus is changing the href when dcs are closing
        setTimeout(() => this.t7.goHome(), 100)
    }
}
