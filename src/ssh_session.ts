import { SSH, SSHSessionID, StartByPasswd, StartByKey} from 'capacitor-ssh-plugin'
import { Channel, BaseChannel, BaseSession, Failure, Session, State }  from './session' 
import { WebRTCSession }  from './webrtc_session'

const ACCEPT_CMD = "/usr/local/bin/webexec accept"

export class SSHChannel extends BaseChannel {
    id: number
    close(): Promise<void> {
        console.log("trying to close ssh channel")
        return new Promise((resolve, reject) => {
            SSH.closeChannel({channel: this.id})
               .then(() => {
                   resolve()
                })
                .catch(e => {
                    console.log("error from close SSH channel", e)
                    reject(e)
                })
        })
    }
    send(data: string): void {
        SSH.writeToChannel({channel: this.id, message: data})
           .catch(e => console.log("error from writeToChannel", e))
    }
    resize(sx: number, sy: number): Promise<void> {
        return SSH.setPtySize({channel: this.id, width: sx, height: sy})
           .catch(e => console.log("error from setPtySize", e))
    }
    handleData(m) {
        if ('data' in m)
            this.onMessage(m.data)
        else {
            this.t7.log("ssh read got error ", m.error)
            this.onClose(m.error)
        }
    }
}
// SSHSession is an implmentation of a real time session over ssh
export class SSHSession extends BaseSession {
    id: SSHSessionID
    address: string
    username: string
    port: number
    onStateChange : (state: State, failure?: Failure) => void
    onPayloadUpdate: (payload: string) => void
    constructor(address: string, username: string, port=22) {
        super()
        this.username = username
        this.address = address
        this.port = port
    }
    connect(marker?:number, tag?: string) {
    }
    passConnect(marker?:number, password?: string) {
        this.startWatchdog()
        const args: StartByPasswd = {
            address: this.address,
            port: this.port,
            username: this.username,
            password: password,
        }
        SSH.startSessionByPasswd(args)
           .then(({ session }) => {
                this.clearWatchdog()
                console.log("Got ssh session", session)
                this.id = session
                this.onStateChange("connected")
           }).catch(e => {
                this.clearWatchdog()
                console.log("SSH startSession failed", e)
                if (e.toString().startsWith("Error: Not imp"))
                    this.onStateChange("failed", Failure.NotImplemented)
                else
                    this.onStateChange("failed", Failure.WrongPassword)

           })
    }

    openChannel(cmd: string, parent?: ChannelID, sx?: number, sy?: number):
         Promise<Channel> {
        return new Promise((resolve, reject) => {
            const channel = new SSHChannel()
            SSH.newChannel({session: this.id})
               .then(({ id }) => {
                   console.log("got new channel with id ", id)
                channel.id = id
                SSH.startShell({channel: id, command: cmd}, m => channel.handleData(m))
                   .then(callbackID => {
                        console.log("got from startShell: ", callbackID)
                        resolve(channel, id)
                        SSH.setPtySize({channel: id, width: sx, height: sy})
                           .then(() => {
                            console.log("after setting size")
                            resolve(channel, id)
                           })

                    }).catch(e => {
                        console.log("failed startshell", e)
                        reject(e) 
                    })
                })
        })
    }
    public get isSSH() {
        return true
    }
}
// HybridSession can run either as SSH or WebRTC bby signalling
// over SSH
export class HybridSession extends SSHSession {
    candidate: string
    webrtcSession: Session
    sentMessages: Array<string>
    onStateChange : (state: State, failure?: Failure) => void
    onPayloadUpdate: (payload: string) => void
    constructor(address: string, username: string, port=22) {
        super(address, username, port)
        this.candidate = ""
        this.webrtcSession = null
        this.sentMessages = []
    }
    /*
     * connect must recieve either password or tag to choose
     * whether to use password or identity key based authentication 
     */
    connect(marker?:number, tag?: string) {
        const args: StartByKey = {
            address: this.address,
            port: this.port,
            username: this.username,
            tag: tag,
        }
        this.startWatchdog()
        SSH.startSessionByKey(args)
           .then(async ({ session }) => {
                this.t7.log("Got ssh session", session)
                this.id = session
                try {
                    await this.newWebRTCSession(session, marker)
                } catch(e) { 
                    this.clearWatchdog()
                    this.onStateChange("connected")
                }
           }).catch(e => {
                this.clearWatchdog()
                console.log("SSH startSession failed", e)
                if (e.code === "UNIMPLEMENTED")
                    this.fail(Failure.NotImplemented)
                else {
                    this.t7.log("failed startsession", e.toString())
                    this.fail(Failure.KeyRejected)
                }
           })
    }
    passConnect(marker?:number, password?: string) {
        this.startWatchdog()
        const args: StartByPasswd = {
            address: this.address,
            port: this.port,
            username: this.username,
            password: password,
        }
        SSH.startSessionByPasswd(args)
           .then(async ({ session }) => {
                this.t7.log("Got ssh session", session)
                this.id = session
                try {
                    await this.newWebRTCSession(session, marker)
                } catch(e) { 
                    this.clearWatchdog()
                    this.onStateChange("connected")
                }
           }).catch(e => {
                console.log("SSH startSession failed", e)
                if (e.code === "UNIMPLEMENTED")
                    this.fail(Failure.NotImplemented)
                else {
                    this.t7.log("failed startsession", e.toString())
                    this.fail(Failure.WrongPassword)
                }
                this.clearWatchdog()

           })
    }
    async onAcceptData(cid, marker: number, data: string) {
        data.split("\r\n").filter(line => line.length > 0).forEach(async line => {
            let c = {}
            this.t7.log("line webexec accept: ", line)
            if (line.startsWith("READY")) {
                try {
                    await this.openWebRTCSession(cid, marker)
                } catch (e) {
                    this.webrtcSession = null
                    this.t7.log("signaling over ssh failed", e)
                    return
                }
                return
            }
            //TODO: find a cleaner way to identify when the session closes without READY
            if (line.includes("such file or")) {
                this.clearWatchdog()
                SSH.closeChannel({channel: cid})
                this.startWatchdog()
                super.connect()
                return
            }
            this.candidate += line
            // ignore echo
            if (this.sentMessages.indexOf(this.candidate) != -1) {
                this.t7.log("igonring message: "+this.candidate)
                this.candidate = ""
                return
            }
            console.log("parsing", this.candidate)
            try {
                c = JSON.parse(this.candidate)
            } catch(e) { return }
            this.candidate = ""
            if (c == null) 
                return
            if (c.candidate)
                try {
                    await this.webrtcSession.pc.addIceCandidate(c)
                } catch(e) { 
                    this.t7.log("failed the add ice candidate", e.message, c)
                    return
                }
            else
                try {
                    await this.webrtcSession.pc.setRemoteDescription(c)
                } catch(e) { this.t7.log("got error setting remote desc:", e.message, c) }
        })
    }

    openWebRTCSession(cid, marker): Promise<Session> {
        this.webrtcSession = new WebRTCSession()
        // TODO: better to return the session and reject when failing
        return new Promise<Session>((resolve) => {
                // TODO: create a new override 
            this.webrtcSession.onStateChange = (state) => {
                console.log("State changed", state)
                this.clearWatchdog()
                if (state == "connected") {
                    SSH.closeChannel({channel: cid})
                    this.onStateChange(state)
                    this.webrtcSession.onStateChange = this.onStateChange
                    resolve(this.webrtcSession)
                }
            }
            this.webrtcSession.onIceCandidate = e => {
                const candidate = JSON.stringify(e.candidate)
                this.sentMessages.push(candidate)
                SSH.writeToChannel({channel: cid, message: candidate + "\n"})
            }
            this.webrtcSession.onNegotiationNeeded = () => {
                this.t7.log("on negotiation needed")
                this.webrtcSession.pc.createOffer().then(d => {
                    const offer = JSON.stringify(d)
                    this.webrtcSession.pc.setLocalDescription(d)
                    this.sentMessages.push(offer)
                    SSH.writeToChannel({channel: cid, message: offer + "\n"})
                })
            }
            this.webrtcSession.connect(marker)
        })
    } 
    async newWebRTCSession(session: string, marker: number): Promise<void> {
        const channel = new SSHChannel()
        const cid = (await SSH.newChannel({session: session})).id
        this.t7.log("got new channel with id ", cid)
        channel.id = cid
        channel.onClose = () => this.t7.log("webexec accept session closed")
        try {
            await SSH.startShell({channel: cid, command: ACCEPT_CMD },
                m => {
                    if (m && m.data)
                        this.onAcceptData(cid, marker, m.data)
                })
        } catch (e) { 
            this.t7.log("Failed starting webexec", e)
            this.clearWatchdog()
            throw e
        }
    }
    async openChannel(cmd: string, parent?: ChannelID, sx?: number, sy?: number) {

        if (!this.webrtcSession) {
            return super.openChannel(cmd, parent, sx, sy)
        } else
            // start webrtc data channel
            return this.webrtcSession.openChannel(cmd, parent, sx, sy)
    }

    async reconnect(marker?: number) {
        if (this.webrtcSession)
            return this.webrtcSession.reconnect(marker)
        else
            return this.connect(marker)
    }
    close() {
        if (this.webrtcSession)
            return this.webrtcSession.close() 
        else
            return super.close()
    }

    getPayload(): Promise<string> {
        if (this.webrtcSession)
            return this.webrtcSession.getPayload() 
        else
            return super.getPayload()
    }
    setPayload(payload: string): Promise<void>{
        if (this.webrtcSession)
            return this.webrtcSession.setPayload(payload) 
        else
            return super.setPayload(payload)
    }
    disconnect(): Promise<void> {
        if (this.webrtcSession)
            return this.webrtcSession.disconnect() 
        else
            return super.disconnect()
    }
    public get isSSH() {
        return !this.webrtcSession 
    }
}
