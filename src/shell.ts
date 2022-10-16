import { T7Map } from './map'
import { Terminal } from '@tuzig/xterm'
import { loadCommands, Command } from './commands'
import { Fields, Form } from './form'
import { Clipboard } from "@capacitor/clipboard"

export class Shell {

    prompt = "T7> "

    map: T7Map
    t: Terminal
    onKey: (ev: KeyboardEvent) => void
    active = false
    activeForm: Form | null
    commands: Map<string, Command>
    field = ''

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
            this.field = field
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
        if (!cmd)
            return
        const command = this.commands.get(cmd)
        if (!command)
            return this.t.writeln(`Command not found: ${cmd}`)
        await command.execute(args)
    }

    async runCommand(cmd: string, args: string[]) {
        await this.escapeActiveForm()
        this.t.writeln(`\r${this.prompt}${cmd} ${args.join(' ')}`)
        await this.execute(cmd, args)
        this.t.write(this.prompt + this.field)
    }

    async newForm(fields: Fields, type: "menu" | "choice" | "text", title="") {
        this.escapeActiveForm()
        this.map.showLog(true)
        this.t.write("\n")
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
            this.activeForm = null
            throw err
        }
    }

    async escapeActiveForm() {
        if (!this.activeForm) return
        this.t.scrollToBottom()
        this.printBelowForm("ESC\n")
        this.activeForm.reject(new Error("aborted"))
        this.activeForm = null
    }
    
    keyHandler(ev: KeyboardEvent) {
        const form = this.activeForm,
            key = ev.key
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
        else {
            this.start()
            this.onKey(ev)
        }
        ev.preventDefault()
    }

    onFormError(err: Error) {
        terminal7.log("Form error: " + err)
        terminal7.clearTempGates()
    }

    printBelowForm(text: string, returnToForm = false) {
        if (!this.activeForm) return
        this.t.scrollToBottom()
        this.t.write(`\x1B[s\x1B[${this.activeForm.fields.length-this.activeForm.currentField}B\n\x1B[K${text}`)
        if (returnToForm)
            this.t.write(`\x1B[u`)
    }
}

