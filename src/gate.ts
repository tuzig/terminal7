/* Terminal 7 Gate
 *  This file contains the code that makes a terminal 7 gate. The gate class
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
import { SSHSession } from './ssh_session'
import { Terminal7 } from './terminal7'

import { Capacitor } from '@capacitor/core'
import { Storage } from '@capacitor/storage'
import { Form, Fields } from './form.js'
import { HTTPWebRTCSession, PeerbookSession, WebRTCSession  } from './webrtc_session'
import { Window } from './window.js'


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
    onConnected: () => void
    fp: string | undefined
    verified: boolean
    online: boolean
    store: boolean
    map: T7Map

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
        // TODO: move t7 & map into props
        this.t7 = window.terminal7
        this.map = this.t7.map
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
            t.querySelector(".reset").addEventListener('click', ev => {
                this.reset()
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
    /*
     * edit start the edit-host user-assitance
     */
    edit() {
        if (typeof(this.fp) == "string") {
            this.notify("Got peer from \uD83D\uDCD6, connect only")
            return
        } else {
            if (Form.activeForm) 
                this.map.t0.focus()
            else {
                this.map.showLog(true)
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
                f1.menu(this.map.t0, `\x1B[4m${this.name}\x1B[0m`)
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
                                        ['name', 'addr', 'username']
                                            .filter((_, i) => enabled[i])
                                            .forEach((k, i) => this[k] = results[i])
                                        if (enabled[1]) {
                                            this.t7.gates.delete(this.id)
                                            this.id = this.addr
                                            this.t7.gates.set(this.id, this)
                                        }
                                        this.t7.storeGates()
                                        this.updateNameE()
                                        this.map.showLog(false)
                                    })
                                })
                                break
                            case "\x1B[31mDelete\x1B[0m":
                                fDel.start(this.map.t0).then(res => {
                                    if (res[0] == "y")
                                        this.delete()
                                    this.t7.clear()
                                })
                                break
                        }
                    })
            }
        }
    }
    focus() {
        this.map.showLog(false)
        // hide the current focused gate
        document.getElementById("map-button").classList.remove("off")
        document.querySelectorAll(".pane-buttons").forEach(
            e => e.classList.remove("off"))
        const activeG = this.t7.activeG
        if (activeG && (activeG != this))
                activeG.e.classList.add("hidden")
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
            this.notify("Connected")
            this.setIndicatorColor("unset")
            if (!this.verified) {
                this.verified = true
                this.updateNameE()
                this.t7.storeGates()
            }
            const m = this.t7.e.querySelector(".disconnect")
            if (m != null)
                m.remove()
            // show help for first timer
            Storage.get({key: "first_gate"}).then(v => {
                if (v.value != "1") {
                    this.t7.run(this.t7.toggleHelp, 1000)
                    Storage.set({key: "first_gate", value: "1"}) 
                }
            })
			// first onConnected is special if it's a new gate but once connected, we're back to load
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
        this.notify(`FAILED: ${failure || "Server Disconnected"}`)
        this.session = null
        if (!this.boarding)
            return
        this.stopBoarding()
        switch ( failure ) {
            case Failure.WrongPassword:
                this.tryWebexec = false
                this.pass = undefined
                this.retryForm(() => this.CLIConnect(), () => this.delete())
                return
            case Failure.Unauthorized:
                this.copyFingerprint()
                return
            case Failure.BadMarker:
                this.notify("Trying a fresh session")
                this.marker = null
                this.connect(this.onConnected)
                return
            case Failure.TimedOut:
                if (!this.fp && this.tryWebexec && (Capacitor.getPlatform() == "ios")) {
                    this.tryWebexec = false
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
                const rc = `bash -c "$(curl -sL https://get.webexec.sh)"\necho "${this.fp}" >> ~/.config/webexec/authorized_fingerprints`
                this.map.t0.writeln("  Failed to connect")
                let ans
                const verifyForm = new Form([{
                    prompt: `Does the address \x1B[1;37m${this.addr}\x1B[0m seem correct?`,
                    values: ["y", "n"],
                    default: "y"
                }])
                ans = (await verifyForm.start(this.map.t0))[0]
                if (!ans) {
                    this.map.t0.writeln("ESC")
                    return
                }
                if (ans == "n")
                    return this.t7.connect()
                const webexecForm = new Form([{
                    prompt: `Make sure webexec is running on ${this.addr}:
                        \n\x1B[1m${rc}\x1B[0m\n \n  Copy to clipboard?`,
					values: ["y", "n"],
                    default: "y"
                }])
                ans = (await webexecForm.start(this.map.t0))[0]
                if (ans == "y")
                    Clipboard.write({ string: rc })
				this.retryForm(() => {
                    this.map.t0.writeln("\n  Retrying...")
                    this.CLIConnect()
				}, () => this.delete())
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
        this.updateNameE()
        if (!this.pass && !this.fp && !this.tryWebexec) {
            this.askPass()
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
        const r = []
        this.t7.cells.forEach(c => {
            if (c instanceof Pane && (c.gate == this))
                r.push(c)
        })
        return r
    }
    // reset reset's a gate connection by disengaging and reconnecting
    reset() {
        const fields = [
            { prompt: "Reset connection & Layout" },
            { prompt: "Close gate" },
            { prompt: "\x1B[31mFactory reset\x1B[0m" },
        ]
        const factoryResetVerify = new Form([{
            prompt: `Factory reset will remove all gates,\n    the certificate and configuration changes.`,
            values: ["y", "n"],
            default: "n"
        }])
        if (this.session instanceof WebRTCSession)
            // Add the connection reset option for webrtc
            fields.splice(0,0, { prompt: "Reset connection" })
        const resetForm = new Form(fields)
        this.map.showLog(true)
        resetForm.menu(this.map.t0, `\x1B[4m${this.name}\x1B[0m`).then(choice => {
            switch (choice) {
                case "Reset connection":
                    this.disengage().then(() => {
                        this.t7.run(() =>  {
                            this.connect()
                        }, 100)
                    }).catch(() => this.connect())
                    break
                case "Reset connection & Layout":
                    this.disengage().then(() => {
                        this.connect(() => {
                            this.clear()
                            this.map.showLog(false)
                            this.activeW = this.addWindow("", true)
                            this.focus()
                        })
                    }).catch(() => this.notify("Connect failed"))
                    break
                case "\x1B[31mFactory reset\x1B[0m":
                    factoryResetVerify.start(this.map.t0).then(answers => {
                        const ans = answers[0]
                        if (!ans) {
                            this.map.t0.writeln("ESC")
                            return
                        }
                        if (ans == "y") {
                            this.t7.factoryReset()
                            this.clear()
                            this.t7.goHome()
                        }
                        else
                            this.map.showLog(false)
                    })
                    break
                case "Close gate":
                    this.boarding = false
                    this.session.close()
                    this.session = null
                    this.clear()
                    this.updateNameE()
                    this.t7.goHome()
                    break
            }
        })
    }
    async loseState () {
        const fp = await this.t7.getFingerprint(),
              rc = `bash -c "$(curl -sL https://get.webexec.sh)"
echo "${fp}" >> ~/.config/webexec/authorized_fingerprints
`
        let e = document.getElementById("lose-state-template")
        e = e.content.cloneNode(true)

        e.querySelector("pre").innerText = rc
        e.querySelector(".continue").addEventListener('click', () => {
            this.t7.e.querySelector('.lose-state').remove()
            this.clear()
            this.activeW = this.addWindow("", true)
            this.focus()
        })
        e.querySelector(".copy").addEventListener('click', () => {
            this.t7.e.querySelector('.lose-state').remove()
            Clipboard.write( {string: rc })
            this.tryWebexec = true
            this.clear()
            this.activeW = this.addWindow("", true)
            this.focus()
        })
        e.querySelector(".close").addEventListener('click', () => {
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
            this.activeW.activeP.toggleZoom()
        this.windows = []
        this.breadcrumbs = []
        this.msgs = {}
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
                        this.session.close()
                        this.session = null
                        this.boarding = false
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
            const w = this.addWindow("", true)
            this.breadcrumbs.push(w)
            w.focus()
        }
    }
    async copyFingerprint() {
        const fp = await this.t7.getFingerprint(),
              cmd = `echo "${fp}" >> ~/.config/webexec/authorized_fingerprints`
        const fpForm = new Form([{ 
            prompt: `\n  ${this.addr} refused our fingerprint.
  \n\x1B[1m${cmd}\x1B[0m\n
  Copy to clipboard and connect with SSH?`,
            values: ["y", "n"],
            default: "y"
        }])
        const ans = (await fpForm.start(this.map.t0))[0]
        if (ans == "y") {
            Clipboard.write({ string: cmd })
            this.tryWebexec = false
            this.connect(this.onConnected)
        }
        else
            this.map.showLog(false)
    }
    askPass() {
        this.map.t0.writeln("  Trying SSH")
        const authForm = new Form([
            { prompt: "Username", default: this.username },
            { prompt: "Password", password: true }
        ])
        authForm.start(this.map.t0).then(res => {
            this.username = res[0]
            this.pass = res[1]
            this.completeConnect()
        })
    }
    completeConnect(): void {
        if (this.session == null)
            if (this.fp) {
                this.notify("🎌  PeerBook")
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
            if (!this.name.startsWith("temp")) {
                this.load()
                return
            }
            const saveForm = new Form([{
                prompt: "Save gate?",
                default: "y",
                values: ["y", "n"]
            } ])
            saveForm.start(this.map.t0).then(res => {
                if (res[0] == "y") {
                    const validated = this.t7.validateHostName(this.addr)
                    const fields: Fields = [{
                        prompt: "Enter name",
                        validator: (a) => this.t7.validateHostName(a),
                    }]
                    if (!validated)
                        fields[0].default = this.addr
                    const nameForm = new Form(fields)
                    nameForm.start(this.map.t0).then(res => {
                        const name = res[0]
                        this.name = name
                        this.nameE = this.map.add(this)
                        this.store = true
                        this.t7.storeGates()
                        this.map.showLog(false)
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
	async retryForm(retry: () => void, cancel: () => void) {
		const retryForm = new Form([{
			prompt: "Retry connection?",
			values: ["y", "n"],
			default: "y"
		}])
		const ans = (await retryForm.start(this.map.t0))[0]
		if (ans == "y")
			retry()
		else
			cancel()
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
}
