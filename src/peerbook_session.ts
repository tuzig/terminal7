import { BaseSession, BaseChannel, Channel, ChannelID }  from './session' 

const TIMEOUT = 5000
type ChannelOpenedCB = (channel: Channel, id: ChannelID) => void 

// SSHSession is an implmentation of a real time session over ssh
export class PeerbookChannel extends BaseChannel {
    dataChannel: RTCDataChannel
    session: PeerbookSession
    id: number
    createdOn: number
    constructor(session: PeerbookSession,
                id: number,
                dc: RTCDataChannel) {
        super()
        this.id = id
        this.session = session
        this.dataChannel = dc
        this.createdOn = session.lastMarker
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
    close(): Promise<void> {
        return new Promise(resolve => {
            this.dataChannel.close()
            resolve()
        })
    }
    disconnect() {
        this.dataChannel.onmessage = Function.prototype()
        this.dataChannel.onclose = Function.prototype()
    }

}
export class PeerbookSession extends BaseSession {
    fp: string
    channels: Map<number, PeerbookChannel>
    pendingCDCMsgs: Array<object>
    pendingChannels: Map<ChannelID, ChannelOpenedCB>
    msgWatchdogs: Map<ChannelID, number>
    msgHandlers: Map<ChannelID, Array<()=>void>>
    cdc: RTCDataChannel
    pc: RTCPeerConnection
    lastMsgId: number
    t7: object
    lastMarker: number
    constructor(fp: string) {
        super()
        this.fp = fp
        this.channels = new Map()
        this.pendingCDCMsgs = new Array()
        this.pendingChannels = new Map()
        this.msgWatchdogs = new Map()
        this.msgHandlers = new Map()
        this.lastMsgId = 0
        this.t7 = window.terminal7
        this.lastMarker = -1
    }
    /*
     * disengagePC silently removes all event handler from the peer connections
     */
    disengagePC() {
        if (this.pc != null) {
            this.pc.onconnectionstatechange = undefined
            this.pc.onmessage = undefined
            this.pc.onnegotiationneeded = undefined
            this.pc = null
        }
    }
    async connect() {
        console.log("in connect")
        this.disengagePC()
        if ((!this.t7.iceServers) && (!this.t7.conf.peerbook.insecure)) {
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
        this.pc.onconnectionstatechange = () => {
            const state = this.pc.connectionState
            console.log("new connection state", state, this.lastMarker)
            if ((state == "connected") && (this.lastMarker != -1)) {
                this.sendCTRLMsg({
                    type: "restore",
                    args: { marker: this.lastMarker }},
                () => {
                    this.onStateChange(state)
                }, error => {
                    this.t7.notify("Failed to restore from marker")
                    this.onStateChange("failed")
                })
            } else 
                this.onStateChange(state)
        }
        let offer = ""
        this.pc.onicecandidateerror = (ev: RTCPeerConnectionIceErrorEvent) => {
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

    channelOpened(dc: RTCDataChannel, id: number, resolve: (channel: Channel) => void) {
        console.log("channelOpened")
        const channel = new PeerbookChannel(this, id, dc)
        this.channels.set(id, channel)
        resolve(channel)
        // callbacks are set after the resolve as that's 
        // where caller's onMessage & onClose are set
        dc.onmessage = m => {
            // ignore close events when an older generation channel
            if (channel.createdOn == this.lastMarker)
                channel.onMessage(m)
        }
        dc.onclose = m => {
            if (channel.createdOn == this.lastMarker) {
                console.log("triggering channle close event as", channel.createdOn)
                channel.onClose(m)
                this.channels.delete(id)
            } else
                console.log("ognoring close event on old channel", channel.createdOn, this.lastMarker)
        }
    }
    openChannel(id: ChannelID): Promise<Channel>
    openChannel(cmdorid: unknown, parent?: ChannelID, sx?: number, sy?: number):
         Promise<Channel> {
        return new Promise((resolve, reject) => {
            let msgID: number
            if (sx !== undefined) {
                msgID = this.sendCTRLMsg({
                    type: "add_pane", 
                    args: { 
                        command: [cmdorid],
                        rows: sy,
                        cols: sx,
                        parent: parent || 0
                    }
                }, Function.prototype(), Function.prototype())
            } else {
                msgID = this.sendCTRLMsg({
                    type: "reconnect_pane", 
                    args: { id: cmdorid }
                }, Function.prototype(), Function.prototype())
            }
            const watchdog = setTimeout(() => reject("timeout"), TIMEOUT)
            this.pendingChannels[msgID] = (channel: RTCDataChannel, id: ChannelID) => {
                clearTimeout(watchdog)
                this.channelOpened(channel, id, resolve)
            }
        })
    }
    getIceServers() {
        return new Promise((resolve, reject) => {
            const ctrl = new AbortController(),
                  tId = setTimeout(() => ctrl.abort(), TIMEOUT),
                  insecure = this.t7.conf.peerbook.insecure,
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
                const answer = JSON.parse(data)
                // return an array with the conf's server and subspace's
                resolve([{ urls: this.t7.conf.net.iceServer},
                         answer["ice_servers"][0]])

            }).catch(err => {
                console.log("failed to get ice servers " + err.toString())
                clearTimeout(tId)
                reject()
            })
        })
    }
    openCDC() {
        console.log("opening cdc")
        const cdc = this.pc.createDataChannel('%')
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
                const i = msg.args.ref
                window.clearTimeout(this.msgWatchdogs[i])
                delete this.msgWatchdogs[i]
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
                    if (handlers && (typeof handlers[1] == "function"))
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
                this.msgWatchdogs[msg.message_id] = this.t7.run(
                      () => this.sendCTRLMsg(msg, resolve, reject), timeout)
            } else {
                this.t7.notify(
                     `#${msg.message_id} tried ${retries} times and given up`)
                this.onStateChange("disconnected")
            }
        }
        return msg.message_id
    }
    peerAnswer(offer) {
        const sd = new RTCSessionDescription(offer)
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
    disconnect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.pc) {
                resolve()
                return
            }
            this.lastMarker = undefined
            this.sendCTRLMsg({
                    type: "mark",
                    args: null
                }, (payload) => {
                this.t7.log("got a marker", this.lastMarker, payload)
                this.lastMarker = payload
                this.channels.values((c: PeerbookChannel) => c.disconnect())
                resolve()
            }, reject)
        })
    }
}
