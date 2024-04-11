import { Capacitor } from '@capacitor/core'
import { Clipboard } from "@capacitor/clipboard"
import { Terminal } from '@xterm/xterm'
import CodeMirror from '@tuzig/codemirror/src/codemirror.js'
import Bowser from "bowser";

import { Channel, Failure } from "./session"
import { Command, loadCommands } from './commands'
import { Fields, Form } from './form'
import { Gate } from "./gate"
import { T7Map } from './map'
import { vimMode } from '@tuzig/codemirror/keymap/vim.js'
import { tomlMode } from '@tuzig/codemirror/mode/toml/toml.js'
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
    masterChannel: Channel | null = null
    history: string[] = []
    historyIndex = 0
    confEditor: CodeMirror.EditorFromTextArea
    exitConf: () => void
    lineAboveForm = 0
    reconnectForm = [
        { prompt: "Reconnect" },
        { prompt: "Close" }
    ]


    constructor(map: T7Map) {
        this.map = map
        this.t = map.t0
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
    
    async onKey(key: string) {
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
        // just in case - these flags can get us stuck
        terminal7.recovering = false
        terminal7.ignoreAppEvents = false
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
        await new Promise(resolve => setTimeout(resolve, 0))
        this.lineAboveForm = this.t.buffer.active.baseY + this.t.buffer.active.cursorY
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
            terminal7.activeG.onFailure(Failure.Overrun)
        await new Promise(r => setTimeout(r, 100))
        this.printPrompt()
    }
    
    onTWRData(data: string) {
        if (!this.masterChannel)
            return
        this.masterChannel.send(data)
    }
    async paste() {
        const cb = await Clipboard.read()
        if (cb.type != 'text/plain')
            return
        const text = cb.value
        if (this.activeForm) {
            this.activeForm.field += text
            if (!this.activeForm.hidden)
                this.t.write(text)
        } else if (this.active) {
            this.t.write(text)
            this.currentLine += text
        }
    }

    async keyHandler(key: string) {
        const form = this.activeForm
        this.printPrompt()
        if (key == 'Escape') {
            await this.escape()
        } else if (form?.onKey)
            form.onKey(key)
        else if (this.active)
            this.onKey(key)
    }

    async escape() {
        await this.escapeActiveForm()
        await this.escapeWatchdog()
        this.clearPrompt()
    }

    onFormError(err: Error) {
        terminal7.log("Form error: " + err)
    }

    printBelowForm(text: string, returnToForm = false) {
        if (!this.activeForm) return
        console.log("printBelowForm", this.activeForm.fields)
        this.t.write(`\x1B[s\x1B[${this.activeForm.fields.length-this.activeForm.currentField}B\n\x1B[K${text}`)
        if (returnToForm)
            this.t.write(`\x1B[u`)
    }

    printAbove(text: string) {
        if (this.activeForm) {
            this.printBelowForm("", true) // add empty line for scrolling
            setTimeout(() => {
                this.lineAboveForm++
                const line = this.lineAboveForm - this.t.buffer.active.baseY
                this.t.write(`\x1B[s\x1B[${line};H\x1B[L${text}\x1B[u\x1B[B`)
            }, 0)
            return
        }
        this.t.write(`\x1B[s\n\x1B[A\x1B[L\x1B[K${text}\x1B[u\x1B[B`)
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
        if (!(ev instanceof KeyboardEvent)) return;
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
            area    =  document.getElementById("edit-conf") as HTMLTextAreaElement,
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
        const area = document.getElementById("edit-conf") as HTMLTextAreaElement
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
    async onUnauthorized(gate: Gate) {
        const fp = await terminal7.getFingerprint()
        const suffix = Capacitor.isNativePlatform()?" and connect with SSH?":"?"
        const browser = Bowser.getParser(window.navigator.userAgent)
        const base = browser.getOS().name+"_"+browser.getBrowserName()
        const cmd = `webexec client add "${fp} ${base}_terminal7"`
        this.active = true
        const fpForm = [{ 
            prompt: `\n  ${gate.name || gate.addr} refused our fingerprint. To aprove it run:
  \n\x1B[1m    ${cmd}\x1B[0m\n
  Copy to clipboard${suffix}`,
            values: ["y", "n"],
            default: "y"
        }]
        let ans: string
        try {
            ans = (await this.runForm(fpForm, "text"))[0]
        } catch(e) { this.onFormError(e) }
        if (ans == "y")  {
            Clipboard.write({ string: cmd })
            this.t.writeln("Next, paste the command in a legacy terminal and reconnect")
            let res: string
            try {
                res = await this.runForm(this.reconnectForm, "menu")
            } catch (err) {
                gate.onFailure(Failure.Aborted)
            }
            if (res == "Reconnect") {
                await gate.connect()
                return
            }
        }
        this.currentLine = ''
        this.printPrompt()
    }

    /*
     * onDisconnect is called when a gate disconnects.
     */
    async onDisconnect(gate: Gate, wasSSH?: boolean) {
        terminal7.log("onDisconnect", gate.name, wasSSH, gate.firstConnection)
        this.stopWatchdog()
        if (wasSSH) {
            this.escapeActiveForm()
            terminal7.notify("⚠️ SSH Session might be lost")
            let toConnect: boolean
            try {
                toConnect = terminal7.pb.isOpen()?await this.offerInstall(gate, "I'm feeling lucky"):
                    await this.offerSub(gate)
            } catch(e) {
                terminal7.log("offer & connect failed", e)
                return
            }
            if (toConnect) {
                try {
                    await this.runCommand("connect", [gate.name])
                } catch(e) {
                    console.log("connect failed", e)
                }
            }
            this.printPrompt()
            return
        } 
        if (terminal7.recovering) {
            terminal7.log("retrying...")
            this.startWatchdog(terminal7.conf.net.timeout).catch(e => gate.handleFailure(e))
            try {
                await gate.reconnect()
                return
            } catch (e) {
                terminal7.log("reconnect failed", e)
                if (e == Failure.Unauthorized) {
                    terminal7.pb.notify("Unauthorized, please `subscribe`")
                    return
                }
            } finally {
                terminal7.recovering = false
                this.stopWatchdog()
            }
            return

        }
        gate.notify("❌  Connection failed")
        if (!terminal7.netConnected || (gate != terminal7.activeG))
            return

        if (gate.firstConnection) {
            let ans: string
            if (gate.addr != 'localhost') {
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
                    return
                }
            }
            const installForm = [{
                prompt: "Have you installed the backend - webexec?",
                    values: ["y", "n"],
                    default: "n"
            }]
            try {
                ans = (await this.runForm(installForm, "text"))[0]
            } catch(e) {
                return gate.onFailure(Failure.WrongAddress)
            }

            if (ans == "n") {
                setTimeout(() => this.handleLine("install "+gate.name), 100)
                return
            }

        }

        if (gate.session) {
            gate.session.close()
            gate.session = null
        }
        let res: string
        try {
            res = await this.runForm(this.reconnectForm, "menu")
        } catch (err) {
            gate.onFailure(Failure.Aborted)
        }
        if (res == "Reconnect")
            await gate.connect()
        else {
            gate.close()
            this.map.showLog(false)
        }
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
    async offerInstall(gate, firstOption?): Promise<boolean> {
        if (gate.onlySSH)
            return true
        const install = [
            { prompt: firstOption || "Connect over SSH" },
            { prompt: "Close Gate" },
        ]
        if (gate.fp && !gate.online) {
            this.t.writeln("\rTo connect over WebRTC, webexec must be running")
            this.t.writeln(`Please run \x1B[1mwebexec start\x1B[0m on the server`)
        } else {
            this.t.writeln("\rInstall WebExec for persistent sessions & WebRTC 🍯")
            install.splice(1, 0, { prompt: "Install" })
            install.splice(2, 0, { prompt: "Always use SSH" })
        }
        const res = await this.runForm(install, "menu")
        switch (res) {
            case "Install":
                gate.close()
                setTimeout(() => this.runCommand(`install ${gate.name}`), 50)
                return false
            case  "Close Gate":
                gate.close()
                return false
            case "Always use SSH":
                gate.onlySSH = true
                terminal7.storeGates()
                break
            case "I'm feeling lucky": 
                gate.focus()
                return false
        }
        return true
    }
    async offerSub(gate): Promise<boolean> {
        this.t.writeln("\rJoin our subscribers for persistent sessions and WebRTC 🍯")
        const reconnect = [
            { prompt: "I'm feeling lucky" },
            { prompt: "Learn More" },
            { prompt: "Close Gate" },
        ]
        const res = await this.runForm(reconnect, "menu")
        if (res == "Learn More") {
            gate.close()
            await new Promise(r => setTimeout(r, 15))
            await this.runCommand("subscribe")
        } else if (res == "Close Gate")
            gate.close()
        else 
            gate.focus()

        return false
    }
}

