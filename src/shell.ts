import { T7Map } from './map'
import { Terminal } from '@tuzig/xterm'
import { loadCommands, Command } from './commands'
import { Fields, Form } from './form'
import { Clipboard } from "@capacitor/clipboard"

export class Shell {

    prompt = "T7> "

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
    }
    
    async onKey(ev: KeyboardEvent) {
        const key = ev.key
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
            default:
                if (key.length == 1) { // make sure the key is a char
                this.currentLine += key
                this.t.write(key)
            }
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
            return this.t.writeln(`Command not found: "${args[0]}" (hint: \`help\`)`)
        this.active = false
        exec(args)
        this.active = true
    }

    async runCommand(cmd: string, args: string[]) {
        await this.escapeActiveForm()
        this.map.interruptTTY()
        this.currentLine = [cmd, ...args].join(' ')
        this.printPrompt()
        this.t.write("\n")
        await this.execute(cmd, args)
        this.currentLine = ''
        this.printPrompt()
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
            return res
        } catch (err) {
            this.onFormError(err)
            throw err
        } finally {
            this.activeForm = null
            this.printPrompt()
        }
    }

    async escapeActiveForm() {
        if (!this.activeForm) return
        this.t.scrollToBottom()
        this.printBelowForm("ESC\n")
        this.activeForm.reject(new Error("aborted"))
        this.activeForm = null
        await new Promise(r => setTimeout(r, 100))
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
    
    getGate(name: string) {
        return terminal7.gates.get(name)
    }
}

