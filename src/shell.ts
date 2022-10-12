import { T7Map } from './map'
import { Terminal } from '@tuzig/xterm'
import { loadCommands, Command } from './commands'
import { Fields, Form } from './form'
import { Clipboard } from "@capacitor/clipboard"
import { Gate } from './gate'
import { WebRTCSession } from './webrtc_session'

export class Shell {

    prompt = "T7> "

    map: T7Map
    t: Terminal
    onKey: (ev: KeyboardEvent) => void
    active = false
    activeForm: Form | null
    commands: Map<string, Command>

    constructor(map: T7Map) {
        this.map = map
        this.t = map.t0
    }

    start() {
        if (this.active)
            return
        this.active = true
        this.commands = loadCommands(this)
        let field = ''
        this.t.scrollToBottom()
        this.onKey = async ev => {
            const key = ev.key
            switch (key) {
                case "Enter":
                    this.t.write("\n")
                    await this.handleLine(field)
                    field = ''
                    break
                case "Backspace":
                    if (field.length > 0) {
                        field = field.slice(0, -1)
                        this.t.write("\b \b")
                    }
                    break
                default:
                    if (key.length == 1) { // make sure the key is a char
                        field += key
                        this.t.write(key)
                    }
            }
        }
        setTimeout(() => this.t.focus(), 0)
    }

    async handleLine(input: string) {
        const [cmd, ...args] = input.trim().split(/\s+/)
        await this.execute(cmd, args)
        this.t.write(this.prompt)
    }

    async execute(cmd: string, args: string[]) {
        if (this.activeForm) 
            this.escapeActiveForm()
        const command = this.commands.get(cmd)
        if (!command)
            return this.t.writeln(`Command not found: ${cmd}`)
        await command.execute(args)
    }

    async runCommand(cmd: string, args: string[]) {
        this.t.writeln(`${this.prompt}${cmd} ${args.join(' ')}`)
        await this.execute(cmd, args)
    }

    async newForm(fields: Fields, type: "menu" | "choice" | "text", title="") {
        this.escapeActiveForm()
        this.map.showLog(true)
        this.t.writeln("\n")
        this.t.scrollToBottom()
        this.activeForm = new Form(fields)
        let promise
        switch (type) {
            case "menu":
                promise = this.activeForm.menu(this.t)
                break
            case "choice":
                promise = this.activeForm.chooseFields(this.t, title)
                break
            case "text":
                promise = this.activeForm.start(this.t)
                break
            default:
                throw new Error("Unknown form type: " + type)
        }
        try {
            const res = await promise
            this.activeForm = null
            return res
        } catch (err) {
            this.onFormError(err)
            return
        }
    }

    escapeActiveForm() {
        if (!this.activeForm) return
        this.t.scrollToBottom()
        this.t.writeln(`\x1B[${this.activeForm.fields.length-this.activeForm.currentField}B\nESC`)
        this.activeForm.reject(new Error("aborted"))
        this.activeForm = null
    }
    
    keyHandler(ev: KeyboardEvent) {
        const form = this.activeForm,
            key = ev.key
        if (key == 'Escape') {
            this.escapeActiveForm()
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
        else {
            this.start()
            this.onKey(ev)
        }
        ev.preventDefault()
    }

    onFormError(err: Error) {
        window.terminal7.log("Form error: " + err)
        window.terminal7.clearTempGates()
        this.map.showLog(false)
    }

    async resetGate(gate: Gate) {
        const fields = [
            { prompt: "Reset connection & Layout" },
            { prompt: "Close gate" },
            { prompt: "\x1B[31mFactory reset\x1B[0m" },
        ]
        const factoryResetVerify = [{
            prompt: `Factory reset will remove all gates,\n    the certificate and configuration changes.`,
            values: ["y", "n"],
            default: "n"
        }]
        if (gate.session instanceof WebRTCSession)
            // Add the connection reset option for webrtc
            fields.splice(0,0, { prompt: "Reset connection" })
        this.t.writeln(`\x1B[4m${gate.name}\x1B[0m`)
        const choice = await this.newForm(fields, "menu")
        let ans
        switch (choice) {
            case "Reset connection":
                gate.disengage().then(async () => {
                    if (gate.session) {
                        gate.session.close()
                        gate.session = null
                    }
                    gate.t7.run(() =>  {
                        gate.connect()
                    }, 100)
                }).catch(() => gate.connect())
                break
            case "Reset connection & Layout":
                try {
                    if (gate.session) {
                        await gate.disengage()
                        gate.session.close()
                        gate.session = null
                    }
                    gate.connect(() => {
                        gate.clear()
                        gate.map.showLog(false)
                        gate.activeW = gate.addWindow("", true)
                        gate.focus()
                    })
                } catch(e) {
                    gate.notify("Connect failed")
                }
                break
            case "\x1B[31mFactory reset\x1B[0m":
                ans = (await this.newForm(factoryResetVerify, "text"))[0]
                if (ans == "y") {
                    gate.t7.factoryReset()
                    gate.clear()
                    gate.t7.goHome()
                }
                else
                    this.map.showLog(false)
                break
            case "Close gate":
                gate.boarding = false
                gate.clear()
                gate.updateNameE()
                if (gate.session) {
                    gate.session.close()
                    gate.session = null
                }
                // we need the timeout as cell.focus is changing the href when dcs are closing
                setTimeout(() => gate.t7.goHome(), 100)
                break
        }
    }

    async editGate(gate: Gate) {
        const f1 = [
            { prompt: "Connect" },
            { prompt: "Edit" },
            { prompt: "\x1B[31mDelete\x1B[0m" },
        ]
        let f2 = [
            {
                prompt: "Name",
                default: gate.name,
                validator: a => gate.t7.validateHostName(a)
            },
            { 
                prompt: "Hostname",
                default: gate.addr,
                validator: a => gate.t7.validateHostAddress(a)
            },
            { prompt: "Username", default: gate.username }
        ]
        const fDel = [{
            prompt: `Delete ${gate.name}?`,
            values: ["y", "n"],
            default: "n",
        }]
        if (typeof(gate.fp) == "string") {
            gate.notify("Got peer from \uD83D\uDCD6, connect only")
            return
        }
        this.map.showLog(true)
        this.map.interruptTTY()
        this.map.t0.write(`\nMenu for \x1B[4m${gate.name}\x1B[0m:`)
        const choice = await this.newForm(f1, "menu")
        let enabled, res
        const gateAttrs = ["name", "addr", "username"]
        switch (choice) {
            case 'Connect':
                await new Promise<void>((resolve) => {
                    gate.connect(() => {
                        gate.load()
                        resolve()
                    })
                })
                break
            case 'Edit':
                enabled = await this.newForm(f2, "choice", `\x1B[4m${gate.name}\x1B[0m edit`)
                if (!enabled) {
                    gate.t7.clear()
                    return
                }
                f2 = f2.filter((_, i) => enabled[i])
                res = await this.newForm(f2, "text")
                gateAttrs.filter((_, i) => enabled[i])
                    .forEach((k, i) => gate[k] = res[i])
                if (enabled[1]) {
                    gate.t7.gates.delete(gate.id)
                    gate.id = gate.addr
                    gate.t7.gates.set(gate.id, gate)
                }
                gate.t7.storeGates()
                gate.updateNameE()
                this.map.showLog(false)
                break
            case "\x1B[31mDelete\x1B[0m":
                res = await this.newForm(fDel, "text")
                if (res[0] == "y")
                    gate.delete()
                gate.t7.clear()
                break
        }
    }
}

