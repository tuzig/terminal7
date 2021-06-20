/*! Terminal 7 Gate
 *  This file contains the code that makes a terminal 7 gate. The gate class
 *  represents a server and it may be boarding - aka connected - or not.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import * as Hammer from 'hammerjs'
import { Window } from './window.js'
import { Pane } from './pane.js'

import { Plugins } from '@capacitor/core'
const { Browser, Clipboard, Storage } = Plugins
const ABIT    = 10  // ashort period of time, in milli

/*
 * The gate class abstracts a host connection
 */
export class Gate {
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
        this.pc = null
        this.windows = []
        this.boarding = false
        this.pendingCDCMsgs = []
        this.lastMsgId = 0
        // a mapping of refrence number to function called on received ack
        this.onack = {}
        this.breadcrumbs = []
        this.updateID  = null
        this.timeoutID = null
        this.msgs = {}
        this.marker = -1
        this.fp = props.fp
        this._online = props.online
        this.watchDog = null
    }
    get online() {
        return this._online
    }
    set online(v) {
        if (v)
            this.nameE.parentNode.parentNode.classList.remove("offline")
        else
            this.nameE.parentNode.parentNode.classList.add("offline")
        this._online = v
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
                terminal7.logDisplay(false)
                this.activeW.activeP.exitCopyMode()
                this.activeW.activeP.focus()
            })
            t.querySelector(".search-up").addEventListener('click', _ =>
                this.activeW.activeP.findNext(
                    this.e.querySelector("input[name='search-term']").value))

            t.querySelector(".search-down").addEventListener('click', _ => 
                this.activeW.activeP.findPrevious(
                    this.e.querySelector("input[name='search-term']").value))
            /* TODO: handle the bang
            let b = t.querySelector(".bang")
            b.addEventListener('click', (e) => {new window from active pane})
            */
            this.e.appendChild(t)
        }
        // Add the gates' signs to the home page
        let hostsE = document.getElementById("hosts")
        let li = document.createElement('li'),
            a = document.createElement('a'),
            addr = this.addr && this.addr.substr(0, this.addr.indexOf(":"))
        a.addEventListener("click", ev => {
            if (this.online == false)
                terminal7.notify(`\uD83D\uDCD6 ${this.name} is offline`)
            else
                this.connect()
        })
        li.classList.add("border")
        this.nameE = document.createElement('h1')
        this.nameE.innerHTML = this.name || this.addr
        a.appendChild(this.nameE)
        if (this.online == false)
            li.classList.add("offline")
        li.appendChild(a)
        hostsE.prepend(li)
        // TODO: find a cleaner way to transfer the gate to the touch listener
        li.gate = this
        a.gate = this
        this.nameE.gate = this
    }
    delete() {
        terminal7.gates.splice(this.id, 1)
        terminal7.storeGates()
        // remove the host from the home screen
        this.nameE.parentNode.parentNode.remove()
    }
    editSubmit(ev) {
        let editHost = document.getElementById("edit-host")
        this.addr = editHost.querySelector('[name="hostaddr"]').value 
        this.name = editHost.querySelector('[name="hostname"]').value
        this.nameE.innerHTML = this.name || this.addr
        terminal7.storeGates()
        terminal7.clear()
    }
    /*
     * edit start the edit-host user-assitance
     */
    edit() {
        if (typeof(this.fp) == "string") {
            this.notify("Got peer from \uD83D\uDCD6, connect only")
            return
        }
        let editHost = document.getElementById("edit-host")
        editHost.gate = this
        editHost.querySelector('[name="hostaddr"]').value = this.addr
        editHost.querySelector('[name="hostname"]').value = this.name
        editHost.classList.remove("hidden")
    }
    focus() {
        // first hide the current focused gate
        document.getElementById("home-button").classList.remove("on")
        document.getElementById("trash-button").classList.remove("off")
        document.getElementById("search-button").classList.remove("off")
        let activeG = terminal7.activeG
        if (activeG) {
            activeG.e.classList.add("hidden")
        }
        terminal7.activeG = this
        this.e.classList.remove("hidden")
        this.e.querySelectorAll(".window").forEach(w => w.classList.add("hidden"))
        this.activeW.focus()
    }
    // stops all communication 
    stopBoarding() {
        if (!this.boarding)
            return
        // clear all pending messages
        for (var id in this.msgs) {
            window.clearTimeout(this.msgs[id])
            delete this.msgs[id]
        }
        this.boarding = false
        document.getElementById("downstream-indicator").classList.add("failed")
    }
    /*
     * updateConnectionState(state) is called on peer connection
     * state changes.
     */
    updateConnectionState(state) {
        terminal7.log(`updating ${this.name} state to ${state}`)
        if (state == "connected") {
            this.notify("Connected")
            if (this.watchDog != null) {
                window.clearTimeout(this.watchDog)
                this.watchDog = null
            }
            if (terminal7.ws != null)
                terminal7.ws.close()
            this.boarding = true
            document.getElementById("downstream-indicator").classList.remove("failed")
            var m = this.e.querySelector(".disconnect")
            if (m != null) m.remove()
            // show help for first timer
            Storage.get({key: "first_gate"}).then(v => {
                if (v.value != "1") {
                    terminal7.run(terminal7.toggleHelp, 1000)
                    Storage.set({key: "first_gate", value: "1"}) 
                }
            })
        }
        else if (state == "disconnected") {
            // TODO: add warn class
            this.notify("WebRTC disconnected and may reconnect or close")
            this.lastDisconnect = Date.now()
            document.getElementById("downstream-indicator").classList.add("failed")
        }
        else if ((state != "new") && (state != "connecting") && this.boarding) {
            // handle connection failures
            let now = Date.now()
            if (now - this.lastDisconnect > 100) {
                this.notify("WebRTC closed")
                this.stopBoarding()
                terminal7.onDisconnect(this)
            } else
                terminal7.log("Ignoring a peer terminal7.cells.forEach(c => event after disconnect")
        }
    }
    /*
     * clearLog cleans the log and the status modals
     */
    clearLog() {
        /*
        this.log.forEach(m => m.remove())
        this.log = []
        */
        // hide the disconnect modal
        // document.getElementById("disconnect-modal").classList.add("hidden")
        document.getElementById("log").classList.add("hidden")
    }
    /*
     * peerConnect connects the webrtc session with the peer
     */
    peerConnect(offer) {
        this.notify("Connecting")
        let sd = new RTCSessionDescription(offer)
        this.pc.setRemoteDescription(sd)
            .catch (e => {
                this.notify(`Failed to set remote description: ${e}`)
                this.stopBoarding()
                terminal7.onDisconnect(this)
            })
    }
    /*
     * connect opens a webrtc peer connection to the host and then opens
     * the control channel and authenticates.
     */
    connect() {
        // do nothing when the network is down
        if (!terminal7.netStatus || !terminal7.netStatus.connected)
            return
        // if we're already boarding, just focus
        if (this.boarding) {
            if (this.windows.length == 0)
                this.activeW = this.addWindow("", true)
            this.focus()
            return
        }
        this.boarding = true
        terminal7.log(`connecting to ${this.name}...`)
        // cleanup
        this.pendingCDCMsgs = []
        this.disengagePC()
        // exciting times.... a connection is born!
        this.pc = new RTCPeerConnection({
            iceServers: [ { urls: terminal7.conf.net.iceServer }],
            certificates: terminal7.certificates})
        this.pc.onconnectionstatechange = e =>
            this.updateConnectionState(this.pc.connectionState)

        let offer = ""
        this.pc.onicecandidate = ev => {
            if (typeof(this.fp) == "string") {
                if (ev.candidate) {
                    terminal7.pbSend({target: this.fp, candidate: ev.candidate})
                    if (this.watchDog != null)
                        window.clearTimeout(this.watchDog)
                    this.watchDog = terminal7.run(_ => {
                        this.watchDog = null
                        terminal7.onDisconnect(this)
                    }, terminal7.conf.net.timeout)
                }
            } else if (!ev.candidate) {
                offer = btoa(JSON.stringify(this.pc.localDescription))
                this.notify("Sending connection request")
                fetch('http://'+this.addr+'/connect', {
                    headers: {"Content-Type": "application/json"},
                    method: 'POST',
                    body: JSON.stringify({api_version: 0,
                        offer: offer,
                        fingerprint: terminal7.getFingerprint()
                    })
                }).then(response => {
                    if (response.status == 401)
                        throw new Error('unautherized');
                    if (!response.ok)
                        throw new Error(
                          `HTTP POST failed with status ${response.status}`)
                    return response.text()
                }).then(data => {
                    if (!this.verified) {
                        this.verified = true
                        // TODO: store when making real changes
                        // terminal7.storeGates()
                    }
                    var answer = JSON.parse(atob(data))
                    this.peerConnect(answer)
                }).catch(error => {
                    if (error.message == 'unautherized') 
                        this.copyFingerprint()
                    else {
                        this.notify(`HTTP POST to ${this.addr} failed: ${error}`)
                        terminal7.onNoSignal(this)
                    }
                 })
            } 
        }
        this.pc.onnegotiationneeded = e => {
            terminal7.log("on negotiation needed", e)
            this.pc.createOffer().then(d => {
                this.pc.setLocalDescription(d)
                if (typeof(this.fp) == "string") {
                    offer = btoa(JSON.stringify(d))
                    terminal7.log("got offer", offer)
                    terminal7.pbSend({target: this.fp, offer: offer})
                }
            })
        }
        this.openCDC()

        if (this.marker == -1)
            this.getLayout()
        else
            this.setMarker()
    }
    notify(message) {    
        terminal7.notify(`${this.name}: ${message}`)
    }
    /*
     * sencCTRLMsg gets a control message and sends it if we have a control
     * channel open or adds it to the queue if we're early to the party
     */
    sendCTRLMsg(msg) {
        if (!this.boarding)
            return
        const timeout = parseInt(terminal7.conf.net.timeout),
              retries = parseInt(terminal7.conf.net.retries),
              now = Date.now()
        // helps us ensure every message gets only one Id
        if (msg.message_id === undefined) 
            msg.message_id = this.lastMsgId++
        // don't change the time if it's a retransmit
        if (msg.time == undefined)
            msg.time = Date.now()
        if (!this.cdc || this.cdc.readyState != "open")
            this.pendingCDCMsgs.push(msg)
        else {
            // message stays frozen when retrting
            const s = msg.payload || JSON.stringify(msg)
            terminal7.log("sending ctrl message ", s)
            if (msg.tries == undefined) {
                msg.tries = 0
                msg.payload = s
            } else if (msg.tries == 1)
                this.notify(
                     `msg #${msg.message_id} no ACK in ${timeout}ms, trying ${retries-1} more times`)
            if (msg.tries++ < retries) {
                terminal7.log(`sending ctrl msg ${msg.message_id} for ${msg.tries} time`)
                try {
                    this.cdc.send(s)
                } catch(err) {
                    this.notify(`Sending ctrl message failed: ${err}`)
                }
                this.msgs[msg.message_id] = terminal7.run(
                      () => this.sendCTRLMsg(msg), timeout)
            } else {
                this.notify(
                     `#${msg.message_id} tried ${retries} times and given up`)
            }
        }
        return msg.message_id
    }
    setMarker() {
        let msgId = this.sendCTRLMsg({type: "restore",
                                      args: { marker: this.marker }})
        this.onack[msgId] = (isNack, state) => {
            if (isNack) {
                this.notify("Failed to restore from marker")
                this.getLayout()
            }
            else {
                this.restoreState(state)
                terminal7.run(_ => {
                    this.marker = -1
                    terminal7.log("resotre done, fitting peers")
                    this.panes().forEach(p => p.fit())
                }, 100)
            }
        }
    }
    /*
     * getLayout sends the get_payload and restores the state once it gets it
     */
    getLayout() {
        let msgId = this.sendCTRLMsg({
            type: "get_payload",
            args: {}
        })
        this.onack[msgId] = (isNack, state) => {
            if (isNack) {
                this.notify("FAILED to get payload")
                this.marker = -1
                this.restoreState({})
            } else {
                this.restoreState(state)
                terminal7.run(_ => this.marker = -1, 100)
            }
        }
    }
    /*
     * returns an array of panes
     */
    panes() {
        var r = []
        terminal7.cells.forEach(c => {
            if (c instanceof Pane && (c.gate == this))
                r.push(c)
        })
        return r
    }
    reset() {
        this.clear()
        this.restoreState(null)
    }
    restoreState(state) {
        if ((this.marker != -1) && (this.windows.length > 0)) {
            // if there's a marker it's a reconnect, re-open all gate's dcs
            // TODO: validate the current layout is like the state
            terminal7.log("Restoring with marker, open dcs")
            this.panes().forEach(p => p.openDC())
        } else if (state && (state.windows.length > 0)) {
            terminal7.log("Restoring layout: ", state)
            this.clear()
            state.windows.forEach(w =>  {
                let win = this.addWindow(w.name)
                win.restoreLayout(w.layout)
                if (w.active) {
                    this.activeW = win
                }
            })
        } else if ((state == null) || (state.windows.length == 0)) {
            // create the first window and pane
            terminal7.log("Fresh state, creating the first pane")
            this.activeW = this.addWindow("", true)
        }
        else
            terminal7.log(`not restoring. ${state}, ${wl}`)

        if (!this.activeW)
            this.activeW = this.windows[0]
        this.focus()
    }
    /*
     * Adds a window, opens it and returns it
     */
    addWindow(name, createPane) {
        terminal7.log(`adding Window: ${name}`)
        let id = this.windows.length
        let w = new Window({name:name, gate: this, id: id})
        this.windows.push(w)
        if (this.windows.length >= terminal7.conf.ui.max_tabs)
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
     * openCDC opens the control channel and handle incoming messages
     */
    openCDC() {
        var cdc = this.pc.createDataChannel('%')
        this.cdc = cdc
        terminal7.log("<opening cdc")
        cdc.onopen = () => {
            if (this.pendingCDCMsgs.length > 0)
                // TODO: why the time out? why 100mili?
                terminal7.run(() => {
                    terminal7.log("sending pending messages:", this.pendingCDCMsgs)
                    this.pendingCDCMsgs.forEach((m) => this.sendCTRLMsg(m), ABIT)
                    this.pendingCDCMsgs = []
                }, 100)
        }
        cdc.onmessage = m => {
            const d = new TextDecoder("utf-8"),
                  msg = JSON.parse(d.decode(m.data))

            // handle Ack
            if ((msg.type == "ack") || (msg.type == "nack")) {
                let i = msg.args.ref
                window.clearTimeout(this.msgs[i])
                delete this.msgs[i]
                const handler = this.onack[i]
                terminal7.log("got cdc message:",  msg)
                if (msg.type == "nack") {
                    document.getElementById("downstream-indicator").classList.add("failed")
                    this.nameE.classList.add("failed")
                }
                else {
                    document.getElementById("downstream-indicator").classList.remove("failed")
                    this.nameE.classList.remove("failed")
                }
                if (handler != undefined) {
                    handler(msg.type=="nack", msg.args.body)
                    // just to make sure we'll never  call it twice
                    delete this.onack[msg.args.ref]
                }
                else
                    terminal7.log("Got a cdc ack with no handler", msg)
            }
        }
        return cdc
    }
    /*
     * clear clears the gates memory and display
     */
    clear() {
        console.trace("Clearing gate")
        this.e.querySelector(".tabbar-names").innerHTML = ""
        this.e.querySelectorAll(".window").forEach(e => e.remove())
        this.windows = []
        this.breadcrumbs = []
        this.msgs = {}
        this.marker = -1
    }
    /*
     * disengagePC silently removes all event handler from the peer connections
     */
    disengagePC() {
        if (this.pc != null) {
            this.pc.onconnectionstatechange = undefined
            this.pc.onmessage = undefined
            this.pc.onnegotiationneeded = undefined
            terminal7.log("Gate disengaged")
            this.pc = null
        }
    }
    /*
     * Host.sendSize sends a control message with the pane's size to the server
     */
    sendSize(pane) {
        if ((this.pc != null) && pane.webexecID)
            this.sendCTRLMsg({
                type: "resize", 
                args: {
                       pane_id: pane.webexecID,
                       sx: pane.t.cols,
                       sy: pane.t.rows
                }
            })
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
    sendState() {
        if (this.updateID == null)
            this.updateID = terminal7.run(_ => { 
                let msg = {
                    type: "set_payload", 
                    args: { Payload: this.dump() }
                }
                this.updateID = null
                this.sendCTRLMsg(msg)
            }, 100)
    }
    onPaneConnected(pane) {
        // hide notifications
        terminal7.logDisplay(false)
        //enable search
        document.getElementById("search-button").classList.remove("off")
        document.getElementById("trash-button").classList.remove("off")
    }
    copyFingerprint() {
        let ct = document.getElementById("copy-fingerprint"),
            addr = this.addr.substr(0, this.addr.indexOf(":")),
            fp =  terminal7.getFingerprint()
        document.getElementById("ct-address").innerHTML = addr
        document.getElementById("ct-name").innerHTML = this.name
        ct.querySelector('[name="fingerprint"]').value = fp
        ct.classList.remove("hidden")
        ct.querySelector(".copy").addEventListener('click', ev => {
            ct.classList.add("hidden")
            Clipboard.write(
                {string: ct.querySelector('[name="fingerprint"]').value})
            this.notify("Fingerprint copied to the clipboard")
        })
        ct.querySelector("form").addEventListener('submit', ev => {
            ev.preventDefault()
            terminal7.ssh(ct,  this,
                `cat <<<"${fp}" >> ~/.webexec/authorized_tokens`,
                _ => {
                    ct.classList.add("hidden")
                    this.connect()
                })
        })
 
        ct.querySelector(".close").addEventListener('click',  ev =>  {
            ct.classList.add("hidden")
        })
    }
    goBack() {
        var w = this.breadcrumbs.pop()
        this.breadcrumbs = this.breadcrumbs.filter(x => x != w)
        if (this.windows.length == 0) {
            this.clear()
            terminal7.goHome()
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
    restartServer() {
        this.clear()
        this.disengagePC()
        let e = document.getElementById("reset-host")
        terminal7.ssh(e, this, `webexec restart --address ${this.addr}`,
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
    disengage(cb) {
        terminal7.log(`disengaging. boarding ${this.boarding}`)
        if (!this.boarding) {
            if (cb) cb()
            return
        }
        let msg = {
                type: "mark",
                args: null
            },
            id = this.sendCTRLMsg(msg)

        // signaling restore is in progress
        this.marker = 0
        this.boarding = false
        this.onack[id] = (nack, payload) => {
            this.marker = parseInt(payload)
            terminal7.log("got a marker", this.marker)
            if (cb) cb()
        }
    }
    closeActivePane() {
        this.activeW.activeP.close()
    }
    newTab() {
        if (this.windows.length < terminal7.conf.ui.max_tabs) {
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
                p.openDC()
            })
        })
        e.querySelector(".all").addEventListener('click', _ => {
            this.e.querySelector(".reset-gate").classList.toggle("hidden")
            this.stopBoarding()
            this.connect()
        })
        this.e.appendChild(e)
    }
}
