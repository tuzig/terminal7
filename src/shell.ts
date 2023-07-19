import { Channel } from "./session"
import { Clipboard } from "@capacitor/clipboard"
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

    /*
     * newPBSession opens a webrtc connection the the server to be used to admin
     * the peerbook
     */
    newPBSession(appUserId?: string) {
        console.log("newPBSession")
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
    async start() {
        if (this.active)
            return
        this.active = true
        this.commands = loadCommands(this)
        this.currentLine = ''
        this.t.scrollToBottom()
        document.addEventListener('keydown', ev => this.updateCapsLock(ev))
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
        let capsOn = ev.getModifierState("CapsLock")
        if (ev.key == "CapsLock") // if the key is CapsLock the state is not updated yet
            capsOn = !capsOn
        const e = document.getElementById("capslock-indicator")
        if (capsOn)
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
                console.log("WATCHDOG TIMEOUT")
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
            terminal7.saveDotfile(area.value)
            this.t.writeln("Saved changes")
        } else {
            this.t.writeln("Discarded changes")
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
    async onDisconnect(gate: Gate, wasSSH?: boolean) {
        console.log("onDisconnect", gate)
        this.stopWatchdog()
        if (wasSSH) {
            terminal7.notify("SSH Session Lost")
            const toConnect = terminal7.pb.isOpen()?await this.offerInstall(gate, "Reconnect using SSH"):
                await this.offerSub(gate)
            if (toConnect)
                await this.runCommand("connect", [gate.name])
            return
        } 
        if (!terminal7.netConnected || terminal7.recovering ||
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
            if (gate.session.isSSH) {
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
            await this.runCommand("connect", [gate.name])
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
    async verifyFP(fp: string, prompt?: string) {
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
                        session.onStateChange = async (state, failure) => {
                            if (state == 'connected') {
                                resolve()
                            } else if (state == 'failed')
                                reject(failure)
                        }
                        session.connect()
                    }))
                } catch(e) {
                    if (e == Failure.Unauthorized) {
                        this.t.writeln("Seems like you're not subscribed to PeerBook")
                        this.t.writeln("Use `subscribe` to subscribe")
                    } else
                        this.t.writeln(`Failed to connect to PeerBook: ${e}`)
                    throw e
                }
            }
            const channel = await this.pbSession.openChannel(["verify", fp, otp], 0, 80, 24)
            channel.onMessage = (data: Uint8Array) => {
                gotMsg = true
                console.log("Got verify reply", data[0])
                validated = data[0] == "1".charCodeAt(0)
            }
            while (!gotMsg) {
                await (new Promise(r => setTimeout(r, 100)))
            }
            if (!validated)
                this.t.writeln("Invalid OTP, please try again")
        }
    }
    async reset() {
        this.pbSession = null
    }
    async offerInstall(gate, firstOption?): Promise<boolean> {
        if (gate.onlySSH)
            return true
        this.t.writeln("\rInstall WebExec for persistent sessions over WebRTC")
        const install = [
            { prompt: firstOption || "Connect over SSH" },
            { prompt: "Install" },
            { prompt: "Always use SSH" },
            { prompt: "Close Gate" },
        ]
        const res = await this.runForm(install, "menu", "Please choose")
        let ret = true
        switch (res) {
            case "Install":
                await this.runCommand(`install ${gate.name}`)
                break
            case  "Close Gate":
                gate.close()
                ret = false
                break
            case "Always use SSH":
                gate.onlySSH = true
                terminal7.storeGates()
                break
        }
        return ret
    }
    async offerSub(gate): Promise<boolean> {
        this.t.writeln("[2K\nSubscribe to PeerBook and enjoy:")
        this.t.writeln("  󰟆  Persistent Sessions")
        this.t.writeln("  󰴽  WebRTC Connections")
        this.t.writeln("  󰟀  Behind-the-NAT Servers")
        this.t.writeln("    Address Book\n")
        const reconnect = [
            { prompt: "Reconnect using SSH" },
            { prompt: "Subscribe" },
            { prompt: "Close Gate" },
        ]
        const res = await this.runForm(reconnect, "menu", "Please choose")
        if (res == "Subscribe") {
            await this.runCommand("subscribe")
            return false
        } else if (res == "Close Gate") {
            gate.close()
            return false
        }
        return true
    }
}
