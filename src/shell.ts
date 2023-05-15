import * as TOML from '@tuzig/toml'
import { Device } from '@capacitor/device';
import { CapacitorPurchases } from '@capgo/capacitor-purchases'
import { Channel } from "./session"
import { Clipboard } from "@capacitor/clipboard"
import { Preferences } from '@capacitor/preferences'
import { Terminal } from 'xterm'
import { Command, loadCommands } from './commands'
import { Fields, Form } from './form'
import { Gate } from "./gate"
import { T7Map } from './map'
import { Failure } from "./session"
import { HTTPWebRTCSession } from './webrtc_session'
import CodeMirror from '@tuzig/codemirror/src/codemirror.js'
import { vimMode } from '@tuzig/codemirror/keymap/vim.js'
import { tomlMode} from '@tuzig/codemirror/mode/toml/toml.js'
import { dialogAddOn } from '@tuzig/codemirror/addon/dialog/dialog.js'
import * as TOML from '@tuzig/toml'

const PEERBOOK = "\uD83D\uDCD6"

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
    pbSession: HTTPWebRTCSession | null = null
    masterChannel: Channel | null = null
    history: string[] = []
    historyIndex = 0
    confEditor: CodeMirror.EditorFromTextArea
    exitConf: () => void

    constructor(map: T7Map) {
        this.map = map
        this.t = map.t0
    }

    async serverInstall(session: HTTPWebRTCSession, uID: string) {
        console.log("Installing server %s %v", uID, session)
    }
    /*
     * newPBSession opens a webrtc connection the the server to be used to admin
     * the peerbook
     */
    newPBSession(appUserId?: string) {
        if (this.pbSession) {
            return this.pbSession
        }
        const schema = terminal7.conf.peerbook.insecure? "http" : "https"
        const url = `${schema}://${terminal7.conf.net.peerbook}/we`
        const headers = new Map<string, string>()
        if (appUserId)
            headers.set("Bearer", appUserId)
        this.pbSession = new HTTPWebRTCSession(url, headers)
        return this.pbSession
    }
    // TODO: remove the asnyc
    async onPurchasesUpdate(data) {
        return new Promise<void>(resolve=> {
            // intialize the http headers with the bearer token
            const active = data.customerInfo.entitlements.active
            if (!active.peerbook) {
                if (this.pbSession) {
                    this.pbSession.close()
                    this.pbSession = null
                }
                if (this.active)
                    terminal7.notify("PeerBook inactive. `subscribe` for WebRTC 🍯")
                resolve()
                return
            }
            if (this.pbSession && this.pbSession.cdc) {
                return
            }
            // print the number of days left
            const uid = data.customerInfo.originalAppUserId
            Preferences.set({ key: "PBUID" , value: data.customerInfo.originalAppUserId })
            terminal7.notify(`🏪 Subscribed to ${PEERBOOK}`)
            terminal7.log("Subscribed to PB, uid: ", data.customerInfo.originalAppUserId)
            terminal7.pbConnect()
            .then(() => {
                terminal7.notify(`${PEERBOOK} Connected`)
                resolve()
            }).catch(() => {
            // if uid is temp then we need to complete registration
            // we identify temp id by checking if they contain a letter
                if (uid.match(/[a-z]/i))
                    this.completeRegistration(uid).then(resolve)
            })
        })
    }
    async completeRegistration (bearer: string) {
        return new Promise<void>(resolve => {
            // we have an active subscription and connection failure
            // trying to register registering
            this.t.writeln(`Completing ${PEERBOOK} registration`)
            this.t.writeln(`  Bearer: ${bearer}`)
            //get the temp id from local storage
            const session = this.newPBSession(bearer)
            session.onStateChange = async (state, failure?) => {
                if (state == 'connected') {
                    const reply = []
                    let email: string
                    let peerName: string
                    this.t.writeln("WebRTC Connected")
                    try {
                        peerName = await this.askValue("Peer name", (await Device.getInfo()).name)
                        email = await this.askValue("Recovery email")
                    } catch (e) {
                        console.log("Registration Cancelled", e)
                        this.t.writeln("Cancelled. Use `subscribe` to activate")
                        this.printPrompt()
                        resolve()
                        return
                    }
                    // store peerName
                    const cmd = ["register", email, peerName]
                    const regChannel = await session.openChannel(cmd, 0, 80, 24)
                    regChannel.onClose = async () => {
                        const repStr =  new TextDecoder().decode(new Uint8Array(reply))
                        console.log("got pb admin channel close")
                        let userData
                        try {
                            userData = JSON.parse(repStr)
                        } catch (e) {
                            this.t.writeln("Registration failed")
                            this.t.writeln("Please try again and if persists, contact support")
                            this.printPrompt()
                            resolve()
                            return
                        }
                        const QR = userData.QR
                        const uid = userData.ID
                        this.t.writeln("Please scan this QR code with your OTP app")
                        this.t.writeln("")
                        this.t.writeln(QR)
                        this.t.writeln("")
                        this.t.writeln("and use it to generate a One Time Password")
                        // verify ourselves - it's the first time and we were approved thanks 
                        // to the revenuecat's user id
                        const fp = await terminal7.getFingerprint()
                        try {
                            await this.verifyFP(fp, "OTP")
                        } catch(e) {
                            console.log("got an error verifying peer", e)
                            resolve()
                            // reject(e)
                            return
                        }
                        this.t.writeln(`Validated! User ID is ${uid}`)
                        this.t.writeln("Type `install` to install on a server")
                        this.printPrompt()
                        await terminal7.pbConnect()
                        await Preferences.set({ key: "PBUID" , value: uid })
                        terminal7.log("Logging in to PB, uid: ", uid)
                        await CapacitorPurchases.logIn({ appUserID: uid })
                        resolve()
                        return
                    }
                    regChannel.onMessage = async (data: Uint8Array) => {
                        console.log("Got registration data", data)
                        reply.push(...data)
                    }
                }
                else if (state == 'failed') {
                    if (failure == Failure.TimedOut) {
                        this.t.writeln("Connection timed out")
                        this.t.writeln("Please try again and if persists, contact support")
                    } else if (failure == Failure.Unauthorized) {
                        this.t.writeln("Unauthorized")
                    } else {
                        this.t.writeln("Connection failed")
                        this.t.writeln("Please try again and if persists, contact support")
                    }
                    this.pbSession = null
                    this.printPrompt()
                    resolve()
                    return
                }
            }
            this.t.writeln(`Connecting to ${PEERBOOK}`)
            session.connect()
        })
    }
    async startPurchases() {
        let appUserID = undefined
        try {
            const pbuid = await Preferences.get({ key: "PBUID" })
            if (pbuid.value)
                appUserID = pbuid.value
        } catch (e) {
            terminal7.log("No PBUID", e)
        }
        terminal7.log("RC Setup with appUserID", appUserID)
        await CapacitorPurchases.setup({
            apiKey:'appl_qKHwbgKuoVXokCTMuLRwvukoqkd',
            appUserID: appUserID
        })
        await CapacitorPurchases.setDebugLogsEnabled({ enabled: true }) 
        CapacitorPurchases.addListener('purchasesUpdate', data => {
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
        if (window.terminal7)
            this.startPurchases()
    }
    
    async onKey(ev: KeyboardEvent) {
        const key = ev.key
        if (this.masterChannel) {
            return
        }
        switch (key) {
            case "Enter":
                this.t.write("\n")
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
            case "ArrowUp":
                if (this.history.length > 0) {
                    this.historyIndex = Math.min(this.historyIndex + 1, this.history.length)
                    this.currentLine = this.history[this.historyIndex - 1]
                    this.printPrompt()
                }
                break
            case "ArrowDown":
                if (this.history.length > 0) {
                    this.historyIndex = Math.max(this.historyIndex - 1, 0)
                    this.currentLine = this.history[this.historyIndex - 1] || ''
                    this.printPrompt()
                }
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
        const matches: string[] = []
        for (const c of this.commands) {
            if (c[0].startsWith(cmd))
                matches.push(c[0])
        }
        if (matches.length == 1) {
            this.currentLine = matches[0] + ' '
            this.printPrompt()
        } else if (matches.length > 1) {
            this.t.write("\x1B[s\n\x1B[K")
            this.t.write(matches.join(' '))
            this.t.write("\x1B[u")
        }
    }

    async handleLine(input: string) {
        const [cmd, ...args] = input.trim().split(/\s+/)
        await this.execute(cmd, args)
        if (input)
            this.history.unshift(input)
        this.clearPrompt()
    }

    async execute(cmd: string, args: string[]) {
        if (!cmd)
            return
        this.t.write("\x1B[K") // clear line
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

    async runForm(fields: Fields, type: "menu" | "choice" | "text" | "wait", title?: string) {
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
            case "wait":
                run = this.activeForm.waitForKey.bind(this.activeForm)
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
    
    onTWRData(data: string) {
        if (!this.masterChannel)
            return
        this.masterChannel.send(data)
    }
    async keyHandler(ev: KeyboardEvent) {
        const form = this.activeForm,
            key = ev.key
        this.updateCapsLock(ev)
        if (this.masterChannel)
            return
        this.printPrompt()
        if (key == 'Escape') {
            await this.escapeActiveForm()
            await this.escapeWatchdog()
            this.clearPrompt()
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

    clearPrompt() {
        this.historyIndex = 0
        this.currentLine = ''
        this.printPrompt()
    }

    async waitForKey() {
        await this.runForm([], "wait")
        this.t.writeln("\n")
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
    startWatchdog(timeout? : number): Promise<void> {
        if (!timeout)
            timeout = terminal7.conf.net.timeout
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

    async openConfig() {
        const modal   = document.getElementById("settings"),
            button  = document.getElementById("dotfile-button"),
            area    =  document.getElementById("edit-conf"),
            conf    =  await terminal7.getDotfile()

        area.value = conf

        button.classList.add("on")
        modal.classList.remove("hidden")
        this.t.element.classList.add("hidden")
        if (this.confEditor == null) {
            vimMode(CodeMirror)
            tomlMode(CodeMirror)
            dialogAddOn(CodeMirror)
            CodeMirror.commands.save = () => this.closeConfig(true)
            CodeMirror.Vim.defineEx("quit", "q", () => this.closeConfig(false))

            this.confEditor  = CodeMirror.fromTextArea(area, {
                value: conf,
                lineNumbers: true,
                mode: "toml",
                keyMap: "vim",
                matchBrackets: true,
                showCursorWhenSelecting: true,
                scrollbarStyle: "null",
            })
        }
        this.confEditor.focus()
        return new Promise<void>(resolve => {
            this.exitConf = resolve
        })
    }

    closeConfig(save = false) {
        const area = document.getElementById("edit-conf")
        document.getElementById("dotfile-button").classList.remove("on")
        if (save) {
            this.confEditor.save()
            terminal7.loadConf(TOML.parse(area.value))
            terminal7.saveDotfile()
            this.t.writeln("Changes saved.")
        } else {
            this.t.writeln("Changes discarded.")
        }
        document.getElementById("settings").classList.add("hidden")
        this.t.element.classList.remove("hidden")
        this.t.focus()
        this.confEditor.toTextArea()
        this.confEditor = null
        this.exitConf()
    }

    getGate(prefix: string) {
        const maybes = terminal7.gates.filter(g => g.name.startsWith(prefix))
        if (maybes.length == 0) {
            this.t.write(`No gate found with prefix ${prefix}`)
            return null
        }
        if (maybes.length > 1) {
            // more than one, let's see if there's an exact match
            const exact = maybes.filter(g => g.name == prefix)
            if (exact.length == 1)
                return exact[0]
            this.t.write(`Multiple gates found with prefix ${prefix}: ${maybes.map(g => g.name).join(', ')}`)
            return null
        }
        return maybes[0]
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
        const res = await this.runForm(
            [{ prompt: "Password", password: true }], "text")
        return res[0]
    }
    async askValue(prompt: string, def?): Promise<string> {
        const res = await this.runForm(
                [{ prompt: prompt, default: def }], "text")
        return res[0]
    }
    async validateOTP() {
        // test if session is already connected
        // TODO: this is a hack, we should have a proper way to check
        // if a session is connected
        let validated = false
        while (!validated) {
            let gotMsg = false
            let otp
            try {
                otp = await this.askValue("OTP")
            } catch(e) {
                reject()
                return
            }
            console.log("validating OTP, opening a new sesison")
            if (!this.pbSession) {
                console.log("validating OTP, opening a new sesison")
                const session = this.newPBSession()
                try {
                    await (new Promise((resolve, reject) => {
                        session.onStateChange = async (state) => {
                            if (state == 'connected') {
                                resolve()
                            } else if (state == 'failed')
                                reject()
                        }
                        session.connect()
                    }))
                } catch(e) {
                    this.t.writeln("Failed to open WebRTC connection to PeerBook")
                    console.log("Failed to open WebRTC connection to PeerBook", e)
                    throw e
                }
            }
            const validateChannel = await this.pbSession.openChannel(["ping", otp], 0, 80, 24)
            validateChannel.onMessage = (data: string) => {
                const ret = String.fromCharCode(data[0])
                gotMsg = true
                console.log("Got ping reply", ret)
                if (ret == "1") {
                    validated = true
                }
            }
            while (!gotMsg) {
                await (new Promise(r => setTimeout(r, 100)))
            }
            if (!validated)
                this.t.writeln("Invalid OTP, please try again")
        }
    }
    async verifyFP(fp: string, prompt: string) {
        let validated = false
        // TODO:gAdd biometrics verification
        while (!validated) {
            console.log("Verifying FP", fp)
            let gotMsg = false
            let otp
            try {
                otp = await this.askValue(prompt || "Enter OTP to verify gate")
            } catch(e) {
                reject()
                return
            }
            if (!this.pbSession) {
                console.log("verifyFP: creating new session")
                const session = this.newPBSession()
                try {
                    await (new Promise((resolve, reject) => {
                        session.onStateChange = async (state) => {
                            if (state == 'connected') {
                                resolve()
                            } else if (state == 'failed')
                                reject()
                        }
                        session.connect()
                    }))
                } catch(e) {
                    this.t.writeln("Failed to open WebRTC connection to PeerBook")
                    console.log("Failed to open WebRTC connection to PeerBook", e)
                    throw e
                }
            }
            const channel = await this.pbSession.openChannel(["authorize", fp, otp], 0, 80, 24)
            channel.onMessage = (data: string) => {
                gotMsg = true
                const ret = String.fromCharCode(data[0])
                validated = ret == "1"
            }
            while (!gotMsg) {
                await (new Promise(r => setTimeout(r, 100)))
            }
            if (!validated)
                this.t.writeln("Invalid OTP, please try again")
        }
    }
}
