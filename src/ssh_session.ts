import { SSH, SSHSessionID, SSHSessionByPass} from 'capacitor-ssh-plugin'
import { Channel, BaseChannel, BaseSession, Failure, Session, State }  from './session' 
import { WebRTCSession }  from './webrtc_session'

export class SSHChannel extends BaseChannel {
    id: number
    close(): Promise<void> {
        console.log("trying to close ssh channel")
        return new Promise((resolve, reject) => {
            SSH.closeChannel({channel: this.id})
               .then(() => {
                   this.onClose("Shell closed")
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
}
// SSHSession is an implmentation of a real time session over ssh
export class SSHSession extends BaseSession {
    id: SSHSessionID
    byPass: SSHSessionByPass;
    onStateChange : (state: State, failure?: Failure) => void
    onPayloadUpdate: (payload: string) => void
    constructor(address: string, username: string, password: string, port=22) {
        super()
        this.byPass = {address: address,
                       username: username,
                       password: password,
                       port: port,
                      }
    }
    connect() {
        this.startWatchdog()
        SSH.startSessionByPasswd(this.byPass)
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

    handleData(channel, m) {
        if ('data' in m)
            channel.onMessage(m.data)
        else {
            terminal7.log("ssh read got error ", m.error)
            channel.onClose(m.error)
        }
    }
    openChannel(cmd: string, parent?: ChannelID, sx?: number, sy?: number):
         Promise<Channel> {
        return new Promise((resolve, reject) => {
            const channel = new SSHChannel()
            SSH.newChannel({session: this.id})
               .then(({ id }) => {
                   console.log("got new channel with id ", id)
                channel.id = id
                SSH.startShell({channel: id, command: cmd}, m => this.handleData(channel, m))
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
}
// HybridSession can run either as SSH or WebRTC bby signalling
// over SSH
export class HybridSession extends SSHSession {
    candidate: string
    webrtcSession: Session
    sentMessages: Array<string>
    onStateChange : (state: State, failure?: Failure) => void
    onPayloadUpdate: (payload: string) => void
    constructor(address: string, username: string, password: string, port=22) {
        super(address, username, password, port)
        this.candidate = ""
        this.webrtcSession = null
        this.sentMessages = []
    }
    connect(marker=-1) {
        this.startWatchdog()
        SSH.startSessionByPasswd(this.byPass)
           .then(async ({ session }) => {
                this.clearWatchdog()
                terminal7.log("Got ssh session", session)
                this.id = session
                const channel = new SSHChannel()
                const z = await SSH.newChannel({session: this.id})
                const id = z.id
                terminal7.log("got new channel with id ", id)
                channel.id = id
                channel.onClose = () => terminal7.log("webexec accept session closed")
                try {
                    await this.newWebRTCSession(id, marker)
                } catch(e) { }
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
    async onAcceptData(data: string) {
        let c = {}
        data.split("\r\n").filter(line => line.length > 0).forEach(async line => {
            terminal7.log("line webexec accept: ", line)
            this.candidate += line
            // ignore echo
            if (this.sentMessages.indexOf(this.candidate) != -1) {
                terminal7.log("igonring message: "+this.candidate)
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
                    terminal7.log("failed the add ice candidate", e.message, c)
                    return
                }
            else
                try {
                    await this.webrtcSession.pc.setRemoteDescription(c)
                } catch(e) { terminal7.log("got error setting remote desc:", e.message, c) }
        })
    }

    async newWebRTCSession(id: number, marker: number): Promise<void> {
        let callbackID=""
        try {
            callbackID = await SSH.startShell({channel: id, command: "$HOME/go/bin/webexec accept"},
                m => {
                    if (m && m.data)
                        this.onAcceptData(m.data)
                })
        } catch (e) { 
            console.log("Failed starting webexec", e)
        }
        console.log("got from webexec ID: ", callbackID)
        if (callbackID != "") {
            this.webrtcSession = new WebRTCSession()
            try {
                await new Promise<void>((resolve, reject) => {
                    // TODO: create a new override 
                    this.webrtcSession.onStateChange = (state, failure?: Failure) => {
                        console.log("State changed", state)
                        if (state == "connected") {
                            SSH.closeChannel({channel: id})
                            this.webrtcSession.onStateChange = this.onStateChange
                            resolve()
                        }
                        if (state == "failed") {
                            SSH.closeChannel({channel: id})
                            terminal7.log("Failed to open session")
                            reject()
                        }
                    }
                    this.webrtcSession.onIceCandidate = e => {
                        const candidate = JSON.stringify(e.candidate)
                        this.sentMessages.push(candidate)
                        SSH.writeToChannel({channel: id, message: candidate + "\n"})
                    }
                    this.webrtcSession.onNegotiationNeeded = () => {
                        terminal7.log("on negotiation needed")
                        this.webrtcSession.pc.createOffer().then(d => {
                            const offer = JSON.stringify(d)
                            this.webrtcSession.pc.setLocalDescription(d)
                            this.sentMessages.push(offer)
                            SSH.writeToChannel({channel: id, message: offer + "\n"})
                        })
                    }
                    this.webrtcSession.connect(marker)
                })
            } catch (e) {
                this.webrtcSession = null
                terminal7.log("signaling over ssh failed", e.message)
                return
            }
            this.routeMethods()
        }
    }
    async openChannel(cmd: string, parent?: ChannelID, sx?: number, sy?: number) {

        if (!this.webrtcSession) {
            return super.openChannel(cmd, parent, sx, sy)
        } else
            // start webrtc data channel
            return this.webrtcSession.openChannel(cmd, parent, sx, sy)
    }

    async reconnect(marker?: string) {
        this.webrtcSession = null
        return this.connect(marker)
    }
    routeMethods() {
        this.close = () =>  this.webrtcSession.close() 
        this.getPayload = () =>  this.webrtcSession.getPayload()
        this.setPayload =  (payload: string) =>  this.webrtcSession.setPayload(payload)
        this.disconnect = () => this.webrtcSession.disconnect()
    }
} 
