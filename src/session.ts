export type CallbackType = (e: unknown) => void
export type ChannelID = number
export type State = "new" | "connecting" | "connected" | "reconnected" | "disconnected" | "failed" | "unauthorized" | "wrong password"

// possible reasons for a failure
export enum Failure {
    NotImplemented='NotImplemented',
    WrongPassword='WrongPassword',
    Unauthorized='Unauthorized',
    BadMarker='BadMarker',
    BadRemoteDescription='BadRemoteDescription',
    NotSupported='NotSupported',
    TimedOut='TimedOut'
}

export interface Event {
    state: string
    data: string
    error: string
}

export interface Channel {
    id?: ChannelID
    onClose : CallbackType
    onMessage : CallbackType
    close(): Promise<void>
    send(data: string): void
    resize(sx: number, sy: number): Promise<void>
    get readyState(): string
}

export interface Session {
    onStateChange : (state: string, failure?: Failure) => void
    onPayloadUpdate: (payload: string) => void
    // for reconnect
    openChannel(id: ChannelID): Promise<Channel>
    // for new channel
    openChannel(cmd: string, parent?: ChannelID, sx?: number, sy?: number):
        Promise<Channel>
    close(): Promise<void>
    getPayload(): Promise<string>
    setPayload(payload: string): Promise<void>
    disconnect(): Promise<void>
    connect(marker?: number): void
}

export abstract class BaseChannel implements Channel {
    id?: ChannelID
    onClose : CallbackType
    onMessage : CallbackType
    abstract close(): Promise<void> 
    abstract send(data: string): void
    abstract resize(sx: number, sy: number): Promise<void>

    constructor() {
        this.onMessage = () => void 0
        this.onClose = () => void 0
    }

    get readyState(): string {
        return "open"
    }
}
export abstract class BaseSession implements Session {
    watchdog: number
    onStateChange : (state: string, failure?: Failure) => void
    onPayloadUpdate: (payload: string) => void
    constructor(fp: string, address?: string)
    constructor() {
        this.t7 = window.terminal7
    }
    getPayload(): Promise<string | null>{
        return new Promise(resolve=> {
            resolve(null)
        })
    }
    setPayload(payload: string): Promise<void> {
        return new Promise((resolve) => { 
            console.log(`ignoring payloads on ${typeof this}`)
            resolve()
        })
    }
    // base disconnect is rejected as it's not supported
    disconnect(): Promise<void>{
        return new Promise((resolve, reject) => {
            reject()
        })
    }
    // fail function emulates a WebRTC connection failure flow
    fail(failure?: Failure) {
        this.onStateChange("failed", failure)
    }
    startWatchdog(){
        this.clearWatchdog()
        this.watchdog = this.t7.run(() => {
            console.log("WATCHDOG stops the gate connecting")
            this.fail(Failure.TimedOut)
        }, this.t7.conf.net.timeout)
    }
    clearWatchdog() {
        if (this.watchdog) {
            clearTimeout(this.watchdog)
            this.watchdog = null
        }
    }
    // for reconnect
    abstract openChannel(id: ChannelID): Promise<Channel>
    abstract openChannel(cmd: string | ChannelID, parent?: ChannelID, sx?: number, sy?: number):
        Promise<Channel> 
    abstract close(): Promise<void>
    abstract connect(): void
}
