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
    }

    async handleLine(input: string) {
        const [cmd, ...args] = input.trim().split(/\s+/)
        await this.execute(cmd, args)
        this.field = ''
        this.printPrompt()
    }

    async execute(cmd: string, args: string[]) {
        if (this.activeForm) 
            this.escapeActiveForm()
        if (!cmd)
            return
        const command = this.commands.get(cmd)
        if (!command)
            return this.t.writeln(`Command not found: ${cmd}`)
        this.active = false
        await command.execute(args)
        this.active = true
    }

    async runCommand(cmd: string, args: string[]) {
        this.escapeActiveForm()
        this.map.interruptTTY()
        this.field = [cmd, ...args].join(' ')
        this.printPrompt()
        this.t.write("\n")
        await this.execute(cmd, args)
        this.field = ''
        this.printPrompt()
    }

    async newForm(fields: Fields, type: "menu" | "choice" | "text", title="") {
        this.escapeActiveForm()
        this.map.showLog(true)
        this.t.write("\r\x1B[K")
        this.t.scrollToBottom()
        if (title)
            this.t.writeln(title)
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
            return res
        } catch (err) {
            this.onFormError(err)
            throw err
        } finally {
            this.activeForm = null
            this.printPrompt()
        }
    }

    escapeActiveForm() {
        if (!this.activeForm) return
        this.t.scrollToBottom()
        this.printBelowForm("ESC\n")
        this.activeForm.reject(new Error("aborted"))
        this.activeForm = null
    }
    
    keyHandler(ev: KeyboardEvent) {
        const form = this.activeForm,
            key = ev.key
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
        terminal7.clearTempGates()
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
        this.t.write(`\r\x1B[K${this.prompt}${this.field}`)
    }
}

