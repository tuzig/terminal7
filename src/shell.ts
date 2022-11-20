import { Clipboard } from "@capacitor/clipboard"
import { Terminal } from '@tuzig/xterm'
import { Command, loadCommands } from './commands'
import { Fields, Form } from './form'
import { Gate } from "./gate"
import { T7Map } from './map'

export class Shell {

    prompt = "TWR> "

    map: T7Map
    t: Terminal
    active = false
    activeForm: Form | null
    commands: Map<string, Command>
    currentLine = ''

    constructor(map: T7Map) {
        this.map = map
        this.t = map.t0
    }

    start() {
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

    async runCommand(cmd: string, args: string[]) {
        this.map.showLog(true)
        await this.escapeActiveForm()
        this.map.interruptTTY()
        this.currentLine = [cmd, ...args].join(' ')
        this.printPrompt()
        this.t.write("\n")
        await this.handleLine(this.currentLine)
    }

    async runForm(fields: Fields, type: "menu" | "choice" | "text", title="") {
        this.escapeActiveForm()
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
    
    keyHandler(ev: KeyboardEvent) {
        const form = this.activeForm,
            key = ev.key
        this.updateCapsLock(ev)
        this.printPrompt()
        if (key == 'Escape') {
            if (form)
                this.escapeActiveForm()
            else
                this.map.showLog(false)
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
    
    getGate(name: string) {
        let ret = terminal7.gates.get(name)
        if (!ret) {
            for (const entry of terminal7.gates) {
                if (entry[1].name == name) {
                    ret = entry[1]
                    break
                }
            }
        }
        return ret
    }

    /*
     * onDisconnect is called when a gate disconnects.
     */
    async onDisconnect(gate: Gate) {
        if (!terminal7.netStatus.connected || 
            ((terminal7.activeG != null) && (gate != terminal7.activeG)))
            return
        
        const reconnectForm = [
            { prompt: "Reconnect" },
            { prompt: "Close" }
        ]
        let res
        try {
            res = await this.runForm(reconnectForm, "menu")
        } catch(e) {
            res = null
        }
        // TODO: needs refactoring
        if (res == "Reconnect") {
            gate.session = null
            gate.connect(gate.onConnected)
        } else {
            this.map.showLog(false)
            gate.clear()
            terminal7.goHome()
        }
    }
}

