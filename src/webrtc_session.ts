import { BaseChannel, BaseSession, Channel, ChannelID, Failure, Marker } from './session'

type ChannelOpenedCB = (channel: Channel, id: ChannelID) => void 
export type RTCStats = {
    timestamp: number,
    bytesSent: number,
    bytesReceived: number,
    roundTripTime: number,
}
export class ControlMessage {
    message_id: number
    time: number
    type: string
    args: object
    constructor(type: string, args?: object) {
        this.type = type
        if (args)
            this.args = args
    }
}

export class WebRTCChannel extends BaseChannel {
    dataChannel: RTCDataChannel | null
    session: WebRTCSession
    constructor(session: WebRTCSession,
                id: number,
                dc: RTCDataChannel) {
        super()
        this.id = id
        this.session = session
        this.dataChannel = dc
    }
    // readyState can be one of the four underlying states:
    //   "connecting", "open", "closing", closed"
    // or a special case "disconnected" when no associated data channel
    get readyState(): string {
        if (this.dataChannel)
            return this.dataChannel.readyState
        else 
            return "disconnected"
    }
    send(data: ArrayBuffer): void {
        if (!this.dataChannel) {
            this.t7.notify("data channel closed")
            return
        }
        this.dataChannel.send(data)
    }
    resize(sx: number, sy: number): Promise<string> {
        return this.session.sendCTRLMsg(new ControlMessage("resize", { pane_id: this.id, sx, sy }))
    }
    close(): void {
        const dc = this.dataChannel
        if (dc) {
            this.disconnect()
            dc.close()
        }
    }
    disconnect() {
        if (this.dataChannel) {
            this.dataChannel.onmessage = Function.prototype()
            this.dataChannel.onclose = Function.prototype()
            this.dataChannel = null
        }
    }
}

export class WebRTCSession extends BaseSession {
    channels: Map<number, WebRTCChannel>
    pendingCDCMsgs: Array<{msg: ControlMessage, handlers: {ack, nack, timeout? }}>
    pendingChannels: Map<ChannelID, ChannelOpenedCB>
    msgHandlers: Map<ChannelID, {ack, nack, timeout}>
    cdc: RTCDataChannel
    pc: RTCPeerConnection
    lastMsgId: number
    constructor() {
        super()
        this.channels = new Map()
        this.pendingCDCMsgs = []
        this.pendingChannels = new Map()
        this.msgHandlers = new Map()
        this.lastMsgId = 0
    }
    // eslint-disable-next-line
    onIceCandidate(e: RTCPeerConnectionIceEvent): void { throw new Error("Unimplemented method onIceCandidate()") }
    // eslint-disable-next-line
    onNegotiationNeeded(ev: Event): void { throw new Error("Unimplemented method onNegotiationNeeded()") }
    public get isSSH() {
        return false
    }

    // eslint-disable-next-line
    async connect(marker?: Marker, noCDC?: boolean | string, privateKey?: string) {
        terminal7.log("in connect", marker, noCDC)

        const iceServers =  await terminal7.getIceServers()
        this.t7.log("using ice server", JSON.stringify(iceServers))
        try {
            await this.t7.getFingerprint()
        } catch (e) {
            terminal7.log("failed to get fingerprint", e)
            this.t7.certificates = undefined
            return
        }
        // A new RTCPeerConnection is created below
        this.pc = new RTCPeerConnection({
            iceServers: iceServers,
            certificates: this.t7.certificates},
        )

        this.pc.onconnectionstatechange = () => {
            if (!this.pc)
                return
            const state = this.pc.connectionState
            terminal7.log("new connection state", state, marker)
            if (state === 'failed')
                this.closeChannels()
            if ((state !== "connected") || (marker == null))
                this.onStateChange(state)
        }
        this.pc.onicecandidate = (ev: RTCPeerConnectionIceEvent) => this.onIceCandidate(ev)

        this.pc.onnegotiationneeded = e => this.onNegotiationNeeded(e)
        this.pc.ondatachannel = e => {
            terminal7.log(">> opening dc", e.channel.label)
            e.channel.onopen = () => {
                terminal7.log(">> onopen dc", e.channel.label)
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
                    if (typeof resolve == "function")
                        resolve(e.channel, channelID)
                    else
                        terminal7.log("Go a surprising new channel", e.channel)
                    this.pendingChannels.delete(msgID)
                }
            }
        }
        if (noCDC)
            return

        await this.openCDC()
        if (marker != null) {
            this.sendCTRLMsg(new ControlMessage("restore", { marker }))
                .then(layout => {
                    this.lastPayload = layout
                    this.onStateChange("gotlayout")
                })
                .catch(e =>  {
                    terminal7.log("failed to restore", e)
                       if (e != Failure.TimedOut)
                           this.onStateChange("failed", e)
                })
        }
    }
    isOpen(): boolean {
        return this.pc != null && this.pc.connectionState == "connected"
    }
    isOpenish(): boolean {
        const state = this.pc?.connectionState
        // This are WebRTC states that are not "closed"
        return (
            state == "new" ||
            state == "connecting" ||
            state == "connected")
    }

    // dcOpened is called when a data channel has been opened
    onDCOpened(dc: RTCDataChannel, id: number):  WebRTCChannel {
        this.t7.log("dcOpened", dc)
        let channel = this.channels.get(id)
        if (channel) 
            channel.dataChannel = dc
        else {
            channel = new WebRTCChannel(this, id, dc)
            this.channels.set(id, channel)
        }
        // callbacks are set after the resolve as that's 
        // where caller's onMessage & onClose are set
        dc.onmessage = m => {
            if (typeof channel.onMessage == "function") {
                const data = new Uint8Array(m.data)
                channel.onMessage(data)
            }
        }
        dc.onclose = m => {
            this.channels.delete(id)
            channel.onClose(m)
        }
        return channel
    }
    openChannel(cmdorid: number | string | string[], parent?: ChannelID, sx?: number, sy?: number):
         Promise<Channel> {
        return new Promise((resolve, reject) => {
            let msg: ControlMessage
            if (sx !== undefined) {
                if (typeof cmdorid === "string")
                    cmdorid = [cmdorid] 
                msg = new ControlMessage("add_pane", {
                        command: cmdorid,
                        rows: sy,
                        cols: sx,
                        parent: parent || 0
                    })
            } else {
                terminal7.log("reconnect pane", cmdorid)
                msg = new ControlMessage("reconnect_pane", { id: cmdorid })
            }
            const watchdog = setTimeout(() => reject("timeout"), this.t7.conf.net.timeout)
            this.sendCTRLMsg(msg).catch(reject)
            this.pendingChannels[msg.message_id] = (dc: RTCDataChannel, id: ChannelID) => {
                clearTimeout(watchdog)
                const channel = this.onDCOpened(dc, id)
                resolve(channel)
            }
        })
    }
    // reconnects to an existing session returns the payload
    async reconnect(marker?: Marker , publicKey?: string, privateKey?: string): Promise<string | void> {
        terminal7.log("in reconnect")
        if (!this.isOpen())
            await this.connect(marker, false, privateKey)
        else if (!this.cdc || this.cdc.readyState != "open")
            await this.openCDC()
        if (marker != null) {
            let payload: string
            try {
                payload = await this.sendCTRLMsg(new ControlMessage("restore", { marker }))
            } catch(e) {
                if (e != Failure.TimedOut)
                    throw e
            }
            return payload
        } else
            return this.getPayload()
    }
    openCDC(): Promise<void> {
        // stop listening for messages
       if (this.cdc) {
           this.cdc.onmessage = undefined
           this.cdc.close()
       }
       // TODO: improve error handling and add a reject
       return new Promise((resolve) => {
           terminal7.log(">>> opening cdc")
            const cdc = this.pc.createDataChannel('%')
            this.cdc = cdc
            cdc.onopen = () => {
                this.t7.log(">>> cdc opened", this.pendingCDCMsgs.length)
                    // This needs a bit of timeout or messages are not sent
                    this.t7.run(() => {
                        while (this.pendingCDCMsgs.length > 0) {    
                            const { msg, handlers } = this.pendingCDCMsgs.shift()
                            this.sendCTRLMsg(msg).then(handlers.ack).catch(handlers.nack)
                        }
                        resolve()
                    }, 100)
            }
            cdc.onmessage = m => {
                const d = new TextDecoder("utf-8"),
                      msg = JSON.parse(d.decode(m.data))
                // handle Ack
                if ((msg.type == "ack") || (msg.type == "nack")) {
                    const i = msg.args.ref
                    const handlers = this.msgHandlers.get(i)
                    if (handlers?.timeout)
                        clearTimeout(handlers.timeout)
                    this.msgHandlers.delete(msg.args.ref)
                    this.t7.log("got cdc message:",  msg)
                    if (msg.type == "nack") {
                        if (handlers && (typeof handlers.nack == "function"))
                            handlers.nack(msg.args.desc)
                        else
                            terminal7.log("A nack is unhandled", msg)
                    } else {
                        if (handlers && (typeof handlers.ack == "function"))
                            handlers.ack(msg.args.body)
                        else
                            terminal7.log("an ack is unhandled", msg)
                    }
                } else if (this.onCMD)
                    this.onCMD(msg)
            }
       })
    }
    sendCTRLMsg(msg: ControlMessage): Promise<string> {
        return new Promise((resolve, reject) => {
            const timeout = terminal7.run(() => {
                terminal7.log("timeout on ctrl message", msg)
                reject(Failure.TimedOut)
            }, this.t7.conf.net.timeout)
            const ack = (s) => { 
                clearTimeout(timeout)
                resolve(s)
            }
            const nack = (s) => {
                clearTimeout(timeout)
                reject(s)
            }

            const send = async () => {
                try {
                    this.cdc.send(JSON.stringify(msg))
                } catch(err) {
                    this.t7.notify(`Sending ctrl message failed: ${err}`)
                }
            }

            if (msg.message_id === undefined) 
                msg.message_id = this.lastMsgId++
            // don't change the time if it's a retransmit
            if (msg.time == undefined)
                msg.time = Date.now()
            const handlers = {ack, nack, timeout}
            this.msgHandlers.set(msg.message_id, handlers)
            if (!this.cdc || this.cdc.readyState != "open") {
                // message stays frozen when restarting
                terminal7.log("cdc not open, queuing message", msg)
                this.pendingCDCMsgs.push({msg, handlers})
                if (this.cdc && this.cdc.readyState != "connecting")
                    this.openCDC()
            } else {
                this.t7.log("cdc open sending msg", msg)
                send()
            }
        })
    }
    getPayload(): Promise<string>{
        return this.sendCTRLMsg(new ControlMessage("get_payload"))
    }
    setPayload(payload: string | object): Promise<string>{
        return this.sendCTRLMsg(new ControlMessage("set_payload", { Payload: payload }))
    }
    closeChannels(): void {
        this.channels.forEach(c => c.close())
        this.channels = new Map()
    }
    // disconnect disconnects from all channels, requests a mark and resolve with
    // the new marker
    disconnect(): Promise<number | null> {
        return new Promise((resolve, reject) => {
            if (!this.pc) {
                resolve(null)
                return
            }
            this.closeChannels()
            this.sendCTRLMsg(new ControlMessage("mark")).then(payload => {
                if (typeof payload != "string") {
                    reject("failed to get a marker")
                    return
                }
                const marker = parseInt(payload)
                this.t7.log("got a marker", marker)
                this.closeChannels()
                resolve(marker)
            }, reject)
        })
    }
    close(): void {
        this.closeChannels()
        if (this.pc != null) {
            this.pc.onconnectionstatechange = undefined
            this.pc.onnegotiationneeded = undefined
            this.cdc.onopen = undefined
            this.cdc.onmessage = undefined
            this.cdc.close()
            this.pc.close()
            this.pc = null
        }
        this.msgHandlers.forEach(h => clearTimeout(h.timeout))
    }
    async getStats(): Promise<RTCStats | null> {
        if (this.pc == null)
            return null
        const stats = await this.pc.getStats()
        let candidatePair
        stats.forEach(s => {
            if (s.type == "candidate-pair" && s.state == "succeeded")
                candidatePair = s
        })
        if (!candidatePair)
            return null
        const res: RTCStats = {
            timestamp: Date.now(),
            bytesSent: candidatePair.bytesSent,
            bytesReceived: candidatePair.bytesReceived,
            roundTripTime: candidatePair.currentRoundTripTime * 1000,
        }
        return res
    }
}

export class PeerbookSession extends WebRTCSession {
    fp: string
    constructor(fp: string) {
        super()
        this.fp = fp
    }
    onIceCandidate(ev: RTCPeerConnectionIceEvent) {
        if (ev.candidate && this.t7.pb) {
            this.t7.pb.adminCommand(
                    new ControlMessage("candidate", { target: this.fp, sdp: ev.candidate}))
            .catch(e => terminal7.log("failed to send candidate", e))
        } else {
            terminal7.log("ignoring ice candidate", JSON.stringify(ev.candidate))
        }
    }
    async onNegotiationNeeded() {
        terminal7.log("gate needs negotiation", this.fp)
        let d: RTCSessionDescriptionInit
        try {
            d = await this.pc.createOffer()
        } catch(e) {
            terminal7.log("failed to create offer", e)
            this.onStateChange("failed", Failure.InternalError)
            return
        }

        await this.pc.setLocalDescription(d)

        terminal7.log("sending offer", Date.now())
        try {
            await this.t7.pb.adminCommand(new ControlMessage( "offer", { target: this.fp, sdp: d }))
        } catch(e) {
            terminal7.log("failed to send offer", e)
            // ensure it's not an old session
            if (this.pc != null)
                this.onStateChange("failed", e)
            return
        }
        terminal7.log("sent offer", Date.now())
    }
    async peerAnswer(offer) {
        const sd = new RTCSessionDescription(offer)
        if (this.pc.signalingState == "stable") {
            terminal7.log("got an answer but signla're stable, ignoring answer")
            return
        }
        terminal7.log("got an answer", sd)

        try {
            await this.pc.setRemoteDescription(sd)
        } catch (e) {
            terminal7.log(`Ignoring failure to set remote description: ${e}`)
            // this.onStateChange("failed", Failure.BadRemoteDescription)
        }
    }
    peerCandidate(candidate) {
        this.pc.addIceCandidate(candidate).catch(e => {
            terminal7.log(`ICE candidate error: ${e}`)
            if (e.errorCode == 701)
                this.onStateChange("failed", Failure.BadRemoteDescription)
        })
        return
    }
}


// HTTPWebRTCSession is a WebRTCSession that connects to a WHIP server
export class HTTPWebRTCSession extends WebRTCSession {
    address: string
    headers: HeadersInit = {}
    sessionURL: string | null = null
    pendingCandidates: Array<RTCIceCandidate>
    // storing the setTimeout id so we can cancel it
    constructor(address: string, headers?: Map<string, string>) {
        super()
        this.address = address
        if (headers)
            headers.forEach((v, k) => this.headers[k] =  v)
        terminal7.log("new http webrtc session", address, JSON.stringify(this.headers))
    }

    async _fetch(url: string, method: string, body: string | null) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => {
            terminal7.log("fetch timed out", method, url)
            controller.abort()
        }, this.t7.conf.net.timeout)

        try {
            const response = await fetch(url, {
                method: method,
                headers: this.headers,
                body: body,
                signal: controller.signal,
                mode: 'cors',
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    sendOffer(offer: RTCSessionDescriptionInit) {
        const headers = this.headers
        headers['Content-Type'] = 'application/sdp'
        this.pendingCandidates = []
        this._fetch(this.address, 'POST', offer.sdp)
        .then(response => {
            if (response.status == 401)
                this.fail(Failure.Unauthorized)
            else if (response.status >= 300) {
                terminal7.log("failed to post to PB", response)
                if (response.status == 404)
                    this.fail(Failure.NotSupported)
                else
                    this.fail()
            } else if (response.status == 201) {
                this.sessionURL = response.headers.get('location')
                terminal7.log("got a session url", this.sessionURL)
                this.pendingCandidates.forEach(c => this.sendCandidate(c))
                this.pendingCandidates = []
                return response.text()
            }
            return null
        }).then(data => {
            if (!data)
                return
            if (this.pc)
                this.pc.setRemoteDescription({type: "answer", sdp: data})
                    .catch (() => {
                        // on some machines (android), we need a newline at the end the answer
                        terminal7.log("failed to set remote description, trying with a newline")
                        data += "\n"
                        this.pc.setRemoteDescription({type: "answer", sdp: data})
                            .catch(() => this.fail(Failure.BadRemoteDescription))
                    })
        }).catch(error => {
            terminal7.log(`FAILED: POST to ${this.address} with ${JSON.stringify(this.headers)}`, error)
            if (error.message == 'unauthorized')
                this.fail(Failure.Unauthorized)
            else
                this.fail(Failure.NotSupported)
        })
    }
    onNegotiationNeeded(e) {
        this.t7.log("over HTTP on negotiation needed", e)
        this.pc.createOffer().then(offer => {
            this.pc.setLocalDescription(offer)
            this.sendOffer(offer)
        })
    }
    sendCandidate(candidate: RTCIceCandidate) {
        if (this.sessionURL == null) {
            terminal7.log("waiting for session url, queuing candidate")
            this.pendingCandidates.push(candidate)
            return
        }
        const headers = {}
        Object.assign(headers, this.headers)
        headers['Content-Type'] = 'application/json'
        this._fetch(this.sessionURL, 'PATCH', JSON.stringify(candidate.toJSON()))
        .then(response => {
            if (response.status == 401)
                this.fail(Failure.Unauthorized)
            else if (response.status >= 300) {
                terminal7.log("failed to post to PB", response)
                if (response.status == 404)
                    this.fail(Failure.NotSupported)
                else
                    this.fail()
            }
        }).catch(error => {
            terminal7.log(`FAILED: PATCH to ${this.address} with ${JSON.stringify(this.headers)}`, error)
            if (error.message == 'unauthorized')
                this.fail(Failure.Unauthorized)
            else
                this.fail(Failure.NotSupported)
        })
    }
    onIceCandidate(ev: RTCPeerConnectionIceEvent) {
        terminal7.log("got ice candidate", ev)
        if (ev.candidate != null) {
            this.sendCandidate(ev.candidate)
        }
    }
    close(): void {
        super.close()
        this.sessionURL = null
    }
}
