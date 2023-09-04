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
import { PB } from './peerbook'
import { SSHSession } from './ssh_session'
import { Terminal7 } from './terminal7'

import { Capacitor } from '@capacitor/core'
import { HTTPWebRTCSession, PeerbookSession } from './webrtc_session'
import { Window } from './window.js'
import { Preferences } from '@capacitor/preferences'


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
    session: Session | null
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
    firstConnection: boolean
    keyRejected: boolean
    connectionFailed: boolean
    layoutWidth: number
    layoutHeight: number
    fontScale: number
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
        this.fontScale = props.fontScale || 1
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
    // deletes removes the gate from terminal7 and the map
    delete() {
        this.t7.gates.splice(this.t7.gates.indexOf(this), 1)
        this.t7.storeGates()
		this.map.remove(this)
    }
    focus() {
        terminal7.activeG = this
        this.boarding = true
        this.updateNameE()
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
            if (terminal7.recovering)  {
                this.session.msgHandlers.forEach(v => {
                    v[1]("Disconnected")
                })
                setTimeout(() => this.reconnect(), 10)
                return
            }
        } else if (state == "failed")  {
            if (terminal7.recovering)  {
                terminal7.log("failure while recovering")
                if (this.session?.isSSH) { // if ssh, try again
                    setTimeout(() => this.completeConnect(), 100)
                    return
                }
                this.session.close()
                this.session = null
                this.reconnect()
            } else
                this.handleFailure(failure)
        }
    }
    // handle connection failures
    async handleFailure(failure: Failure) {
        // KeyRejected and WrongPassword are "light failure"
        const active = this == this.t7.activeG
        const wasSSH = this.session && this.session.isSSH && this.boarding
        if (!active || this.connectionFailed)
            return
        // this.map.showLog(true)
        terminal7.log("handling failure", failure, terminal7.recovering)
        this.stopBoarding()
        this.map.shell.stopWatchdog()
        let password: string
        let firstGate: string | null
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
            case Failure.BadRemoteDescription:
                this.session.close()
                this.session = null
                terminal7.pbClose()
                this.notify("Sync Error. Please try again")
                break
            case Failure.NotImplemented:
                this.session.close()
                this.session = null
                this.notify("Not Implemented. Please try again")
                break
            case Failure.Unauthorized:
                // TODO: handle HTTP based authorization failure
                this.copyFingerprint()
                return
            case Failure.BadMarker:
                this.notify("Sync Error. Starting fresh")
                this.marker = null
                this.session.close()
                this.session = null
                this.connect(this.onConnected)
                return

            case undefined:
            case Failure.DataChannelLost:
                if (this.session) {
                    this.session.close()
                    this.session = null
                }
                if (terminal7.recovering)  {
                    terminal7.log("Cleaned session as failure on recovering")
                    return
                }
                this.notify(failure?"Lost Data Channel":"Lost Connection")
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
                firstGate = (await Preferences.get({key: "first_gate"})).value
                if (firstGate)
                    terminal7.ignoreAppEvents = true
                this.session.passConnect(this.marker, password)
                return
            case Failure.FailedToConnect:
                this.notify("Failed to connect")
                // SSH failed, don't offer install
                await this.map.shell.onDisconnect(this)
                return

            case Failure.TimedOut:
                this.connectionFailed = true
                break

            case Failure.NotSupported:
                if (!Capacitor.isNativePlatform())
                    this.notify("🙁 Please ensure webexec is running")
                break

        }
        await this.map.shell.onDisconnect(this, wasSSH)
    }
    reconnect(): Promise<void> {
        if (!this.session)
            return this.connect()
        this.connectionFailed = false
        const isSSH = this.session.isSSH
        const isNative = Capacitor.isNativePlatform()
        return new Promise((resolve, reject) => {
            if (!isSSH && !isNative) {
                this.session.reconnect(this.marker).then(layout => {
                    this.setLayout(layout)
                    resolve()
                }).catch(() => {
                    if (this.session) {
                        this.session.close()
                        this.session = null
                    }
                    terminal7.log("reconnect failed, calling the shell to handle it", isSSH)
                    this.map.shell.onDisconnect(this, isSSH).then(resolve).catch(reject)
                })
                return
            }
            this.t7.readId().then(({publicKey, privateKey}) => {
                this.session.reconnect(this.marker, publicKey, privateKey).then(layout => {
                    this.setLayout(layout)
                    resolve()
                }).catch(e => {
                    if (this.session && !this.session.isSSH) {
                        this.session.close()
                        this.session = null
                    }
                    terminal7.log("reconnect failed, calling the shell to handle it", isSSH, e)
                    this.map.shell.onDisconnect(this, isSSH).then(resolve).catch(reject)
                })
            }).catch((e) => {
                this.t7.log("failed to read id", e)
                if (this.session && !this.session.isSSH) {
                    this.session.close()
                    this.session = null
                }
                this.map.shell.onDisconnect(this, isSSH).then(resolve).catch(reject)
                resolve()
            })
        })
    }
    /*
     * connect connects to the gate
     */
    async connect(onConnected = () => this.load()) {
        
        if (!terminal7.netConnected)
            return
        this.onConnected = onConnected
        this.t7.activeG = this // TODO: move this out of here
        this.connectionFailed = false
        document.title = `Terminal 7: ${this.name}`
        
        if (this.session) {
            // TODO: check session's status
            // hide the tower if needed
            onConnected()
            return
        }
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
            if (this.activeW && this.activeW.activeP.zoomed)
                this.activeW.activeP.unzoom()
            this.syncLayout(state)
            this.panes().forEach(p => p.openChannel({id: p.channelID}))
        } else {
            this.t7.log("Setting layout: ", state)
            this.clear()
            this.layoutWidth = state.width
            this.layoutHeight = state.height
            this.scaleContainer()
            state.windows.forEach(w =>  {
                const win = this.addWindow(w.name, false, w.id)
                if (w.active) 
                    this.activeW = win
                win.restoreLayout(w.layout, w.active)
                win.nameE?.setAttribute("href", `#pane-${win.activeP?.id}`)
            })
        }

        if (!this.activeW)
            this.activeW = this.windows[0]
        // wait for the sizes to settle and update the server if needed
        setTimeout(() => {
            let foundNull = false
            this.panes().forEach((p, i) => {
                if (p.d) {
                    if (p.needsResize) {
                    // TODO: fix webexec so there's no need for this
                        this.t7.run(() => p.d.resize(p.t.cols, p.t.rows), i*10)
                        p.needsResize = false
                    }
                } else
                    foundNull = true
            })
            if (!foundNull) {
                this.t7.log(`${this.name} is boarding`)
                this.updateNameE()
            }
        }, 400)
        this.focus()
    }
    scaleContainer() {
        const width = this.layoutWidth,
            height = this.layoutHeight
        if (!width || !height)
            return
        const container = this.e.querySelector(".windows-container")
        const maxWidth = document.body.clientWidth,
            maxHeight = document.body.clientHeight - 135
        const sx = maxWidth / width,
            sy = maxHeight / height
        const scale = Math.min(sx, sy)
        const scaledWidth = width * scale,
            scaledHeight = height * scale
        this.panes().forEach(p => {
            p.t.options.fontSize = Math.floor(scale * p.fontSize)
        })
        this.fontScale = scale
        container.style.width = `${scaledWidth}px`
        container.style.height = `${scaledHeight}px`
        container.style.left = "50%"
        container.style.top = "calc(50% - 45px)"
        container.style.transform = `translate(-50%, -50%)`
        container.style.transformOrigin = "top left"
    }
    syncLayout(state: object) {
        this.layoutWidth = state.width
        this.layoutHeight = state.height
        this.scaleContainer()
        state.windows.forEach(w => {
            const win = this.windows.find(win => win.id == w.id)
            if (!win) {
                // Add window
                this.t7.log(`Adding window ${w.name}`)
                const newW = this.addWindow(w.name, false, w.id)
                newW.restoreLayout(w.layout, w.active)
                if (w.active)
                    newW.focus()
                return
            }
            if (win.name != w.name) {
                win.name = w.name
                win.nameE.innerHTML = w.name
            }
            win.rootLayout = win.syncLayout(w.layout)
            win.nameE?.setAttribute("href", `#pane-${win.activeP?.id}`)
            if (w.active)
                win.focus()
        })
    }
    /*
     * Adds a window, opens it and returns it
     */
    addWindow(name, createPane?, id?) {
        this.t7.log(`adding Window: ${name}`)
        id = id || this.windows.length
		const w = new Window({name:name, gate: this, id: id})
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
        this.e.querySelector(".windows-container").removeAttribute("style")
        if (this.activeW && this.activeW.activeP.zoomed)
            this.activeW.activeP.unzoom()
        this.windows = []
        this.breadcrumbs = []
        this.msgs = {}
        this.layoutWidth = 0
        this.layoutHeight = 0
        this.t7.cells.forEach((c, i, cells) => {
            if (c instanceof Pane && (c.gate == this))
                cells.splice(i, 1)
        })
    }
    /*
     * dump dumps the host to a state object
     * */
    dump() {
        const windows = []
        this.windows.forEach(w => {
            const win = {
                name: w.name,
                id: w.id,
                layout: w.dump(),
            }
            if (w == this.activeW)
                win.active = true
            windows.push(win)
        })
        if (this.layoutWidth && this.layoutHeight)
            return {windows, width: this.layoutWidth, height: this.layoutHeight}
        const width = document.body.clientWidth,
            height = document.body.clientHeight - 135
        return { windows, width, height }
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
        if ((this.sendStateTask != null) || !this.session)
            return
       this.sendStateTask = setTimeout(() => {

           this.sendStateTask = null

           if (!this.session)
               return

            if (this.panes().every(p => p.channelID))
               this.session.setPayload(this.dump()).then(() => {
                    if ((this.windows.length == 0) && (this.session != null)) {
                        this.t7.log("Closing gate after updating to empty state")
                        this.close()
                    }
               })
            else
                this.sendState()
        }, 100) // TODO: make it run when the update is done and all channels opened
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
        const cmd = `echo "${fp}" >> ~/.config/webexec/authorized_fingerprints`
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
        const isNative = Capacitor.isNativePlatform()
        const overPB = this.fp && !this.onlySSH && this.online
        if (overPB) {
            this.notify("🎌  PeerBook")
            if (!terminal7.pb.isOpen()) 
                await terminal7.pbConnect()
            this.session = new PeerbookSession(this.fp, this.t7.pb)
        } else {
            if (isNative)  {
                this.session = new SSHSession(this.addr, this.username)
            } else {
                this.notify("🎌  WebExec HTTP server")
                const addr = `http://${this.addr}:7777/connect`
                this.session = new HTTPWebRTCSession(addr)
            }
        }
        this.session.onStateChange = (state, failure?) => this.onSessionState(state, failure)
        this.session.onCMD = msg => {
            if (msg.type == "set_payload") {
                this.setLayout(msg.args.payload)
            }
        }
        this.t7.log("opening session")
        if (overPB) {
            try {
                this.session.connect(this.marker)
            } catch(e) {
                this.t7.log("error connecting", e)
                this.notify(`${PB} Connection failed: ${e}`)
            }
        } else {
            if (this.session.isSSH) {
                try {
                    const {publicKey, privateKey} = await this.t7.readId()
                    const firstGate = (await Preferences.get({key: "first_gate"})).value
                    if (firstGate)
                        terminal7.ignoreAppEvents = true
                    this.session.connect(this.marker, publicKey, privateKey)
                } catch(e) {
                    terminal7.log("error connecting with keys", e)
                    this.handleFailure(Failure.KeyRejected)
                }
            } else
                this.session.connect(this.marker)
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
    onFormError(err) {
        this.t7.log("Form error:", err.message)
        this.t7.clearTempGates()
    }
    async updateNameE() {
        const e = this.nameE
        // ignores gate with no nameE
        if (!e || (e.children.length < 1))
            return
        this.map.update({
            e: e,
            name: this.name || this.addr,
            boarding: this.boarding,
            offline: this.online === false,
            unverified: this.fp?!this.verified:this.firstConnection,
            peerbook: this.fp != null,
        })
    }
    close() {
        this.e.classList.add("hidden")
        setTimeout(() => {
            this.clear()
            //TODO: find a bette way to test if open or not
            if (this == terminal7.activeG) {
                if (this.activeW)
                    this.t7.goHome()
                terminal7.activeG = null
            }
        }, 10)
        this.stopBoarding()
        if (this.session) {
            this.session.close()
            this.session = null
        }
    }
	
}
