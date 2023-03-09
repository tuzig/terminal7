import { Capacitor } from '@capacitor/core'
import { Device } from '@capacitor/device';
import { CapacitorPurchases } from '@capgo/capacitor-purchases'
import { Clipboard } from "@capacitor/clipboard"
import { Terminal } from '@tuzig/xterm'
import { Command, loadCommands } from './commands'
import { Fields, Form } from './form'
import { Gate } from "./gate"
import { T7Map } from './map'
import { Failure } from "./session"
import { HTTPWebRTCSession } from './webrtc_session'

export class Shell {

    prompt = "TWR> "

    emailRe = /^(([^<>()[..,;:.@"]+(.[^<>()[..,;:.@"]+)*)|(".+"))@(([^<>()[..,;:.@"]+.)+[^<>()[..,;:.@"]{2,})$/i;


    map: T7Map
    t: Terminal
    active = false
    activeForm: Form | null
    commands: Map<string, Command>
    currentLine = ''
    watchdog: number
    timer: number | null = null

    constructor(map: T7Map) {
        this.map = map
        this.t = map.t0
    }

    async serverInstall(session: HTTPWebRTCSession, ID: string) {
    }
    async PBConnect(appUserId: string) {
        this.map.showLog(true)
        const schema = terminal7.conf.peerbook.insecure? "http" : "https"
        const url = `${schema}://${terminal7.conf.net.peerbook}/we`
        const headers = {"Bearer": appUserId, "Content-Type": "application/json"}
        const session = new HTTPWebRTCSession(url, headers)
        return session
    }
    async onPurchasesUpdate(data) {
        terminal7.log('purchasesUpdate', data)
        /*
        if (!data.purchases || data.customerInfo.activeSubscriptions.includes(data.purchases.identifier))
            return
            */

        // intialize the http headers with the bearer token
        const session = await this.PBConnect(data.customerInfo.originalAppUserId)
        session.onStateChange = async (state, failure?) => {
            terminal7.log("state change", state)
            if (state == 'connected') {
                let reply = []
                this.t.writeln(`Connected to ${this.addr}`)
                let email: string
                let peerName: string

                // this.t.writeln("Got a purchase update, connecting to peerbook")
                try {
                    peerName = await this.askValue("Peer name", (await Device.getInfo()).name)
                    email = await this.askValue("Recovery email")
                } catch (e) {
                    this.t.writeln("Aborted: "+e)
                    this.printPrompt()
                    return
                }
                const cmd = ["register", peerName, email]
                const regChannel = await session.openChannel(cmd, 0, 80, 24)
                regChannel.onClose = async m => {
                    const repStr =  new TextDecoder().decode(reply)
                    console.log("got chgannel close", repStr)
                    const userData = JSON.parse(repStr)
                    // parse the json
                    
                    const QR = userData.QR
                    const ID = userData.ID
                    this.t.writeln("Please scan this QR code with your OTP app")
                    this.t.writeln("")
                    this.t.writeln(QR)
                    this.t.writeln("")
                    this.t.writeln("and use it to generate a One Time Password")
                    let validated = false
                    while (!validated) {
                        const otp = await shell.askValue("OTP")
                        const validateChannel = await session.openChannel(`validate ${otp}`, 0, 80, 24)
                        validateChannel.onMessage = (data: string) => {
                            if (!validated && data[0]=="1")
                                validated = true
                        }
                    }
                    if (validated) {
                        this.t.writeln(`Validated!\nYour user ID is ${ID}`)
                        await this.serverInstall(session, ID)
                    }
                }
                regChannel.onMessage = async (data: Uint8Array) => {
                    console.log("Got registration data", data)
                    reply.push(...data)
                }
            }
        }
        await session.connect()
    }
    async startPurchases() {
        await CapacitorPurchases.setDebugLogsEnabled({ enabled: true }) 
        await CapacitorPurchases.setup({ apiKey:'appl_qKHwbgKuoVXokCTMuLRwvukoqkd'})
        CapacitorPurchases.addListener('purchasesUpdate', async (data) => {
            this.onPurchasesUpdate(data)
        })
    }

    async start() {
        if (this.active)
            return
        this.active = true
        this.commands = loadCommands(this)
        this.currentLine = ''
        this.t.scrollToBottom()
        document.addEventListener('keydown', ev => this.updateCapsLock(ev))
        this.startPurchases()
    }
    
    async onKey(ev: KeyboardEvent) {
        const key = ev.key
        switch (key) {
            case "Enter":
                this.t.write("\n\x1B[K")
                await this.handleLine(this.currentLine)
                this.currentLine = ''
                break
            case "Backspace":
                if (this.currentLine.length > 0) {
                    this.currentLine = this.currentLine.slice(0, -1)
                    this.t.write("\b \b")
                }
                break
            case "Tab":
                this.handleTab()
                break
            default:
                if (key.length == 1) { // make sure the key is a char
                    this.currentLine += key
                    this.t.write(key)
                }
        }
    }

    handleTab() {
        const [cmd, ...args] = this.currentLine.trim().split(/\s+/)
        if (!cmd || args.length > 0)
            return
        const matches = []
        for (const c of this.commands) {
            if (c[0].startsWith(cmd))
                matches.push(c[0])
        }
        if (matches.length == 1) {
            this.currentLine = matches[0] + ' '
            this.printPrompt()
        } else if (matches.length > 1) {
            this.t.write("\x1B[s\n")
            this.t.write(matches.join(' '))
            this.t.write("\x1B[u")
        }
    }

    async handleLine(input: string) {
        const [cmd, ...args] = input.trim().split(/\s+/)
        await this.execute(cmd, args)
        this.currentLine = ''
        this.printPrompt()
    }

    async execute(cmd: string, args: string[]) {
        if (!cmd)
            return
        let exec = null
        for (const c of this.commands) {
            if (c[0].startsWith(cmd))
                if (exec == null)
                    exec = c[1].execute
                else
                    return this.t.writeln(`Ambiguous command: ${cmd}`)
        }

        if (exec == null)
            return this.t.writeln(`Command not found: "${cmd}" (hint: \`help\`)`)
        this.active = false
        try {
            await exec(args)
        } catch (e) {}
        this.active = true
    }

    async runCommand(cmd: string, args: string[] = []) {
        this.map.showLog(true)
        await this.escapeActiveForm()
        await this.escapeWatchdog()
        this.map.interruptTTY()
        this.currentLine = [cmd, ...args].join(' ')
        this.printPrompt()
        this.t.write("\n")
        await this.handleLine(this.currentLine)
    }

    async runForm(fields: Fields, type: "menu" | "choice" | "text", title="") {
        await this.escapeActiveForm()
        this.stopWatchdog()
        this.map.showLog(true)
        this.t.write("\r\x1B[K")
        this.t.scrollToBottom()
        if (title)
            this.t.writeln(title)
        this.activeForm = new Form(fields)
        let run
        switch (type) {
            case "menu":
                run = this.activeForm.menu.bind(this.activeForm)
                break
            case "choice":
                run = this.activeForm.chooseFields.bind(this.activeForm)
                break
            case "text":
                run = this.activeForm.start.bind(this.activeForm)
                break
            default:
                throw new Error("Unknown form type: " + type)
        }
        try {
            const res = await run(this.t)
            this.activeForm = null
            return res
        } catch (err) {
            await this.escapeActiveForm()
            throw err
        }
    }

    async escapeActiveForm() {
        if (!this.activeForm) return
        this.t.scrollToBottom()
        this.printBelowForm("ESC\n")
        this.activeForm.reject(new Error("aborted"))
        this.activeForm = null
        await new Promise(r => setTimeout(r, 100))
        this.printPrompt()
    }

    async escapeWatchdog() {
        if (!this.watchdog) return
        this.stopWatchdog()
        if (terminal7.activeG)
            terminal7.activeG.onFailure("Overrun")
        await new Promise(r => setTimeout(r, 100))
        this.printPrompt()
    }
    
    async keyHandler(ev: KeyboardEvent) {
        const form = this.activeForm,
            key = ev.key
        this.updateCapsLock(ev)
        this.printPrompt()
        if (key == 'Escape') {
            await this.escapeActiveForm()
            await this.escapeWatchdog()
        } else if ((ev.ctrlKey || ev.metaKey) && (key == 'v')) {
            Clipboard.read().then(res => {
                if (res.type == 'text/plain') {
                    form.field += res.value
                    if (!form.hidden)
                        this.t.write(res.value)
                }
            })
        } else if (form?.onKey)
            form.onKey(ev)
        else if (this.active)
            this.onKey(ev)
        ev.preventDefault()
    }

    onFormError(err: Error) {
        terminal7.log("Form error: " + err)
    }

    printBelowForm(text: string, returnToForm = false) {
        if (!this.activeForm) return
        this.t.scrollToBottom()
        this.t.write(`\x1B[s\x1B[${this.activeForm.fields.length-this.activeForm.currentField}B\n\x1B[K${text}`)
        if (returnToForm)
            this.t.write(`\x1B[u`)
    }

    printPrompt() {
        if (this.activeForm || !this.active) return
        this.t.write(`\r\x1B[K${this.prompt}${this.currentLine}`)
    }

    updateCapsLock(ev: KeyboardEvent) {
        const e = document.getElementById("capslock-indicator")
        if (ev.getModifierState("CapsLock"))
            e.classList.remove("hidden")
        else
            e.classList.add("hidden")
    }

    /* 
     * Starts a watchdog that will reject if not stopped within the given time
    */
    startWatchdog() {
        const timeout = terminal7.conf.net.timeout
        return new Promise((_, reject) => {
            this.startHourglass(timeout)
            this.watchdog = window.setTimeout(() => {
                console.log("WATCHDOG stops the gate connecting")
                this.stopWatchdog()
                reject(Failure.TimedOut)
            }, timeout)
        })
    }

    stopWatchdog() {
        if (!this.watchdog) return
        clearTimeout(this.watchdog)
        this.watchdog = 0
        this.stopHourglass()
    }

    startHourglass(timeout: number) {
        if (this.timer) return
        const len = 20,
            interval = timeout / len
        let i = 0
        this.timer = window.setInterval(() => {
            const dots = Math.max(0, len - i) // i should never be > len, but just in case
            this.t.write(`\r\x1B[KTWR ${" ".repeat(i)}ᗧ${"·".repeat(dots)}🍒\x1B[?25l`)
            i++
        }, interval)
    }

    stopHourglass() {
        if (!this.timer) return
        clearInterval(this.timer)
        this.timer = null
        this.t.write(`\r\x1B[K\x1B[?25h`)
    }

    getGate(name: string) {
        let ret = terminal7.gates.get(name)
        if (!ret) {
            // eslint-disable-next-line
            for (const [_, maybe] of terminal7.gates) {
                if (maybe.name == name)
                    return maybe
                if (maybe.name.startsWith(name)) {
                    if (ret) {
                        this.t.writeln(`Ambiguous gate: ${name}`)
                        throw new Error("Ambiguous gate")
                    }
                    ret = maybe
                }
            }
        }
        return ret
    }

    /*
     * onDisconnect is called when a gate disconnects.
     */
    async onDisconnect(gate: Gate, offerSub: bool) {
        if (!terminal7.netStatus.connected || terminal7.recovering ||
            ((terminal7.activeG != null) && (gate != terminal7.activeG)))
            return

        if (gate.firstConnection) {
            this.t.writeln("Failed to connect")
            let ans: string
            const verifyForm = [{
                prompt: `Does the address \x1B[1;37m${gate.addr}\x1B[0m seem correct?`,
                    values: ["y", "n"],
                    default: "y"
            }]
            try {
                ans = (await this.runForm(verifyForm, "text"))[0]
            } catch(e) {
                return gate.onFailure(Failure.WrongAddress)
            }

            if (ans == "n") {
                gate.delete()
                setTimeout(() => this.handleLine("add"), 100)
                return gate.onFailure(Failure.WrongAddress)
            }
            if (!gate.session.isSSH) {
                const cmd = "bash <(curl -sL https://get.webexec.sh)"
                const webexecForm = [{
                    prompt: `Make sure webexec is running on ${gate.addr}:
                        \n\x1B[1m${cmd}\x1B[0m\n\nCopy to clipboard?`,
                            values: ["y", "n"],
                            default: "y"
                }]
                try {
                    ans = (await this.runForm(webexecForm, "text"))[0]
                } catch(e) {
                    return gate.onFailure(Failure.WrongAddress)
                }
                if (ans == "y")
                    Clipboard.write({ string: cmd })
            }
        }

        if (offerSub) {
            await this.runCommand("subscribe")
            return
        } 
        const reconnectForm = [
            { prompt: "Reconnect" },
            { prompt: "Close" }
        ]

        if (gate.session) {
            gate.session.close()
            gate.session = null
        }
        let res
        try {
            res = await this.runForm(reconnectForm, "menu")
        } catch (err) {
            gate.onFailure(Failure.Aborted)
        }
        // TODO: needs refactoring
        if (res == "Close")
            gate.onFailure(Failure.Aborted)
        if (res == "Reconnect")
            this.runCommand("connect", [gate.name])
    }
    
    async askPass(): Promise<string> {
        const res = await this.map.shell.runForm(
            [{ prompt: "Password", password: true }], "text")
        return res[0]
    }
    async askValue(prompt: string, def?): Promise<string> {
        const res = await this.map.shell.runForm(
                [{ prompt: prompt, default: def }], "text")
        return res[0]
    }
}

