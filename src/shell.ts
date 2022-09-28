import { Terminal } from '@tuzig/xterm'
import { commands } from './commands'
import { Form } from './form'

export class Shell {

    t: Terminal
    onKey: (ev: KeyboardEvent) => void
    active = false
    activeForm: Form

    constructor(t: Terminal) {
        this.t = t
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

    escapeActiveForm() {
        if (!this.activeForm) return
        this.t.scrollToBottom()
        this.t.writeln("\n\nESC")
        this.activeForm.reject(new Error("aborted"))
        this.activeForm = null
    }
}

