import { Terminal } from '@xterm/xterm'

export type Fields = Array<{
    prompt:string,
    default?:string,
    values?:Array<string>,
    validator?:(field: string) => string,
    password?: boolean,
}>

export type Results = Array<string>

export class Form {

    field: string
    currentField: number
    e: HTMLElement
    reject: (value: Error) => void
    fields: Fields
    results: Results
    hidden: boolean
    onKey: ((key: string) => void) | null

    constructor(fields: Fields) {
        this.fields = fields
        this.onKey = null
    }

    chooseFields(t: Terminal) {
        const len = this.fields.length
        const enabled = new Array(len).fill(false)
        const title = "Choose fields to edit:"
        let current = 0
        this.currentField = current
        return new Promise<Array<boolean>>((resolve, reject) => {
            this.reject = reject
            t.writeln(title)
            t.writeln("[Use ⇅ to move, space to select, → to all, ← to none]")
            t.writeln(this.fields.map(f => `[ ] ${f.prompt}: ${f.default}`).join('\n'))
            t.write(`\x1B[2G\x1B[${len}A`) // move cursor to first field
            this.onKey = key => {
                const char = !enabled[current] ? 'X' : ' '
                switch (key) {
                    case "ArrowUp":
                        if (current > 0) {
                            current--
                            t.write("\x1B[A")
                        }
                        break
                    case "ArrowDown":
                        if (current < enabled.length - 1) {
                            current++
                            t.write("\x1B[B")
                        }
                        break
                    case " ":
                        enabled[current] = !enabled[current]
                        t.write(char + "\x1B[1D")
                        break
                    case "Enter":
                        this.fields = this.fields.filter((_, i) => enabled[i])
                        t.write(`\x1B[${current+2}A`) // move cursor to title
                        t.write(`\x1B[${title.length}C\x1B[J`) // clear after title
                        t.writeln(this.fields.map(f => `\x1B[1m${f.prompt}\x1B[0m`).join(', ')) // print selected fields
                        resolve(enabled)
                        break
                    case "ArrowRight":
                        enabled.fill(true)
                        if (current != 0)
                            t.write(`\x1B[${current}A`) // move cursor to first field
                        enabled.forEach(() => t.write("X\x1B[1D\x1B[1B"))
                        t.write(`\x1B[${len-current}A`) // restore cursor position
                        break
                    case "ArrowLeft":
                        enabled.fill(false)
                        if (current != 0)
                            t.write(`\x1B[${current}A`)
                        enabled.forEach(() => t.write(" \x1B[1D\x1B[1B"))
                        t.write(`\x1B[${len-current}A`)
                        break
                }
                this.currentField = current
            }
            t.focus()
        })
    }

    menu(t: Terminal) {
        const len = this.fields.length
        const enabled = new Array(len).fill(false)
        let current = 0
        this.currentField = current
        return new Promise<string>((resolve, reject) => {
            this.reject = reject
            t.writeln("[Use k & j or ⇅ to move, Enter to select]")
            t.writeln(this.fields.map(f => `  ${f.prompt}`).join('\n'))
            t.write(`\x1B[G\x1B[${len}A`) // move cursor to first field
            t.write(`\x1B[1m  ${this.fields[current].prompt}\x1B[0m\x1B[G`) // bold first field
            this.onKey = key => {
                switch (key) {
                    case "ArrowUp":
                    case "k":
                        if (current > 0) {
                            t.write(`  ${this.fields[current].prompt}\x1B[G`)
                            current--
                            t.write("\x1B[A")
                            t.write(`\x1B[1m  ${this.fields[current].prompt}\x1B[0m\x1B[G`)
                        }
                        break
                    case "ArrowDown":
                    case "j":
                        if (current < enabled.length - 1) {
                            t.write(`  ${this.fields[current].prompt}\x1B[G`)
                            current++
                            t.write("\x1B[B")
                            t.write(`\x1B[1m  ${this.fields[current].prompt}\x1B[0m\x1B[G`)
                        }
                        break
                    case "Enter":
                        t.write(`\x1B[${current+1}A\x1B[${current+1}M`) // clear above
                        t.write("\r\x1B[2P") // untab
                        t.write("\n\x1B[J") // clear below
                        resolve(this.fields[current].prompt)
                        break
                }
                this.currentField = current
            }
            setTimeout(() => t.focus(), 100)
        })
    }


    start(t: Terminal) : Promise<Results> {
        this.currentField = 0
        this.field = ''
        this.results = []
        return new Promise((resolve, reject) => {
            this.reject = reject
            this.writeCurrentField(t)
            setTimeout(() => t.focus(), 0)
            this.onKey  = key => {
                this.hidden = this.fields[this.currentField].password
                switch (key) {
                    case "Backspace":
                        if (this.field.length > 0) {
                            this.field = this.field.slice(0, -1)
                            if (!this.hidden)
                                t.write("\b \b")
                        }
                        break
                    case "Enter":
                        t.write("\n")
                        if (!this.next(t)) {
                            resolve(this.results)
                            return
                        }
                        break
                    default:
                        if (key.length == 1) { // make sure the key is a char
                            this.field += key
                            if (!this.hidden)
                                t.write(key)
                        }
                }
            }
            setTimeout(() => t.focus(), 0)
        })
    }

    waitForKey(t: Terminal) {
        this.currentField = 0
        return new Promise((resolve, reject) => {
            t.write("\nPress any key to continue...")
            this.onKey = key => {
                resolve(key)
            }
            this.reject = reject
            setTimeout(() => t.focus(), 0)
        })
    }

    // saves the current field and prints the next one
    // returns true if there are more fields to edit, false if done
    next(t: Terminal) {
        const current = this.fields[this.currentField]
        let valid = true
        if (!this.field && current.default == undefined) {
            t.writeln("Please enter a value")
            valid = false
        }
        else if (this.field && current.values && current.values.indexOf(this.field) == -1) {
            t.writeln(`Value must be one of: ${current.values.join(', ')}`)
            valid = false
        }
        else if (this.field && current.validator) {
            const err = current.validator(this.field)
            if (err) {
                t.writeln(`${err}`)
                valid = false
            }
        }
        if (!valid) {
            this.field = ''
            this.writeCurrentField(t)
            return true
        }
        this.results.push(this.field || current.default || '')
        this.field = ''
        if (this.currentField < this.fields.length - 1) {
            this.currentField++
            this.writeCurrentField(t)
            return true
        }
        return false
    }

    writeCurrentField(t: Terminal) {
        const values = this.fields[this.currentField].values
        let def = this.fields[this.currentField].default
        if (values)
            def = values.map(v => v == def ? v.toUpperCase() : v).join('/')
        if (def)
            def = ` [${def}]`
        const prompt = this.fields[this.currentField].prompt
        if (prompt.endsWith('\n'))
            t.write(prompt)
        else
            t.write(`${prompt}${def || ''}: `)
    }
}
