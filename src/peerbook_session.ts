
import { BaseSession, Channel }  from './session.ts' 

const TIMEOUT = 5000

// SSHSession is an implmentation of a real time session over ssh
export class PeerbookChannel extends BaseSession {
    dataChannel: RTCDataChannel
    session: PeerbookSession
    id: number
    constructor(session: PeerbookSession, id: number, dc: RTCDataChannel) {
        super()
        this.id = id
        this.session = session
        this.dataChannel = dc
        dc.onmessage = m => this.onMessage(m)
        dc.onclose = m => this.onClose(m)
    }
    get readyState(): string {
        if (this.dataChannel)
            return this.dataChannel.readyState
        else 
            return "new"
    }
    send(data: string) {
        this.dataChannel.send(data)
    }
    resize(sx: number, sy: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.session.sendCTRLMsg({
                type: "resize", 
                args: {
                       pane_id: this.id,
                       sx: sx,
                       sy: sy
                }
            }, resolve, reject)
        })
    }
}
export class PeerbookSession extends BaseSession {
    fp: string
    pendingCDCMsgs: Array<object>
    pendingChannels: Object
    msgs: Object
    msgHandlers: Object
    cdc: RTCDataChannel
    pc: any
    lastMsgId: Number
    t7: any
    constructor(fp: string) {
        super()
        this.fp = fp
        this.pendingCDCMsgs = []
        this.pendingChannels = {}
        this.msgs = {}
        this.msgHandlers = {}
        this.lastMsgId = 0
        this.t7 = window.terminal7
    }
    async connect() {
        console.log("in connect")
        if (!this.t7.iceServers) {
            try {
                this.t7.iceServers = await this.getIceServers()
            } catch(e) {
                console.log("Faield to get ice servers", e.toString())
            }
        }
        console.log("got ice server")
        this.pc = new RTCPeerConnection({
            iceServers: this.t7.iceServer,
            certificates: this.t7.certificates})
        this.pc.onconnectionstatechange = e =>
            this.onStateChange(this.pc.connectionState)
        let offer = ""
        this.pc.onicecandidateerror = ev => {
            console.log("icecandidate error", ev.errorCode)
            if (ev.errorCode == 401) {
                this.t7.notify("Getting fresh ICE servers")
                this.connect()
            }
        }
        this.pc.onicecandidate = ev => {
            if (ev.candidate) {
                this.t7.pbSend({target: this.fp, candidate: ev.candidate})
            }
        }
        this.pc.onnegotiationneeded = e => {
            this.t7.log("on negotiation needed", e)
            this.pc.createOffer().then(d => {
                this.pc.setLocalDescription(d)
                offer = btoa(JSON.stringify(d))
                this.t7.log("got offer", offer)
                this.t7.pbSend({target: this.fp, offer: offer})
            })
        }
        this.pc.ondatachannel = e => {
            e.channel.onopen = () => {
                const l = e.channel.label,
                      m = l.split(":"),
                      msgID = parseInt(m[0]),
                      channelID = parseInt(m[1])
                if (isNaN(channelID) || isNaN(msgID)) {
                    this.t7.notify("Failed to open pane")
                    this.t7.log(`got a channel with a bad label: ${l}`)
                    this.close()
                } else {
                    const resolve = this.pendingChannels[msgID]
                    if (typeof resolve == "function") {
                        resolve(e.channel, channelID)
                        delete this.pendingChannels[msgID]
                    } else
                        console.log("Go a surprising new channel", e.channel)
                }
            }
        }
        this.openCDC()
    }

    channelOpened(dc: RTCDataChannel, id: number, resolve: any) {
        const channel = new PeerbookChannel(this, id, dc)
        resolve(channel)
    }
    openChannel(cmdorid: ChannelID): Promise<Channel>
    openChannel(cmdorid: string | ChannelID, parent: ChannelID, sx: number, sy: number):
         Promise<Channel> {
        return new Promise((resolve, reject) => {
            if (sx !== undefined) {
                var msgID = this.sendCTRLMsg({
                    type: "add_pane", 
                    args: { 
                        command: [cmdorid],
                        rows: sy,
                        cols: sx,
                        parent: parent || 0
                    }
                }, Function.prototype(), Function.prototype())
            } else {
                var msgID = this.sendCTRLMsg({
                    type: "reconnect_pane", 
                    args: { id: cmdorid }
                }, Function.prototype(), Function.prototype())
            }
            let watchdog = setTimeout(_ => reject("timeout"), TIMEOUT)
            this.pendingChannels[msgID] = (channel, id) => {
                clearTimeout(watchdog)
                this.channelOpened(channel, id, resolve)
            }
        })
    }
    close(): Promise<void>{
    }
    getIceServers() {
        return new Promise((resolve, reject) => {
            const ctrl = new AbortController(),
                  tId = setTimeout(() => ctrl.abort(), TIMEOUT),
                  insecure = this.conf.peerbook.insecure,
                  schema = insecure?"http":"https"

            fetch(`${schema}://${this.t7.conf.net.peerbook}/turn`,
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
                    // this.t7.storeGates()
                }
                var answer = JSON.parse(data)
                // return an array with the conf's server and subspace's
                resolve([{ urls: this.t7.conf.net.iceServer},
                         answer["ice_servers"][0]])

            }).catch(error => {
                console.log("failed to get ice servers " + err.toString())
                clearTimeout(tId)
                reject()
            })
        })
    }
    openCDC() {
        console.log("opening cdc")
        var cdc = this.pc.createDataChannel('%')
        this.cdc = cdc
        this.t7.log("<opening cdc")
        cdc.onopen = () => {
            if (this.pendingCDCMsgs.length > 0)
                // TODO: why the time out? why 100mili?
                this.t7.run(() => {
                    this.t7.log("sending pending messages:", this.pendingCDCMsgs)
                    this.pendingCDCMsgs.forEach((m) => this.sendCTRLMsg(m[0], m[1], m[2]))
                    this.pendingCDCMsgs = []
                }, 0)
        }
        cdc.onmessage = m => {
            const d = new TextDecoder("utf-8"),
                  msg = JSON.parse(d.decode(m.data))
            // handle Ack
            if ((msg.type == "ack") || (msg.type == "nack")) {
                let i = msg.args.ref
                window.clearTimeout(this.msgs[i])
                delete this.msgs[i]
                const handlers = this.msgHandlers[i]
                delete this.msgHandlers[msg.args.ref]
                this.t7.log("got cdc message:",  msg)
                /* TODO: What do we do with a nack?
                if (msg.type == "nack") {
                    this.setIndicatorColor(FAILED_COLOR)
                    this.nameE.classList.add("failed")
                }
                else {
                    this.setIndicatorColor("unset")
                    this.nameE.classList.remove("failed")
                }
                */
                if (msg.type == "nack") {
                    if (typeof handlers[1] == "function")
                        handlers[1](msg.args.body)
                    else
                        console.log("A nack is unhandled", msg)
                } else {
                    if (typeof handlers[0] == "function")
                        handlers[0](msg.args.body)
                    else
                        console.log("an ack is unhandled", msg)
                }
            }
        }
        return cdc
    }
    sendCTRLMsg(msg, resolve, reject) {
        const timeout = parseInt(this.t7.conf.net.timeout),
              retries = parseInt(this.t7.conf.net.retries),
              now = Date.now()
        // helps us ensure every message gets only one Id
        if (msg.message_id === undefined) 
            msg.message_id = this.lastMsgId++
        // don't change the time if it's a retransmit
        if (msg.time == undefined)
            msg.time = Date.now()
        this.msgHandlers[msg.message_id] = [resolve, reject]
        if (!this.cdc || this.cdc.readyState != "open")
            this.pendingCDCMsgs.push([msg, resolve, reject])
        else {
            // message stays frozen when restrting
            const s = msg.payload || JSON.stringify(msg)
            this.t7.log("sending ctrl message ", s)
            if (msg.tries == undefined) {
                msg.tries = 0
                msg.payload = s
            } else if (msg.tries == 1)
                this.t7.notify(
                     `msg #${msg.message_id} no ACK in ${timeout}ms, trying ${retries-1} more times`)
            if (msg.tries++ < retries) {
                this.t7.log(`sending ctrl msg ${msg.message_id} for ${msg.tries} time`)
                try {
                    this.cdc.send(s)
                } catch(err) {
                    this.t7.notify(`Sending ctrl message failed: ${err}`)
                }
                this.msgs[msg.message_id] = this.t7.run(
                      () => this.sendCTRLMsg(msg), timeout)
            } else {
                this.t7.notify(
                     `#${msg.message_id} tried ${retries} times and given up`)
                this.onStateChange("disconnected")
            }
        }
        return msg.message_id
    }
    peerAnswer(offer) {
        let sd = new RTCSessionDescription(offer)
        this.pc.setRemoteDescription(sd)
            .catch (e => {
                this.t7.notify(`Failed to set remote description: ${e}`)
                this.onStateChange("failed")
            })
    }
    peerCandidate(candidate) {
        this.pc.addIceCandidate(candidate).catch(e =>
            this.t7.notify(`ICE candidate error: ${e}`))
        return
    }
    getPayload(): Promise<string | null>{
        return new Promise((resolve, reject) => 
            this.sendCTRLMsg({
                type: "get_payload",
                args: {}
            }, resolve, reject)
        )
    }
    setPayload(payload: string): Promise<void>{
        return new Promise((resolve, reject) =>
            this.sendCTRLMsg({
                type: "set_payload",
                args: {Payload: payload}
            }, resolve, reject)
        )
    }
}
