/* Terminal 7Gate
  This file contains the code that makes a terminal 7 gate. The gate class
 *  represents a server and it may be boarding - aka connected - or not.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { Clipboard } from '@capacitor/clipboard'

import { Pane } from './pane.js'
import { T7Map } from './map'
import { Failure, Session } from './session'
import { SSHSession, HybridSession } from './ssh_session'
import { Terminal7 } from './terminal7'

import { Capacitor } from '@capacitor/core'
import { HTTPWebRTCSession, PeerbookSession } from './webrtc_session'
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
    secret: string
    session: Session
    user: string
    username: string
    nameE: Element
    t7: Terminal7
    onConnected: () => void
    onFailure: (failure: Failure) => void
    fp: string | undefined
    verified: boolean
    online: boolean
    store: boolean
    map: T7Map
    onlySSH: boolean
    noIds: boolean
    firstConnection: boolean
    keyRejected: boolean
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
        this.onFailure = Function.prototype()
        this.firstConnection = props.firstConnection || false
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
        this.t7.log(`updating ${this.name} state to ${state} ${failure}`)
        if (state == "connected") {
            this.marker = null
            this.notify(`🥂  over ${this.session.isSSH?"SSH":"WebRTC"}`)
            this.setIndicatorColor("unset")
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
    async handleFailure(failure: Failure) {
        // KeyRejected and WrongPassword are "light failure"
        if (!this.t7.lastActiveState) {
            console.log("ignoring failed event as the app is still in the back")
            this.stopBoarding()
            if (this.session) {
                this.session.close()
                this.session = null
            }
            return
        }
        if ((failure != Failure.KeyRejected) && (failure != Failure.WrongPassword)) {
            this.session.close()
            this.session = null
            this.stopBoarding()
            if (!this.t7.recovering)
                this.notify(`FAILED: ${failure || "WebRTC connection"}`)
            else {
                this.notify(`Retrying after ${failure}`)
                return
            }
            if (this != this.t7.activeG)
                return
        }
        // this.map.showLog(true)
        console.log("handling failure", failure)
        this.boarding = false
        let password: string
        switch ( failure ) {
            case Failure.WrongPassword:
                this.notify("Sorry, wrong password")
                try {
                    password = await this.map.shell.askPass()
                } catch (e) { 
                    this.onFailure(failure)
                    return 
                }
                this.session.passConnect(this.marker, password)
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
            case Failure.BadRemoteDescription:
                this.notify("Please try again")
                break

            case Failure.KeyRejected:
                this.notify("🔑 Rejected")
                this.keyRejected = true
                try {
                    password = await this.map.shell.askPass()
                } catch (e) { 
                    this.onFailure(Failure.Aborted)
                    return 
                }
                this.session.passConnect(this.marker, password)
                return
        }
        if (this.firstConnection) {
            (async () => {
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
                    return this.onFailure(Failure.WrongAddress)
                }

                if (ans == "n") {
                    this.delete()
                    setTimeout(() => this.map.shell.handleLine("add"), 100)
                    return this.onFailure(Failure.WrongAddress)
                }
                /* TODO: separate the native from the in-browser:
                const webexecForm = [{
                    prompt: `Make sure webexec is running on ${this.addr}:
                        \n\x1B[1m${rc}\x1B[0m\n\nCopy to clipboard?`,
					values: ["y", "n"],
                    default: "y"
                }]
                try {
                    ans = (await this.map.shell.runForm(webexecForm, "text"))[0]
                } catch(e) {
                    return this.onFailure(Failure.WrongAddress)
                }
                if (ans == "y")
                    Clipboard.write({ string: rc })
                */
				this.retryForm(async () => {
                    this.map.t0.writeln("Retrying...")
                    await this.map.shell.runCommand("connect", [this.name])
				})
            })()
        } else
            await this.map.shell.onDisconnect(this)
    }
    reconnect(): Promise<void> {
        if (!this.session)
            return this.connect()
        return new Promise((resolve, reject) => {
            this.t7.readId().then(({publicKey, privateKey}) => {
                this.session.reconnect(this.marker, publicKey, privateKey).then(layout => {
                    this.setLayout(layout)
                    resolve()
                }).catch(() => this.connect().then(resolve).catch(reject))
            }).catch((e) => {
                this.t7.log("failed to read id", e)
                resolve()
            })
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
        if (!this.firstConnection)
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
        // wait for the sizes to settle and update the server if needed
        setTimeout(() => {
            this.panes().forEach((p, i) => {
                if (p.d && p.needsResize) {
                    // TODO: fix webexec so there's no need for this
                    this.t7.run(() => p.d.resize(p.t.cols, p.t.rows), i*10)
                    p.needsResize = false
                }
            })
        }, 400)
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
        /* TODO: restore the restore to last state
        const dump = this.dump()
        const lastState = {windows: dump.windows}

        if (this.fp)
            lastState.id = this.fp
        else
            lastState.id = this.addr
        lastState.name = this.name
        Preferences.set({key: "last_state",
                     value: JSON.stringify(lastState)})
                     */
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
    async onPaneConnected() {
        // hide notifications
        await this.t7.clear()
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
    }
    async completeConnect(): void {
        this.keyRejected = false
        if (this.fp) {
            this.notify("🎌  PeerBook")
            this.session = new PeerbookSession(this.fp, this.t7.pb)
        }
        else {
            if (Capacitor.isNativePlatform())  {
                if (!this.username) {
                    try {
                        this.username = await this.map.shell.askValue("Username")
                    } catch (e) {
                        this.notify("Failed to get username")
                    }
                }
                this.session = (this.onlySSH)?new SSHSession(this.addr, this.username):
                   new HybridSession(this.addr, this.username)
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
        if (this.noIds)
            this.session.connect(this.marker)
        else {
            const {publicKey, privateKey} = await this.t7.readId()
            this.session.connect(this.marker, publicKey, privateKey)
        }
    }
    load() {
        this.t7.log("loading gate")
        this.session.getPayload().then(layout => {
            console.log("got payload", layout)
            this.setLayout(layout)
        })
        document.getElementById("map").classList.add("hidden")
    }
	async retryForm(retry: () => void, cancel?: () => void) {
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
                cancel?.()
            }
        }).catch(() => cancel?.())
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
    close() {
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
