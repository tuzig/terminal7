import * as Hammer from 'hammerjs'
import { Window } from './window.js'
import { formatDate } from './utils.js'

const ABIT    = 10,  // ashort period of time, in milli
      TIMEOUT = 3000

export class Host {
    constructor (props) {
        // given properties
        this.id = props.id
        this.t7 = props.t7
        // this shortcut allows cells to split without knowing t7
        this.cells = this.t7.cells
        this.addr = props.addr
        this.user = props.user
        this.secret = props.secret
        this.store = props.store
        this.name = (!props.name)?`${this.user}@${this.addr}`:props.name
        // 
        this.pc = null
        this.windows = []
        this.activeW = null
        this.state = this.updateState("init")
        this.pendingCDCMsgs = []
        this.lastMsgId = 1
        // a mapping of refrence number to function called on received ack
        this.onack = {}
        this.breadcrumbs = []
        this.log = []
        this.peer = null
    }

    /*
     * Host.open opens a host element on the given element
     */
    open(e) {
        // create the host element - holding the tabs, windows and tab bar
        this.e = document.createElement('div')
        this.e.className = "host"
        this.e.style.zIndex = 2
        this.e.id = `host-${this.id}`
        e.appendChild(this.e)
        // add the tab bar
        let t = document.getElementById("tabbar-template")
        if (t) {
            t = t.content.cloneNode(true)
            let a = t.querySelector(".add-tab")
            a.addEventListener('click', (e) => this.addWindow())
            let b = t.querySelector(".bang")
            b.addEventListener('click', (e) => this.updateState("disconnected"))
            this.e.appendChild(t)
        }
        let plusHost = document.getElementById("plus-host")
        if (plusHost != null)  {
            // Add the hosts boxes to the home page
            let li = document.createElement('li'),
                a = document.createElement('a'),
                addr = this.addr && this.addr.substr(0, this.addr.indexOf(":"))
            li.classList.add("border")
            a.innerHTML = `<h3> ${this.user}</h3><h2>@</h2><h3>${addr}</h3>`
            // Add gestures on the window name for rename and drag to trash
            let hm = new Hammer.Manager(li, {})
            hm.options.domEvents=true; // enable dom events
            hm.add(new Hammer.Press({event: "edit", pointers: 1}))
            hm.add(new Hammer.Tap({event: "connect", pointers: 1}))
            hm.on("edit", (ev) => console.log("TODO: add host editing"))
            hm.on("connect", (ev) => this.connect())
            li.appendChild(a)
            // use prepend to keep the "+" last
            plusHost.parentNode.prepend(li)
        }
    }
    focus() {
        // first hide the current focused host
        let activeH = this.t7.activeH
        if (activeH) {
            activeH.e.style.display = "none"
        }
        this.e.style.display = "block"
        this.t7.activeH = this
        if (this.activeW)
            this.activeW.focus()
        let s = document.getElementById("home-button")
        s.classList.remove("on")
    }
            
    /*
     * Host.updateState(state) is the place for the host state machine
     */
    updateState(state) {
        let e = document.getElementById("disconnect-modal")
        if ((e.style.display == "none") && 
            ((state == "disconnected") ||
             (state == "unreachable") ||
             (state == "offline"))) {
            // clear pending messages to let the user start fresh
            this.pendingCDCMsgs = []
            e.querySelector("h1").textContent =
                (state == "offline")?"Network is Down":`Host ${state}`
            e.querySelector(".reconnect").addEventListener('click', ev => {
                e.style.display = "none"
                this.connect()
            })
            e.querySelector(".close").addEventListener('click', ev => {
                e.style.display = "none"
                this.t7.goHome()
            })
            e.style.display = "block"
            
        }
        /* Maybe we should restart Ice. duno
        else if (state === "failed") {
            this.pc.createOffer({ iceRestart: true })
                .then(this.pc.setLocalDescription)
                .then(sendOfferToServer)
            this.pc.restartIce()
        */
        else 
            e.style.disply = "none"
             
        this.state = state 
        console.log("host state change: ", this.state)
    }
    /*
     * Host.clearLog cleans the log and the status modals
     */
    clearLog() {
        /*
        this.log.forEach(m => m.remove())
        this.log = []
        */
        // hide the disconnect modal
        // document.getElementById("disconnect-modal").style.display = "none"
        document.getElementById("log").style.display = "none"
    }
    /*
     * Host.peerConnect connects the webrtc session with the peer
     */
    peerConnect(offer) {
        let sd = new RTCSessionDescription(offer)
        this.notify("Setting remote description") // TODO: add a var or two
        this.pc.setRemoteDescription(sd)
            .catch (e => {
                this.notify(`Failed to set remote describtion: ${e}`)
                this.updateState("disconnected")
            })
    }
    /*
     * Host.connect opens a webrtc peer connection to the host and then opens
     * the control channel and authenticates.
     */
    connect() {
        // if we're already connected, just focus
        this.focus()
        if (this.state == "connected") {
            return
        }
        if (this.activeW == null) {
            // add the first window
            this.e.style.display = "block"
            this.addWindow()
        }
        if (this.pc != null)
            this.pc.close()

        this.pc = new RTCPeerConnection({ iceServers: [
                  { urls: 'stun:stun2.l.google.com:19302' }
                ] })
        this.pc.oniceconnectionstatechange = e =>
            this.updateState(this.pc.iceConnectionState)

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
                    // notify, but first remove the period at the end
                    this.notify(error.message.slice(0,-1))
                    // redisplay the disconnected modal
                    this.updateState("unreachable")
                 })
            } 
        }
        this.pc.onnegotiationneeded = e => {
            console.log("on negotiation needed", e)
            this.pc.createOffer().then(d => this.pc.setLocalDescription(d))
        }
        this.openCDC()
        // suthenticate starts the ball rolling
        this.login((this.state == "disconnected") || (this.state == "failed"))
        setTimeout(ev => {
            if ((this.state != "completed") && (this.state != "connected")) {
                this.notify("Failed to connect to the server")
                this.updateState("disconnected")
            }
        }, TIMEOUT)
    }
    /*
     * Host.noitify adds a message to the host's log
     */
    notify(message) {    
        let ul = document.getElementById("log-msgs"),
            li = document.createElement("li"),
            d = new Date(),
            t = formatDate(d, "hh:mm:ss.fff")

        li.innerHTML = `<time>${t}</time> ${message}`
        li.classList = "log-msg"
        ul.appendChild(li)
        this.log.push(li)
        this.t7.logDisplay(true)
    }
    /*
     * sencCTRLMsg gets a control message and sends it if we have a control
     * channle open or adds it to the queue if we're early to the part
     */
    sendCTRLMsg(msg) {
        console.log("sending ctrl message ", msg)
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
    login(reconnect) {
        let resolved = false
        let msgId = this.sendCTRLMsg({
            type: "auth",
            args: {token: "MyToken"}
        })
        this.onack[msgId] = t => {
            resolved = true
            this.notify("Authorization accepted")
            if (this.secret != t) {
                this.secret = t
                if (this.store)
                    this.t7.storeHosts()
            }
            if (reconnect)
                // reconnect to open panes
                this.cells.forEach((c) => {
                    if (c.openDC != undefined) {
                        c.openDC(reconnect)
                    }
                })
            else  {
                // add the windows and connect to the panes
                let aP = this.activeW.activeP 
                if (!aP.d)
                    setTimeout(e => aP.openDC(), ABIT)
            }
        }
        setTimeout(() => {
            if (!resolved)
                // TODO: handle expired timeout
                this.notify("Timeout on auth ack")
        }, 3000)
    }
    /*
     * Adds a window, complete with a first layout and pane
     */
    addWindow(name, layout) {
        let id = this.windows.length
        if (!(name instanceof String))
            name = `Tab ${id+1}`
        let w = new Window({name:name, host: this, id: id})
        this.windows.push(w)
        w.open(this.e)
        if (layout instanceof Object) {
            let props = {
                host: this,
                w: w,
                t7: this.t7
            }
            function restoreLayout(part) {
                var l = w.addLayout(part.dir, props)
                part.cells.forEach(cell => {
                    if ("dir" in cell) {
                        // recurselvly add a new layout
                        const newL = restoreLayout(cell, props)
                        newL.layout = l
                    }
                    else {
                        l.addPane(cell)
                    }
                })
                return l
            }
            restoreLayout(layout)
        } else {
            // create the first layout and pane
            // filling the entire top of the screen
            let tabbar = this.e.querySelector(".tabbar"),
                r = tabbar.getBoundingClientRect(),
                sy = r.y / document.body.offsetHeight
            let paneProps = {sx: 1.0, sy: sy,
                             xoff: 0, yoff: 0,
                             w: w,
                             host: this},
                layout = w.addLayout("TBD", paneProps)
            this.activeP = layout.addPane(paneProps)
            this.rootLayout = layout
            this.focus()
        }
        this.activeW = w
        w.focus()
        return w
    }
    /*
     * Host.openCDC opens the control channel and handle incoming messages
     */
    openCDC() {
        var cdc = this.pc.createDataChannel('%')
        this.cdc = cdc
        console.log("<opening cdc")
        cdc.onclose = () =>{
            this.state = "closed"
            console.log('Control Channel is closed')
            this.close(true)
            // TODO: What now?
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
            if (msg.type == "ack") {
                const handler = this.onack[msg.args.ref]
                console.log("got cdc message:", this.state, msg)
                if (handler != undefined) {
                    handler(msg.args.body)
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
     * Host.close closes the peer connection and removes the host from the UI
     */
    close(verify) {
        // this.e.innerHTML=""
        if (verify)
            console.log("TODO: verify close")
        this.pc.close()
        this.state = this.updateState("close")
        this.windows.forEach(w => w.close())
        this.windows = []
        this.activeW = null
        this.breadcrumbs = []
        this.clearLog()
        this.e.style.display = "none"
        this.t7.goHome()
    }
    /*
     * Host.sendSize sends a control message with the pane's size to the server
     */
    sendSize(pane) {
        if ((this.pc != null) && pane.paneID)
            this.sendCTRLMsg({
                type: "resize", 
                args: {
                       pane_id: pane.paneID,
                       sx: pane.t.cols,
                       sy: pane.t.rows
                }
            })
    }
    onPaneConnected(pane) {
        // hide notifications
        this.t7.logDisplay(false)
        // enable search
        document.getElementById("search-button").classList.remove("off")
    }
}
