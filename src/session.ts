export type CallbackType = (e: unknown) => void
export type ChannelID = number
export type State = "new" | "connecting" | "connected" | "reconnected" | "disconnected" | "failed"

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
    onStateChange : CallbackType
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
    connect(): void
}

export abstract class BaseChannel implements Channel {
    id?: ChannelID
    onClose : CallbackType
    onMessage : CallbackType
    abstract close(): Promise<void> 
    abstract send(data: string): void
    abstract resize(sx: number, sy: number): Promise<void>
    get readyState(): string {
        return "open"
    }
}
export abstract class BaseSession implements Session {
    onStateChange : CallbackType
    onPayloadUpdate: (payload: string) => void
    getPayload(): Promise<string | null>{
        return new Promise(resolve=> {
            resolve(null)
        })
    }
    setPayload(payload: string): Promise<void>{
        return new Promise(resolve=> {
            resolve()
        })
    }
    disconnect(): Promise<void>{
        return new Promise(resolve=> {
            resolve()
        })
    }
    fail(error) {
        terminal7.log("Session failed with error: ", error)
        this.onStateChange("disconnected")
        setTimeout(() => this.onStateChange("failed"), 200)
    }
    // for reconnect
    abstract openChannel(id: ChannelID): Promise<Channel>
    abstract openChannel(cmd: string | ChannelID, parent?: ChannelID, sx?: number, sy?: number):
        Promise<Channel> 
    abstract close(): Promise<void>
    abstract connect(): void
}
