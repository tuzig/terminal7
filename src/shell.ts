import { T7Map } from './map'
import { Terminal } from '@tuzig/xterm'
import { commands } from './commands'
import { Fields, Form } from './form'
import { Clipboard } from "@capacitor/clipboard"
import { Gate } from './gate'
import { WebRTCSession } from './webrtc_session'

export class Shell {

    map: T7Map
    t: Terminal
    onKey: (ev: KeyboardEvent) => void
    active = false
    activeForm: Form

    constructor(map: T7Map) {
        this.map = map
        this.t = map.t0
    }

    start() {
        if (this.active)
            return
        this.active = true
        let field = ''
        this.t.scrollToBottom()
        this.onKey = ev => {
            const key = ev.key
            switch (key) {
                case "Enter":
                    this.t.write("\n")
                    this.handleInput(field)
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

    handleInput(input: string) {
        const [cmd, ...args] = input.trim().split(/\s+/)
        this.execute(cmd, args)
    }

    execute(cmd: string, args: string[]) {
        if (this.activeForm) 
            this.escapeActiveForm()
        const command = commands.get(cmd)
        if (!command)
            return this.t.writeln(`Command not found: ${cmd}`)
        command.execute(args).then(res => res && this.t.writeln(res))
        .catch(err => this.t.writeln(`Error: ${err}`))
    }

    stop() {
        this.active = false
        this.onKey = null
    }

    async newForm(fields: Fields, type: "menu" | "choice" | "text") {
        this.escapeActiveForm()
        this.map.showLog(true)
        this.t.writeln("\n")
        this.t.scrollToBottom()
        this.stop()
        this.activeForm = new Form(fields)
        let promise
        switch (type) {
            case "menu":
                promise = this.activeForm.menu(this.t)
                break
            case "choice":
                promise = this.activeForm.chooseFields(this.t)
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
            return null
        }
    }

    escapeActiveForm() {
        if (!this.activeForm) return
        this.t.scrollToBottom()
        this.t.writeln("\n\nESC")
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
                gate.disengage().then(() => {
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
                gate.disengage().then(() => {
                    if (gate.session) {
                        gate.session.close()
                        gate.session = null
                    }
                    gate.connect(() => {
                        gate.clear()
                        this.map.showLog(false)
                        gate.activeW = gate.addWindow("", true)
                        gate.focus()
                    })
                }).catch(() => {
                    gate.notify("Connect failed")
                    gate.reset()
                })
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
}

