import * as Hammer from 'hammerjs'
import { Window } from './window.js'
import { formatDate } from './utils.js'

const ABIT    = 10,  // ashort period of time, in milli
      TIMEOUT = 3000

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
        this.lastMsgId = 1
        // a mapping of refrence number to function called on received ack
        this.onack = {}
        this.breadcrumbs = []
        this.peer = null
        this.updateID  = null
        this.timeoutID = null
    }

    /*
     * Gate.open opens a gate element on the given element
     */
    open(e) {
        // create the gate element - holding the tabs, windows and tab bar
        this.e = document.createElement('div')
        this.e.className = "gate"
        this.e.style.zIndex = 2
        this.e.id = `gate-${this.id}`
        e.appendChild(this.e)
        // add the tab bar
        let t = document.getElementById("tabbar-template")
        if (t) {
            t = t.content.cloneNode(true)
            let a = t.querySelector(".add-tab")
            a.addEventListener('click', (e) => {
                let w = this.addWindow()
                w.focus()
            })
            /* TODO: handle the bang
            let b = t.querySelector(".bang")
            b.addEventListener('click', (e) => {new window from active pane})
            */
            this.e.appendChild(t)
        }
        if (!this.store)  {
            this.nameE = null
            return
        }
        // Add the gates' signs to the home page
        let plusHost = document.getElementById("plus-host")
        let li = document.createElement('li'),
            a = document.createElement('a'),
            addr = this.addr && this.addr.substr(0, this.addr.indexOf(":"))
        li.classList.add("border")
        this.nameE = document.createElement('h1')
        this.nameE.innerHTML = this.name || this.addr
        a.appendChild(this.nameE)
        // Add gestures on the window name for rename and drag to trash
        let hm = new Hammer.Manager(li, {})
        hm.options.domEvents = true; // enable dom events
        hm.add(new Hammer.Press({event: "edit", pointers: 1}))
        hm.add(new Hammer.Tap({event: "connect", pointers: 1}))
        hm.on("edit", (ev) => console.log("TODO: add host editing"))
        hm.on("connect", (ev) => this.connect())
        li.appendChild(a)
        // use prepend to keep the "+" last
        plusHost.parentNode.prepend(li)
    }
    unfocus() {
        this.e.classList.add("hidden")
    }
    focus() {
        // first hide the current focused gate
        let activeG = terminal7.activeG
        if (activeG) {
            activeG.e.classList.add("hidden")
        }
        this.e.classList.remove("hidden")
        terminal7.activeG = this
        if (this.activeW)
            this.activeW.focus()
        let s = document.getElementById("home-button")
        s.classList.remove("off")
    }
    stopBoarding() {
        if (!this.boarding)
            return
        this.boarding = false
        document.getElementById("downstream-indicator").classList.add("failed")
        terminal7.onDisconnect(this)
    }
    startBoarding() {
        this.boarding = true
        document.getElementById("downstream-indicato").classList.remove("failed")
    }
    /*
     * updateConnectionState(state) is called on peer connection
     * state changes.
     */
    updateConnectionState(state) {
        if ((state == "new") || (state == "connecting"))
            this.notify("WebRTC starting")
        else if (state == "connected") {
            this.notify("WebRTC connected")
            this.startBoarding()
        }
        else if (state == "disconnected")
            // TODO: add warn class
            this.notify("WebRTC disconnected and may reconnect or close")
        else if (this.boarding) {
            this.stopBoarding()
            this.notify("WebRTC closed")
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
        let sd = new RTCSessionDescription(offer)
        this.notify("Setting remote description") // TODO: add a var or two
        this.pc.setRemoteDescription(sd)
            .catch (e => {
                this.notify(`Failed to set remote description: ${e}`)
                this.stopBoarding()
            })
    }
    /*
     * connect opens a webrtc peer connection to the host and then opens
     * the control channel and authenticates.
     */
    connect() {
        // if we're already boarding, just focus
        if (this.boarding) {
            this.focus()
            return
        }
        this.pendingCDCMsgs = []
        console.log(`connecting to ${this.name}...`)
        // TODO: do we need the next 3 lines?
        if (this.pc != null) {
            this.pc.close()
        }
        this.pc = new RTCPeerConnection({ iceServers: [
                  { urls: 'stun:stun2.l.google.com:19302' }
                ] })
        this.pc.onconnectionstatechange = e =>
            this.updateConnectionState(this.pc.connectionState)

        let offer = ""
        this.pc.onicecandidate = ev => {
            if (ev.candidate && !offer) {
              offer = btoa(JSON.stringify(this.pc.localDescription))
              this.notify("Sending connection request")
              fetch('http://'+this.addr+'/connect', {
                headers: {"Content-Type": "plain/text"},
                method: 'POST',
                body: offer
              }).then(response => response.text())
                .then(data => {
                    this.peer = JSON.parse(atob(data))
                    this.peerConnect(this.peer)
                }).catch(error => {
                    this.notify(`HTTP POST failed: ${error.message}`)
                    terminal7.onDisconnect(this)
                 })
            } 
        }
        this.pc.onnegotiationneeded = e => {
            console.log("on negotiation needed", e)
            this.pc.createOffer().then(d => this.pc.setLocalDescription(d))
        }
        this.openCDC()
        // authenticate starts the ball rolling
        this.authenticate()
    }
    /*
     * noitify adds a message to the host's log
     */
    notify(message) {    
        let ul = document.getElementById("log-msgs"),
            li = document.createElement("li"),
            d = new Date(),
            t = formatDate(d, "HH:mm:ss.fff")

        let lines = ul.querySelectorAll('li')
        if (lines.length > terminal7.conf.indicators.log_lines)
            lines[0].remove()
        li.innerHTML = `<time>${t}</time> ${message}`
        li.classList = "log-msg"
        ul.appendChild(li)
        terminal7.logDisplay(true)
    }
    /*
     * sencCTRLMsg gets a control message and sends it if we have a control
     * channle open or adds it to the queue if we're early to the part
     */
    sendCTRLMsg(msg) {
        // helps us ensure every message gets only one Id
        if (msg.message_id === undefined) 
            msg.message_id = this.lastMsgId++
        // don't change the time if it's a retransmit
        if (msg.time == undefined)
            msg.time = Date.now()
        if (!this.cdc || this.cdc.readyState != "open")
            this.pendingCDCMsgs.push(msg)
        else {
            const s = JSON.stringify(msg)
            try {
                console.log("sending ctrl message ", s)
                this.cdc.send(s)
            } catch(err) {
                //TODO: this is silly, count proper retries
                console.log("Got error trying to send ctrl message", err)
            }
        }
        return msg.message_id
    }
    /*
     * authenticate send the authentication message over the control channel
     */
    authenticate() {
        
        let msgId = this.sendCTRLMsg({
            type: "auth",
            args: {token: terminal7.token}
        })
        this.onack[msgId] = (isNack, state) => {
            if (isNack) {
                if (this.nameE != null)
                    this.nameE.classList.add("failed")
                this.notify("Authorization FAILED")
                this.close()
                setTimeout(_ => this.copyToken(), ABIT)
                return
            }
            if (this.nameE != null)
                this.nameE.classList.remove("failed")
            this.notify("Authorization accepted")
            this.focus()
            if (state && (state.windows.length > 0)) {
                console.log("reloading state: ", state)
                this.restoreState(state)
            } else {
                // add the first window
                // this.e.style.display = "block"
                let w = this.addWindow()
                w.focus()
            }
        }
    }
    restoreState(state) {
        let focused = false
        console.log("restoring state: ", state)
        state.windows.forEach(w =>  {
            let win = this.addWindow(w.name, w.layout)
            if (w.active) {
                focused = true
                win.focus()
            }
        })
        if (!focused)
            this.windows[0].focus()
    }
    /*
     * Adds a window, complete with a first layout and pane
     */
    addWindow(name, layout) {
        console.log("adding Window: " + name, layout)
        let id = this.windows.length
        let w = new Window({name:name, gate: this, id: id})
        this.windows.push(w)
        w.open(this.e)
        if (layout instanceof Object) {
            w.restoreLayout(layout)
        } else {
            // empty window: create the first layout and pane
            // filling the entire top of the screen
            let tabbar = this.e.querySelector(".tabbar"),
                r = tabbar.getBoundingClientRect(),
                sy = r.y / document.body.offsetHeight
            let paneProps = {sx: 1.0, sy: sy,
                             xoff: 0, yoff: 0,
                             w: w,
                             gate: this},
                layout = w.addLayout("TBD", paneProps)
            w.activeP = layout.addPane(paneProps)
            w.rootLayout = layout
        }
        return w
    }
    /*
     * openCDC opens the control channel and handle incoming messages
     */
    openCDC() {
        var cdc = this.pc.createDataChannel('%')
        this.cdc = cdc
        console.log("<opening cdc")
        cdc.onclose = () => {
            if (this.boarding) {
                this.notify('Control Channel is closed')
                this.stopBoarding()
                terminal7.onDisconnect(this)
            }
        }
        cdc.onopen = () => {
            if (this.pendingCDCMsgs.length > 0)
                // TODO: why the time out? why 100mili?
                setTimeout(() => {
                    console.log("sending pending messages:", this.pendingCDCMsgs)
                    this.pendingCDCMsgs.forEach((m) => this.sendCTRLMsg(m), ABIT)
                    this.pendingCDCMsgs = []
                }, 100)
        }
        cdc.onmessage = m => {
            const d = new TextDecoder("utf-8"),
                  msg = JSON.parse(d.decode(m.data))

            // handle Ack
            if ((msg.type == "ack") || (msg.type == "nack")) {
                const handler = this.onack[msg.args.ref]
                console.log("got cdc message:",  msg)
                if (handler != undefined) {
                    handler(msg.type=="nack", msg.args.body)
                    // just to make sure we'll never  call it twice
                    delete this.onack[msg.args.ref]
                }
                else
                    console.log("Got a cdc ack with no handler", msg)
            }
        }
        return cdc
    }
    /*
     * clear clears the gates memory
     */
    clear() {
        this.windows.forEach(w => w.close(false))
        this.windows = []
        this.breadcrumbs = []
    }

    /*
     * close closes the peer connection and removes the host from the UI
     */
    close(verify) {
        this.boarding = false
        this.clear()
        this.pc.close()
        this.e.classList.add("hidden")
        if (terminal7.activeG == this)
            terminal7.activeG = null
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
            this.updateID = setTimeout(_ => { 
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
        // enable search
        document.getElementById("search-button").classList.remove("off")
    }
    copyToken() {
        let ct = document.getElementById("copy-token"),
            addr = this.addr.substr(0, this.addr.indexOf(":"))

        document.getElementById("ct-address").innerHTML = addr
        document.getElementById("ct-name").innerHTML = this.name
        ct.querySelector('[name="token"]').value = terminal7.token
        ct.classList.remove("hidden")
        ct.querySelector(".copy").addEventListener('click', ev => {
            cordova.plugins.clipboard.copy(
                ct.querySelector('[name="token"]').value)
            document.execCommand("copy")
            ev.target.parentNode.parentNode.parentNode.classList.add("hidden")
            this.notify("Token copied to the clipboard")
        })
        ct.querySelector(".submit").addEventListener('click', ev => {
            let uname = ct.querySelector('[name="uname"]').value,
                pass = ct.querySelector('[name="pass"]').value
            ev.target.parentNode.parentNode.parentNode.classList.add("hidden")
            this.notify("ssh is connecting...")
            window.cordova.plugins.sshConnect.connect(uname, pass, addr, 22,
                resp => {
                    this.notify("ssh connected")
                    if (resp) {
                        let token = terminal7.token,
                            // TODO: get the path of authorized tokens from the
                            // server
                            cmd =
                            `cat <<<"${token}" >> ~/.webexec/authorized_tokens`
                        window.cordova.plugins.sshConnect.executeCommand(cmd, 
                            ev =>  {
                                this.notify("ssh exec success", ev)
                                this.connect()
                            },
                            ev => this.notify("ssh exec failure", ev))
                        window.cordova.plugins.sshConnect.disconnect(
                            ev => this.notify("ssh disconnect success", ev),
                            ev => this.notify("ssh disconnect failure", ev))
                    }
                }, ev => {
                    this.notify("Wrong password")
                    console.log("ssh failed to connect", ev)
                })
        })
        ct.querySelector(".close").addEventListener('click',  ev =>  {
            ev.target.parentNode.parentNode.parentNode.classList.add("hidden")
        })
    }
    goBack(closeGate) {
        this.breadcrumbs.pop()
        if (this.windows.length == 0) {
            if (closeGate != false)
                this.close()
        }
        else
            if (this.breadcrumbs.length > 0)
                this.breadcrumbs.pop().focus()
            else
                this.windows[0].focus()
    }
}
