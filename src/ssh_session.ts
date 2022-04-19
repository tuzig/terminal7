import { SSH, SSHSessionID, TerminalType, SSHSessionByPass} from 'capacitor-ssh-plugin'
import { Channel, BaseChannel, BaseSession, State }  from './session' 

export class SSHChannel extends BaseChannel {
    id: number
    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            SSH.closeChannel({channel: this.id})
               .then(() => {
                   this.onClose("Shell closed")
                   resolve()
                }).catch(e => console.log("error from close SSH channel", e))
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
    onStateChange : (state: State) => void
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
        SSH.startSessionByPasswd(this.byPass)
           .then(({ session }) => {
               console.log("Got ssh session", session)
                this.id = session
                this.onStateChange("connected")
           }).catch(e => {
               console.log("SSH startSession failed", e)
               this.onStateChange("wrong password")
           })
    }

    openChannel(cmd: string, parent?: ChannelID, sx?: number, sy?: number):
         Promise<Channel> {
        return new Promise((resolve, reject) => {
            let newC
            const channel = new SSHChannel()
            SSH.newChannel({session: this.id})
               .then(({ id }) => {
                channel.id = id
                SSH.startShell({channel: id},
                    m => {
                        if ((!m) || (m.EOF) || ('ERROR' in m)) {
                            console.log("ssh read got error ", m)
                            channel.onClose("Shell closed")
                        } else 
                            channel.onMessage(m)
                    })
                   .then(callbackID => {
                        console.log("got from startShell: ", callbackID)
                        resolve(channel, id)
                        SSH.setPtySize({channel: id, width: sx, height: sy})
                           .then(() => {
                            console.log("after setting size")
                            resolve(channel, id)
                           })

                    }).catch(e => { console.log("failed startshell", e); reject(e) })
                })
        })
    }
    close(): Promise<void>{
    }
}
