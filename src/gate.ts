/* Terminal 7 Gate
  This file contains the code that makes a terminal 7 gate. The gate class
 *  represents a server and it may be boarding - aka connected - or not.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { Pane } from './pane'
import { T7Map } from './map'
import { Failure, Session, Marker } from './session'
import { SSHSession } from './ssh_session'
import { Terminal7 } from './terminal7'

import { Capacitor } from '@capacitor/core'
import { Clipboard } from '@capacitor/clipboard'
import { HTTPWebRTCSession, PeerbookSession, WebRTCSession, ControlMessage } from './webrtc_session'
import { SerializedWindow, Window } from './window'
import { Preferences } from '@capacitor/preferences'


const FAILED_COLOR = "red"
const TOOLBAR_HEIGHT = 93

export interface ServerPayload {
    height: number
    width: number
    windows: SerializedWindow[]
    active?: boolean
}

/*
 * The gate class abstracts a host connection
 */
export class Gate {
    activeW: Window
    addr: string
    boarding: boolean
    e: HTMLDivElement
    id: string
    marker: Marker
    name: string
    secret: string
    session: PeerbookSession | SSHSession | HTTPWebRTCSession | WebRTCSession | Session | null
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
    firstConnection: boolean
    fontScale: number
    fitScreen: boolean
    windows: Window[]
    breadcrumbs: Window[]
    sendStateTask?: number = null
    lastDisconnect?: number
    sshPort: number
    reconnectCount: number
    lastState: ServerPayload
    wasSSH: boolean | undefined
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
        this.breadcrumbs = []
        this.fp = props.fp
        // TODO: move t7 & map into props
        this.t7 = terminal7
        this.map = this.t7.map
        this.session = null
        this.onlySSH = props.onlySSH || false
        this.firstConnection = props.firstConnection || false
        this.fontScale = props.fontScale || 1
        this.fitScreen = false
        this.sshPort = props.sshPort || 22
        this.reconnectCount = 0
    }

    /*
     * Gate.open opens a gate element on the given element
     */
    open(e) {
        // create the gate element - holding the tabs, windows and tab bar
        this.e = document.createElement('div')
        this.e.className = "gate hidden"
        this.e.style.zIndex = "2"
        this.e.id = `gate-${this.id}`
        e.appendChild(this.e)
        // add the tab bar
        let t = document.getElementById("gate-template") as HTMLTemplateElement
        if (t) {
            t = t.content.cloneNode(true) as HTMLTemplateElement
            t.querySelector(".reset").addEventListener('click', ev => {
                this.t7.map.shell.runCommand("reset", [this.name])
                ev.preventDefault()
                ev.stopPropagation()
            })
            t.querySelector(".add-tab").addEventListener(
                'click', () => this.newTab())
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
        const gatesContainer = this.t7.e.querySelector('.gates-container')
        gatesContainer.classList.remove('hidden')
        terminal7.activeG = this
        this.boarding = true
        this.updateNameE()
        this.map.showLog(false)
        // hide the current focused gate
        document.getElementById("map-button").classList.remove("off")
        document.querySelectorAll(".pane-buttons").forEach(
            e => e.classList.remove("off"))
        if (this.activeW?.activeP?.zoomed)
            this.e.classList.add("hidden")
        else
            this.e.classList.remove("hidden")
        this.e.querySelectorAll(".window").forEach(w => {
            if (w != this.activeW.e)
                w.classList.add("hidden")
            else
                this.activeW.focus()
        })
        this.storeState()
    }
    // stops all communication null
    stopBoarding() {
        this.boarding = false
        this.updateNameE()
    }
    setIndicatorColor(color) {
            const e = this.e.querySelector(".tabbar-names") as HTMLElement
            e.style.setProperty("--indicator-color", color)
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
            this.load()
            this.onConnected()
        } else if (state == "disconnected") {
            // TODO: add warn class
            this.lastDisconnect = Date.now()
            // TODO: start the rain
            this.setIndicatorColor(FAILED_COLOR)
            if (terminal7.recovering)
                this.handleFailure(failure)
        } else if (state == "failed")  {
            this.handleFailure(failure)
        } else if (state == "gotlayout") {
            const layout = JSON.parse(this.session.lastPayload)
            this.setLayout(layout)
            this.onConnected()
        }
    }
    async handleSSHFailure() {
        const shell = this.map.shell
        terminal7.notify("⚠️ SSH Session might be lost")
        let toConnect: boolean
        try {
            toConnect = terminal7.pb.isOpen()?await shell.offerInstall(this, "I'm feeling lucky"):
                await shell.offerSub(this)
        } catch(e) {
            terminal7.log("offer & connect failed", e)
            return
        }
        if (toConnect) {
            try {
                await shell.runCommand("connect", [this.name])
            } catch(e) {
                console.log("connect failed", e)
            }
        }
        shell.printPrompt()
    }
    // handle connection failures
    async handleFailure(failure: Failure) {
        // KeyRejected and WrongPassword are "light failure"
        const shell = this.map.shell
        const closeSession = () => {
            if (this.session) {
                this.wasSSH = this.session.isSSH
                this.session.close()
                this.session = null
            }
        }
        // this.map.showLog(true)
        terminal7.log("handling failure", this.name, failure, terminal7.recovering)
        shell.stopWatchdog()
        switch ( failure ) {
            case Failure.WrongPassword:
                this.notify("Sorry, wrong password")
                await this.sshPassConnect()
                return
            case Failure.NotImplemented:
                closeSession()
                this.notify("Not Implemented. Please try again")
                return
            case Failure.Unauthorized:
                closeSession()
                this.map.shell.onUnauthorized(this)
                return

            case Failure.BadMarker:
                this.notify("Bad restore maker, starting fresh")
                this.marker = null
                closeSession()
                await this.connect()
                return

            case Failure.NoKey:
                this.notify("🔑 Disabled")
                await this.sshPassConnect()
                return

            case Failure.KeyRejected:
                this.handleRejectedKey()
                return

            case Failure.NotSupported:
                if (this.wasSSH) {
                    this.notify("SSH status unknown")
                } else
                    this.notify("WebRTC agent unreachable")
                break
                
            case Failure.BadRemoteDescription:
                this.notify("Connection Sync Error")
                break

            case Failure.DataChannelLost:
                this.notify("Data channel lost")
                break

            case undefined:
                this.notify("Lost Connection")
                break

            case Failure.FailedToConnect:
                const firstGate = (await Preferences.get({key: "first_gate"})).value === null
                if (firstGate && this.session?.isSSH) {
                    await this.sshPassConnect()
                    return
                } else {
                    this.notify("Failed to connect")
                }
                break

            case Failure.TimedOut:
                this.notify("🍒 Connection timed out")
                break

        }
        closeSession()
        if (!terminal7.isActive(this)){
            this.stopBoarding()
            return
        }
        if (this.firstConnection) {
            this.onFirstConnectionDisconnect()
            return
        }

        if (this.wasSSH) {
            await this.handleSSHFailure()
            return
        } 
        if (terminal7.recovering) {
            terminal7.log("retrying...")
            try {
                await this.reconnect()
            } catch (e) {
                terminal7.log("reconnect failed", e)
                this.notify("Reconnect failed: " + e)
            }
            return
        }

        let res: string
        try {
            res = await shell.runForm(shell.reconnectForm, "menu")
        } catch (err) { 
            terminal7.log("reconnect form failed", err)
        }
        if (res == "Reconnect") {
            shell.startWatchdog().then(() => this.handleFailure(Failure.TimedOut) )
            await this.connect()
            shell.stopWatchdog()
        } else {
            this.close()
            this.map.showLog(false)
        }
        shell.printPrompt()
    }

    async onFirstConnectionDisconnect() {
        const shell = this.map.shell
        let ans: string
        if (this.addr != 'localhost') {
            const verifyForm = [{
                prompt: `Does the address \x1B[1;37m${this.addr}\x1B[0m seem correct?`,
                    values: ["y", "n"],
                    default: "y"
            }]
            try {
                ans = (await shell.runForm(verifyForm, "text"))[0]
            } catch(e) {
                this.handleFailure(Failure.Aborted)
                return
            }

            if (ans == "n") {
                this.delete()
                setTimeout(() => shell.handleLine("add"), 100)
                return
            }
        }
        const installForm = [{
            prompt: "Have you installed the backend - webexec?",
                values: ["y", "n"],
                default: "n"
        }]
        try {
            ans = (await shell.runForm(installForm, "text"))[0]
        } catch(e) {
            this.handleFailure(Failure.Aborted)
        }

        if (ans == "n") {
            setTimeout(() => shell.handleLine("install "+this.name), 100)
            
        }
    }
    
    reconnect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const session = this.session
            const isSSH = session?session.isSSH:this.wasSSH
            const isNative = Capacitor.isNativePlatform()
            console.log(`reconnecting: # ${this.reconnectCount} ${(session===null)?"null session ":"has session "} \
                        ${isSSH?"is ssh":"is webrtc"}`)
            if (++this.reconnectCount > terminal7.conf.net.retries) {
                this.notify(`Reconnect failed after ${this.reconnectCount} attempts`)
                this.reconnectCount = 0
                return reject("retries exceeded")
            }
            if (session == null) {
                terminal7.log("reconnect with null session. connectin")
                if (this.tryPB)
                    this.connect().then(resolve).catch(reject)
                else
                    this.handleFailure(Failure.NotSupported)
                return
            }

            if (isSSH) {
                this.handleSSHFailure().then(resolve).catch(reject)
                return
            }

            const finish = layout => {
                this.setLayout(JSON.parse(layout) as ServerPayload)
                resolve()
            }
            if (!isNative) {
                this.session.reconnect(this.marker)
                .then(layout => finish(layout))
                .catch(e  => {
                    if (this.session) {
                        this.wasSSH = this.session.isSSH
                        this.session.close()
                        this.session = null
                    }
                    terminal7.log("reconnect failed:", e)
                    reject(e)
                })
                return
            }
            const closeSessionAndDisconnect = (e) => {
                if (this.session) {
                    this.wasSSH = this.session.isSSH
                    this.session.close()
                    this.session = null
                }
                this.t7.log("reconnect rejected", isSSH)
                reject(e)
            }
            this.t7.readId().then(({publicKey, privateKey}) => {
                this.session.reconnect(this.marker, publicKey, privateKey)
                .then(finish)
                .catch(e => {
                    if (this.session != session)
                        // session changed, ignore the failure
                        return
                    console.log("session reconnect failed", e)
                    this.reconnect().then(resolve).catch(reject)
                })
            }).catch(e => {
                this.t7.log("failed to read id", e)
                closeSessionAndDisconnect(e)
                this.t7.log("reconnect failed, calling the shell to handle it", isSSH, e)
                this.t7.notify(e)
            })
        })
    }
    async handleRejectedKey(): Promise<boolean> {
        const shell = this.map.shell
        let ret = false
        this.notify("🔑 Rejected")
        try {
            await this.sshPassConnect()
        } catch(e) {
            this.handleFailure(Failure.Aborted)
        }
        const keyForm = [
            { prompt: "Just let me in" },
            { prompt: "Copy command to clipboard" },
        ]
        let publicKey = ""  
        try {
            publicKey = (await terminal7.readId()).publicKey
        } catch (e) {
            terminal7.log("oops readId failed")
        }
        if (publicKey) {
            const cmd = `echo "${publicKey}" >> "$HOME/.ssh/authorized_keys"`
            shell.t.writeln(`\n To use the 🔑 instead of password run:\n\n\x1B[1m${cmd}\x1B[0m\n`)
            let res = ""
            try {
                res = await shell.runForm(keyForm, "menu")
            } catch (e) {}
            switch(res) {
                case "Copy command to clipboard":
                    Clipboard.write({ string: cmd })
                    ret = true
                    break
            }
            shell.map.showLog(false)
        }
        return ret
    }
    async sshPassConnect() {
        let password: string
        try {
            password = await this.map.shell.askPass()
        } catch (e) { 
            this.handleFailure(Failure.Aborted)
            return 
        }
        const session = this.session as SSHSession
        session.passConnect(this.marker, password)
    }
    /*
     * connect connects to the gate
     */
    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            document.title = `${this.name} :: Terminal7`
            
            if (this.session) {
                // TODO: check session's status
                this.reconnectCount=0
                resolve()
                return
            }
            this.onConnected = () => { 
                this.notify(`🥂  over ${this.session.isSSH?"SSH":"WebRTC"}`, true)
                this.map.shell.stopWatchdog()
                this.setIndicatorColor("unset")
                resolve()
            }
            this.completeConnect()
            .then(resolve)
            .catch(e => {
                this.notify(`Connection failed: ${e}`)
                reject(e)
            }).finally(() => {
                this.reconnectCount=0
                this.updateNameE()
            })
        })
    }

    notify(message, dontShow = false) {
        const prefix = this.name || this.addr || ""
        message = `\x1B[4m${prefix}\x1B[0m: ${message}`
        this.t7.notify(message, dontShow)
    }
    /*
     * returns an array of panes
     */
    panes(): Pane[] {
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
    setLayout(state: ServerPayload | null = null) {
        terminal7.log("in setLayout", state)
        this.lastState = state
        const winLen = this.windows.length
        if ((state == null) || !(state.windows instanceof Array) || (state.windows.length == 0)) {
            // create the first window and pane
            this.t7.log("Fresh state, creating the first pane")
            this.clear()
            this.activeW = this.addWindow("", true)
        } else {
            if (winLen > 0) {
                this.t7.log("Restoring to an existing layout")
                this.syncLayout(state)
                this.panes().forEach(p => p.openChannel({id: p.channelID}))
            } else {
                this.t7.log("Setting layout: ", state)
                this.clear()
                state.windows.forEach(w =>  {
                    const win = this.addWindow(w.name, false, w.id)
                    if (w.active) 
                        this.activeW = win
                    win.restoreLayout(w.layout, w.active)
                    win.nameE?.setAttribute("href", `#pane-${win.activeP?.id}`)
                })
            }
        }

        if (!this.activeW)
            this.activeW = this.windows[0]
        // wait for the sizes to settle and update the server if needed
        setTimeout(() => {
            this.panes().forEach((p, i) => {
                if (p.d) {
                    if (p.needsResize && this.fitScreen) {
                        this.t7.run(() => p.d.resize(p.t.cols, p.t.rows), i*10)
                        p.needsResize = false
                    }
                }
            })
            this.updateNameE()
        }, 200)
        this.scaleContainer(state?.width, state?.height)
        this.focus()
    }
    // scaleContainer scales the container to fit the screen, defaulting to 100%
    scaleContainer(width?, height?) {
        const container = this.e.querySelector(".windows-container") as HTMLDivElement
        if (this.fitScreen) {
            container.style.width = "100%"
            container.style.removeProperty("height")
            this.fontScale = 1
            container.style.top = "0"
            container.style.left = "0"
            container.style.removeProperty("transform")
            return
        }
        if (!width || !height) {
            width = document.body.clientWidth
            height = document.body.clientHeight - TOOLBAR_HEIGHT
        }
        const maxWidth = document.body.clientWidth,
            maxHeight = document.body.clientHeight - TOOLBAR_HEIGHT
        const sx = maxWidth / width,
            sy = maxHeight / height
        const scale = Math.min(sx, sy, 1),
              scaledWidth = width * scale,
              scaledHeight = height * scale
       container.style.width = `${scaledWidth}px`
       container.style.height = `${scaledHeight}px`
       container.style.left = (maxWidth - scaledWidth) / 2 + "px"
       container.style.top = (maxHeight - scaledHeight) / 2 + "px"
       this.fontScale = scale
    }
    syncLayout(state: ServerPayload) {
        this.lastState = state
        this.scaleContainer(state.width, state.height)
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
        if (this.activeW?.activeP?.zoomed)
            this.activeW.activeP.unzoom()
        this.windows = []
        this.breadcrumbs = []
        this.t7.cells.forEach((c, i, cells) => {
            if (c instanceof Pane && (c.gate == this))
                cells.splice(i, 1)
        })
    }
    /*
     * dump dumps the host to a state object
     * */
    dump(): ServerPayload {
        const windows = []
        this.windows.forEach(w => {
            const win: SerializedWindow = {
                name: w.name,
                id: w.id,
                layout: w.dump(),
            }
            if (w == this.activeW)
                win.active = true
            windows.push(win)
        })
        const container = this.e.querySelector(".windows-container") as HTMLDivElement
        return { windows: windows,
                 width: container.clientWidth,
                 height: container.clientHeight }
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
        if ((this.sendStateTask != null) || !this.session || !this.fitScreen)
            return
       // @ts-ignore
        this.sendStateTask = setTimeout(() => {

           this.sendStateTask = null

           if (!this.session)
               return

           if (this.panes().every(p => p.channelID))
               this.session.setPayload(this.dump()).then(() => {
                    if ((this.windows.length == 0) && (this.session != null)) {
                        this.t7.log("Closing gate after updating to empty state")
                        this.marker = null
                        this.close()
                    }
               })
            else
                this.sendState()
        }, 100)// TODO: make it run when the update is done and all channels opened
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
    disengage(): Promise<void> {
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
    
    // tryPB is an accessor that returns true if the gate is a peerbook gate
    get tryPB() {
        return this.fp && !this.onlySSH && this.online && this.verified
    }
    // get new session returns a new session
    // if the gate is a peerbook gate it's a peerbook session
    // otherwise it's a WHIP or SSH session
    newSession() {
        const isNative = Capacitor.isNativePlatform()
        if (this.tryPB) {
            this.notify("🎌  PeerBook")
            return new PeerbookSession(this.fp)
        } else if (isNative) {
            this.notify("🖇️ Over SSH")
            return new SSHSession(this.addr, this.username, this.sshPort)
        } else {    
            this.notify("🎌  WebExec WHIP server")
            const addr = `http://${this.addr}:7777/offer`
            return new HTTPWebRTCSession(addr)
        }
    }
    async completeConnect(): Promise<void> {
        if (this.session)
            this.session.close()
        this.session = this.newSession()
        this.session.onStateChange = (state, failure?) => this.onSessionState(state, failure)
        this.session.onCMD = (msg: ControlMessage) => {
            // cast session to WebRTCSession
            //
            // @ts-ignore
            // eslint-disable-next-line
            const container = this.e.querySelector(".windows-container") as HTMLDivElement
            const session = this.session as WebRTCSession
            switch (msg.type) {
                case "set_payload":
                    const layout = msg.args["payload"]
                    this.fitScreen = (container.clientWidth == layout.width) && (container.clientHeight == layout.height)
                    this.setLayout(layout)
                    break
                case "get_clipboard":
                    Clipboard.read().then(cb => {
                        if (cb.type != 'text/plain') {
                            this.t7.log("clipboard is not text")
                            return
                        }
                        session.sendCTRLMsg(
                            new ControlMessage("ack", {ref: msg.message_id, body: cb.value}))
                    }).catch(e => {
                        // when the clipboard is empty send an ack with an empty body
                        if (e.message.includes("no data"))
                            session.sendCTRLMsg(
                                new ControlMessage("ack", {ref: msg.message_id, body: ""}))
                        else
                            session.sendCTRLMsg(
                                new ControlMessage("nack", {ref: msg.message_id, body: e.message}))
                    })
                    break
                case "set_clipboard":
                    if (msg.args["mimetype"].startsWith("text"))
                        Clipboard.write({string: msg.args["data"]})
                    else
                        Clipboard.write({image: msg.args["data"]})
                    session.sendCTRLMsg(new ControlMessage("ack", {ref: msg.message_id}))
                    break
                default:
                    this.t7.log('got unknown message', msg)
            }
        }
        this.t7.log("opening session")
        if (this.session.isSSH) {
            let publicKey: string, privateKey: string
            try {
                ({ publicKey, privateKey } = await this.t7.readId())
            } catch(e) {
                this.t7.notify(e)
                this.handleFailure(Failure.NoKey)
                return
            }
            const firstGate = (await Preferences.get({key: "first_gate"})).value
            if (firstGate)
                terminal7.ignoreAppEvents = true

            const session = this.session as SSHSession
            try {
                await session.connect(this.marker, publicKey, privateKey)
            } catch(e) {
                terminal7.log("error connecting with keys", e)
                this.handleFailure(Failure.KeyRejected)
            } finally {
                terminal7.ignoreAppEvents = false
            }
            return
        }
        await this.session.connect(this.marker)
    }
    load() {
        this.t7.log("loading gate")
        this.session.getPayload().then((payload: string) => {
            let layout: ServerPayload | null = null
            try {
                layout = JSON.parse(payload)
            } catch(e) {
                layout = null
            }
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
            online: this.session!=null,
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
        if (this.session) {
            this.wasSSH = this.session.isSSH
            this.session.close()
            this.session = null
        }
        this.stopBoarding()
    }
    setFitScreen() {
        this.fitScreen = true
        this.scaleContainer()
        this.panes().forEach(p => {
            p.scaleCanvas()
            p.dividers.forEach(d => d.classList.remove("hidden"))
        })
        this.fit()
        this.sendState()
    }
    blur() {
        this.e.classList.add("hidden")
    }
    onResize() {
        if (this.fitScreen) {
            this.panes().forEach(p => {
                if (!p.transit)
                    if (p.zoomed)
                        p.styleZoomed()
                    else
                        p.fit()
            })
        } else if (this.lastState) {
            this.scaleContainer(this.lastState.width, this.lastState.height)
            this.panes().forEach(p => p.scaleCanvas())
        }
    }
}
