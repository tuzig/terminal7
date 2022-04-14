import { SSH, SSHSessionID, TerminalType, SSHSessionByPass} from 'capacitor-ssh-plugin'
import { Channel, BaseChannel, BaseSession, State }  from './session' 

export class SSHChannel extends BaseChannel {
    id: number
    close(): Promise<void> {
        return SSH.closeShell({channel: this.id})
    }
    send(data: string): void {
        SSH.writeToChannel({channel: this.id, message: data})
    }
    resize(sx: number, sy: number): Promise<void> {
        return SSH.setPtySize({channel: this.id, width: sx, height: sy})
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
    async connect() {
        const { session } = await SSH.startSessionByPasswd(this.byPass)
        console.log("Got session id", session) 
        this.id = session
        this.onStateChange("connected")
    }

    openChannel(cmd: string, parent?: ChannelID, sx?: number, sy?: number):
         Promise<Channel> {
        return new Promise(async (resolve, reject) => {
            const channel = new SSHChannel()
            const { id } = await SSH.newChannel({session: this.id})
            channel.id = id
            SSH.startShell({channel: id},
                           m => {
                            if (m)
                                channel.onMessage(m)
                            else
                                channel.onClose("Shell closed")
                           })
                     .then(callbackID => {
                         console.log("got from startShell: ", callbackID)
                         resolve(channel, id)
                         SSH.setPtySize({channel: id, width: sx, height: sy})
                                      .then(() => {
                                          console.log("after setting size")
                                          resolve(channel, id)
                                      })

                     }).catch(reject)
        })
    }
    close(): Promise<void>{
    }
}
