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
    isSSH: boolean
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
// SSHSession is an implmentation of a real time session over ssh
export class HybridSession extends SSHSession {
    candidate: string
    webrtcSession: Session
    id: SSHSessionID
    byPass: SSHSessionByPass;
    onStateChange : (state: State, failure?: Failure) => void
    onPayloadUpdate: (payload: string) => void
    constructor(address: string, username: string, password: string, port=22) {
        super(address, username, password, port)
        this.candidate = ""
        this.webrtcSession = null
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
    async onAcceptData(data: string) {
        let c = {}
        terminal7.log("from webexec accept: ", data)
        this.candidate += data
        // remove the CR & LF in the end
        if (this.candidate.slice(-1) == "\n")
            this.candidate = this.candidate.slice(0, -2)
        try {
            c = JSON.parse(this.candidate)
        } catch(e) { return }
        if (c == null) 
            return
        this.candidate = ""
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
    }

    async newWebRTCSession(id: number): Promise<void> {
        let callbackID: string
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
                        SSH.writeToChannel({channel: id, message: candidate + "\n"})
                    }
                    this.webrtcSession.onNegotiationNeeded = () => {
                        terminal7.log("on negotiation needed")
                        this.webrtcSession.pc.createOffer().then(d => {
                            const offer = JSON.stringify(d)
                            this.webrtcSession.pc.setLocalDescription(d)
                            SSH.writeToChannel({channel: id, message: offer + "\n"})
                        })
                    }
                    this.webrtcSession.connect()
                })
            } catch (e) {
                this.webrtcSession = null
                terminal7.log("signaling over ssh failed", e.message)
            }
        }
    }
    async openChannel(cmd: string, parent?: ChannelID, sx?: number, sy?: number) {

        if (!this.webrtcSession) {
            if (!this.isSSH) {
                const channel = new SSHChannel()
                let callbackID = ""
                const z = await SSH.newChannel({session: this.id})
                const id = z.id
                console.log("got new channel with id ", id)
                channel.id = id
                channel.onClose = () => terminal7.log("webexec accept session closed")
                // try opening a WebRTC connection
                try {
                    await this.newWebRTCSession(id)
                } catch(e) { } //TODO: add some code in the catch block
                if (this.webrtcSession) {
                    return this.webrtcSession.openChannel(cmd, parent, sx, sy)
                }
            } 
            this.isSSH = true
            return super.openChannel(cmd, parent, sx, sy)
        } else
            // start webrtc data channel
            // */
            return this.webrtcSession.openChannel(cmd, parent, sx, sy)
    }
} 
