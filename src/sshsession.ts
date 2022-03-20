import { BaseSession }  from './session.ts' 

export interface SSHSessionByPass {
    address: string
    username: string
    password: string
    port: number
}

// SSHSession is an implmentation of a real time session over ssh
export class SSHSession extends BaseSession {
    byPass: SSHSessionByPass;
    onStateChange : (state: RTState) => void
    onPayloadUpdate: (payload: string) => void
    constructor(address: string, username: string, password: string, port: number=22) {
        super()
        this.byPass.address = address
        this.byPass.username = username
        this.byPass.passwork = password
        this.byPass.port = port
    }
    connect() {
        SSHPlugin.startSessionByPasswd(this.byPass).then(id => {
            this.id = id
            this.onStateChange("connected")
        })
    }

    openChannel(cmd: string, parent?: RTChannelID, sx?: number, sy?: number):
        Promise<RTChannel> {
    }
    openChannel?(id: RTChannelID): Promise<RTChannel> {
    }
    close(): Promise<void>{
    }
}
