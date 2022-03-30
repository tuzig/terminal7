import { SSH, SSHSessionID, TerminalType, SSHSessionByPass } from 'capacitor-ssh-plugin'
import { Channel, BaseChannel, BaseSession, State }  from './session' 

export class SSHChannel extends BaseChannel {
    close(): Promise<void> {
        return SSH.closeShell({channel: this.id})
    }
    send(data: string): void {
        SSH.writeToChannel({channel: this.id, s: data})
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
    connect() {
        SSH.startSessionByPasswd(this.byPass).then(id => {
            this.id = id
            this.onStateChange("connected")
        })
    }

    openChannel(cmd: string, parent?: ChannelID, sx?: number, sy?: number):
         Promise<Channel> {
        return new Promise((resolve, reject) => {
            const channel = new SSHChannel()
            SSH.startShell(TerminalType.PtyTerminalXterm, this.id,
                                 (m) => channel.onMessage(m))
                     .then(id => {
                             channel.id = id
                             SSH.setPtySize({channel: id, width: sx, height: sy})
                                      .then(() => resolve(channel))
                     }).catch(reject)
        })
    }
    close(): Promise<void>{
    }
}
