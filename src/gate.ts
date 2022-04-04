/*! Terminal 8 Gate
 *  This file contains the code that makes a terminal 7 gate. The gate class
 *  represents a server and it may be boarding - aka connected - or not.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { Window } from './window.js'
import { Pane } from './pane.js'
import { Session } from './session'
import { WSSession } from './ws_session'
import { PeerbookSession } from './peerbook_session'

import { Storage } from '@capacitor/storage'

/*
 * The gate class abstracts a host connection
 */
export class Gate {
    session: Session
    constructor (props) {
        // given properties
        this.id = props.id
        // this shortcut allows cells to split without knowing t7
        this.addr = props.addr
        this.user = props.user
        this.secret = props.secret
        this.store = props.store
        this.name = (!props.name)?`${this.user}@${this.addr}`:props.name
        // 
        this.windows = []
        this.boarding = false
        this.lastMsgId = 0
        // a mapping of refrence number to function called on received ack
        this.breadcrumbs = []
        this.sendStateTask  = null
        this.timeoutID = null
        this.fp = props.fp
        this.online = props.online
        this.watchDog = null
        this.verified = props.verified || false
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
            this.openReset(t)
            t.querySelector(".add-tab").addEventListener(
                'click', _ => this.newTab())
            t.querySelector(".search-close").addEventListener('click', _ =>  {
                this.t7.logDisplay(false)
                this.activeW.activeP.exitSearch()
                this.activeW.activeP.focus()
            })
            t.querySelector(".search-up").addEventListener('click', _ =>
                this.activeW.activeP.findNext())

            t.querySelector(".search-down").addEventListener('click', _ => 
                this.activeW.activeP.findNext())
            /* TODO: handle the bang
            let b = t.querySelector(".bang")
            b.addEventListener('click', (e) => {new window from active pane})
            */
            this.e.appendChild(t)
        }
        // Add the gates' signs to the home page
        let hostsE = document.getElementById(this.fp?"peerbook-hosts":"static-hosts")
        let b = document.createElement('button'),
            addr = this.addr && this.addr.substr(0, this.addr.indexOf(":"))
        b.className = "text-button"
        this.nameE = b
        this.nameE.innerHTML = this.name || this.addr
        this.updateNameE()
        hostsE.appendChild(b)
        b.gate = this
    }
    delete() {
        this.t7.gates.splice(this.id, 1)
        this.t7.storeGates()
        // remove the host from the home screen
        this.nameE.parentNode.parentNode.remove()
    }
    editSubmit(ev) {
        let editHost = document.getElementById("edit-host")
        this.addr = editHost.querySelector('[name="hostaddr"]').value 
        this.name = editHost.querySelector('[name="hostname"]').value
        this.nameE.innerHTML = this.name || this.addr
        this.t7.storeGates()
        this.t7.clear()
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
            editHost.querySelector('[name="hostaddr"]').value = this.addr
            editHost.querySelector('[name="hostname"]').value = this.name
        }
        editHost.gate = this
        editHost.classList.remove("hidden")
    }
    focus() {
        this.t7.logDisplay(false)
        // hide the current focused gate
        document.getElementById("home-button").classList.remove("on")
        document.querySelectorAll(".pane-buttons").forEach(
            e => e.classList.remove("off"))
        let activeG = this.t7.activeG
        if (activeG) {
            activeG.e.classList.add("hidden")
        }
        this.t7.activeG = this
        this.e.classList.remove("hidden")
        this.e.querySelectorAll(".window").forEach(w => w.classList.add("hidden"))
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
    onSessionState(state: RTState) {
        this.t7.log(`updating ${this.name} state to ${state}`)
        this.notify("State: " + state)
        if (state == "connected") {
            this.t7.logDisplay(false)
            if (this.watchDog != null) {
                window.clearTimeout(this.watchDog)
                this.watchDog = null
            }
            this.boarding = true
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
            this.session.getPayload().then(layout => this.setLayout(layout))
        }
        else if (state == "disconnected") {
            // TODO: add warn class
            this.lastDisconnect = Date.now()
            this.setIndicatorColor(FAILED_COLOR)
        }
        else if ((state != "new") && (state != "connecting") && this.boarding) {
            // handle connection failures
            let now = Date.now()
            if (now - this.lastDisconnect > 100) {
                this.t7.onDisconnect(this)
                this.stopBoarding()
            } else
                this.t7.log("Ignoring a peer this.t7.cells.forEach(c => event after disconnect")
        }
    }
    /*
     * connect connects to the gate
     */
    connect() {
        // do nothing when the network is down
        // if we're already boarding, just focus
        if (this.boarding) {
            console.log("already boarding")
            if (!this.windows || (this.windows.length == 0))
                this.activeW = this.addWindow("", true)
            this.focus()
            
            return
        }
        this.notify("Initiating connection")
        // start the connection watchdog
        // TODO: move this to the session
        if (this.watchDog != null)
            window.clearTimeout(this.watchDog)
        this.watchDog = this.t7.run(_ => {
            this.watchDog = null
            this.stopBoarding()
            this.t7.onDisconnect(this)
        }, this.t7.conf.net.timeout)
        
        if (this.session == null)
            if (typeof this.fp == "string") {
                this.session = new PeerbookSession(this.fp)
            }
            else {
                this.session = new WSSession(this.addr, this.user)
            }
        this.session.onStateChange = state => this.onSessionState(state)
        this.session.onPayloadUpdate = layout => {
            this.notify("TBD: update new layout")
            console.log("TBD: update layouy", layout)
        }
        console.log("opening session")
        this.session.connect()
        /*
        this.connector = new webrtcConnector({fp: this.fp})
        this.connector.onError = msg => this.t7.onNoSignal(this, msg)
        this.connector.onWarning = msg => this.notify(msg)
        this.connector.onResize = () => this.panes().forEach(p => p.fit())
        this.connector.onStateChange = (state) => this.onSessionState(state)
        this.connector.connect()
        */
    }

    notify(message) {    
        this.t7.notify(`${this.name}: ${message}`)
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
    reset() {
        this.clear()
        this.setLayout(null)
    }
    setLayout(state: object) {
        if ((state == null) || !(state.windows instanceof Array) || (state.windows.length == 0)) {
            // create the first window and pane
            this.t7.log("Fresh state, creating the first pane")
            this.activeW = this.addWindow("", true)
        } else if (this.windows.length > 0) {
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
            })
        }

        if (!this.activeW)
            this.activeW = this.windows[0]
        this.focus()
        this.boarding = true
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
        console.log("Clearing gate")
        this.e.querySelector(".tabbar-names").innerHTML = ""
        this.e.querySelectorAll(".window").forEach(e => e.remove())
        if (this.activeW && this.activeW.activeP.zoomed)
            this.activeW.activeP.toggleZoom()
        this.windows = []
        this.breadcrumbs = []
        this.msgs = {}
        this.marker = -1
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
            lastState.fp = this.fp
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
               this.session.setPayload(this.dump()).then(() => {
                    if ((this.windows.length == 0) && (this.pc)) {
                        console.log("Closing gate after updating to empty state")
                        this.stopBoarding()
                        this.disengage()
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
    async restartServer() {
        this.clear()
        await this.disengage()
        let e = document.getElementById("reset-host")
        this.t7.ssh(e, this, `webexec restart --address ${this.addr}`,
            _ => e.classList.add("hidden")) 
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
        return new Promise(resolve => {
            this.t7.log(`disengaging. boarding ${this.boarding}`)
            if (!this.boarding || !this.session) {
                resolve()
                return
            }
            this.session.disconnect().then(resolve)
            this.boarding = false
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
    openReset(t) {
        //TODO: clone this from a template
        let e = document.getElementById("reset-gate-template")
        e = e.content.cloneNode(true)
        t.querySelector(".reset").addEventListener('click', _ => {
            this.e.querySelector(".reset-gate").classList.toggle("hidden")
        })
        e.querySelector(".sizes").addEventListener('click', _ => {
            this.notify("Resetting sizes")
            this.e.querySelector(".reset-gate").classList.toggle("hidden")
            this.panes().forEach(p => {
                if (!p.fit())
                    this.sendSize(p)
            })
        })
        e.querySelector(".channels").addEventListener('click', _ => {
            this.notify("Resetting data channels")
            this.e.querySelector(".reset-gate").classList.toggle("hidden")
            this.marker = 0
            this.panes().forEach(p => {
                p.d.close()
                p.openChannel({id: p.d.id})
            })
        })
        e.querySelector(".all").addEventListener('click', _ => {
            this.e.querySelector(".reset-gate").classList.toggle("hidden")
            this.stopBoarding()
            this.connect()
        })
        this.e.appendChild(e)
    }
    updateNameE() {
        this.nameE.innerHTML = this.name
        if (!this.fp) {
            // there's nothing more to update for static hosts
            return
        }
        if (this.verified)
            this.nameE.classList.remove("unverified")
        else
            this.nameE.classList.add("unverified")
        if (this.online)
            this.nameE.classList.remove("offline")
        else
            this.nameE.classList.add("offline")
    }
    /*
    SSHConnect(ev) {
        if (ev.candidate) {
            if (!this.SSHSession) {
                SSHPlugin.startSessionByPasswd({
                    hostname: "192.168.1.18",
                    port: 22,
                    username: "daonb",
                    password: "Quadra840AV"}, m => this.onSSHOutput(m)).then(ret => {
                        this.SSHSession = ret.session
                        SSHPlugin.startShell({pty: 6, session: ret.session}, m =>
                            this.SSHSendCandidate(ev)})
                    })
            } else 
                SSHSendCandidate(json.stringify(ev.candidate))

        } else
            console.log("no candidate", ev)
    }
    onSSHOutput(m) {
        console.log("got message", m)
    }
    SSHSendCandidate(can) {
        this.SSHSession.write
    }
    */
}
