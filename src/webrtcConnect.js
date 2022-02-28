export class webrtcConnector {
    constructor (props) {
        this.fp = props.fp
        this.pendingCDCMsgs = []
        this.onError = null
        this.onWarning = null
        this.pc = null
        this.lastMsgId = 1
        this.cds = null
        this.msgs = {}
        this.marker = -1
        this.onack = {}
        this.pendingPanes = []
    }
    connect() {
        // cleanup
        this.pendingCDCMsgs = []
        this.disengagePC()
        // exciting times.... a connection is born!
        if (terminal7.iceServers)
            this.openPC()
        else
            this.getIceServers().then(servers => {
                terminal7.iceServers = servers
                this.openPC()
            }).catch(() => this.onError("Failed to get ice servers"))
    }
    getIceServers() {
        return new Promise((resolve, reject) => {
            const ctrl = new AbortController(),
                  tId = setTimeout(() => ctrl.abort(), 5000)

            fetch("https://"+terminal7.conf.net.peerbook+'/turn',
                  {method: 'POST', signal: ctrl.signal })
            .then(response => {
                if (!response.ok)
                    throw new Error(
                      `HTTP POST failed with status ${response.status}`)
                return response.text()
            }).then(data => {
                clearTimeout(tId)
                if (!this.verified) {
                    this.verified = true
                    // TODO: store when making real changes
                    // terminal7.storeGates()
                }
                var answer = JSON.parse(data)
                // return an array with the conf's server and subspace's
                resolve([{ urls: terminal7.conf.net.iceServer},
                         answer["ice_servers"][0]])

            }).catch(error => {
                clearTimeout(tId)
                reject()
            })
        })
    }
    openPC() {
        this.pc = new RTCPeerConnection({
            iceServers: terminal7.ice_servers,
            certificates: terminal7.certificates})
        this.pc.onconnectionstatechange = e =>
            this.onStateChange(this.pc.connectionState)

        let offer = ""
        this.pconicecandidateerror = ev => {
            console.log("icecandidate error", ev.errorCode)
            if (ev.errorCode == 401) {
                this.onWarning("Getting fresh ICE servers")
                this.getIceServers().then(servers => {
                    terminal7.iceServers = servers
                    this.openPC()
                })
            }
        }
        this.pc.onicecandidate = ev => {
            if (ev.candidate) {
                terminal7.pbSend({target: this.fp, candidate: ev.candidate})
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
        this.pc.ondatachannel = e => {
            e.channel.onopen = () => {
                var l = e.channel.label
                var m = l.split(":"),
                    msgID = parseInt(m[0]),
                    webexecID = parseInt(m[1])
                if (isNaN(webexecID) || isNaN(msgID)) {
                    this.onError("Failed to open pane")
                    terminal7.log(`got a channel with a bad label: ${l}`)
                } else {
                    this.pendingPanes[msgID](e, webexecID)
                    delete this.pendingPanes[msgID]
                }
            }
        }
        this.openCDC()

        if (this.marker == -1)
            this.getLayout()
        else
            this.restore()
    }
    /*
     * sencCTRLMsg gets a control message and sends it if we have a control
     * channel open or adds it to the queue if we're early to the party
     */
    sendCTRLMsg(msg) {
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
            // message stays frozen when retrying
            const s = msg.payload || JSON.stringify(msg)
            terminal7.log("sending ctrl message ", s)
            if (msg.tries == undefined) {
                msg.tries = 0
                msg.payload = s
            } else if (msg.tries == 1)
                this.onWarning(
                     `msg #${msg.message_id} no ACK in ${timeout}ms, trying ${retries-1} more times`)
            if (msg.tries++ < retries) {
                terminal7.log(`sending ctrl msg ${msg.message_id} for ${msg.tries} time`)
                try {
                    this.cdc.send(s)
                } catch(err) {
                    this.onWarning(`Sending ctrl message failed: ${err}`)
                }
                this.msgs[msg.message_id] = terminal7.run(
                      () => this.sendCTRLMsg(msg), timeout)
            } else {
                this.onError(
                     `#${msg.message_id} tried ${retries} times and given up`)
                // this.stopBoarding()
            }
        }
        return msg.message_id
    }
    restore() {
        let msgId = this.sendCTRLMsg({type: "restore",
                                      args: { marker: this.marker }})
        this.onack[msgId] = (isNack, state) => {
            if (isNack) {
                this.onWarning("Failed to restore from marker")
                this.marker = -1
                this.getLayout()
            }
            else {
                this.onRestore(state)
                terminal7.run(_ => {
                    this.marker = -1
                    terminal7.log("resotre done, fitting peers")
                    this.onResize()
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
                this.onRestore({})
            } else {
                this.onRestore(state)
                terminal7.run(_ => this.marker = -1, 100)
            }
        }
    }
    openShell(id, parent, rows, cols) {
        return new Promise((resolve, reject) => {
            if (!id) {
                var msgID = this.gate.sendCTRLMsg({
                    type: "add_pane", 
                    args: { 
                        command: [terminal7.conf.exec.shell],
                        rows: rows,
                        cols: cols,
                        parent: parent || 0
                    }
                })
            } else {
                var msgID = this.gate.sendCTRLMsg({
                    type: "reconnect_pane", 
                    args: { 
                        id: id
                    }
                })
            }
            this.pendingPanes[msgID] = (e, id) => resolve(e.channel, id)
        })
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
                    this.setIndicatorColor(FAILED_COLOR)
                    this.nameE.classList.add("failed")
                }
                else {
                    this.setIndicatorColor("unset")
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
     * Host.sendSize sends a control message with the pane's size to the server
     */
    sendSize(pane) {
        if ((this.pc != null) && pane.channelID)
            this.sendCTRLMsg({
                type: "resize", 
                args: {
                       pane_id: pane.webexecID,
                       sx: pane.t.cols,
                       sy: pane.t.rows
                }
            })
    }
 }
