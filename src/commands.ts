import { Shell } from "./shell"

export type Command = {
    name: string
    help: string
    usage: string
    execute(args: string[]): Promise<void>
}

export function loadCommands(shell: Shell): Map<string, Command> {
    return new Map<string, Command>(Object.entries({
        help: {
            name: "help",
            help: "This help",
            usage: "help [command]",
            execute: async args => helpCMD(shell, args)
        },
        fortune: {
            name: "fortune",
            help: "Get a fortune",
            usage: "fortune",
            execute: async () => fortuneCMD(shell)
        },
        echo: {
            name: "echo",
            help: "Echo a message",
            usage: "echo <message>",
            execute: async args => echoCMD(shell, args)
        },
        clear: {
            name: "clear",
            help: "Clear the screen",
            usage: "clear",
            execute: async () => shell.t.clear()
        },
        connect: {
            name: "connect",
            help: "Connect to a new or existing host",
            usage: "connect [hostname] (leave blank to add a new host)",
            execute: async args => connectCMD(shell, args)
        },
        reset: {
            name: "reset",
            help: "Reset the current connection",
            usage: "reset",
            execute: async args => resetCMD(shell, args)
        },
        edit: {
            name: "edit",
            help: "Edit a host",
            usage: "edit <hostname>",
            execute: async args => editCMD(shell, args)
        },
        hosts: {
            name: "hosts",
            help: "List all hosts",
            usage: "hosts",
            execute: async () => hostsCMD(shell)
        },
        home: {
            name: "home",
            help: "Go to the home page",
            usage: "home",
            execute: async () => terminal7.goHome()
        }
    }))
}

async function helpCMD(shell: Shell, args: string[]) {
    let help = ""
    if (!args[0]) {
        help += "\x1B[1mAvailable commands:\x1B[0m\n"
        for (const [name, command] of shell.commands) {
            help += `  ${name}: ${command.help}\n`
        }
        help += "\nType 'help <command>' for more information."
    } else {
        const command = shell.commands.get(args[0])
        if (!command)
            help = `Command not found: ${args[0]}`
        else {
            help += `\x1B[1m${command.name}\x1B[0m\n`
            help += `  ${command.help}\n`
            help += `  Usage: ${command.usage}`
        }
    }
    shell.t.writeln(help)
}

async function fortuneCMD(shell: Shell) {
    const res = await fetch("https://raw.githubusercontent.com/ruanyf/fortunes/master/data/fortunes")
    shell.t.write((await res.text()).split("%\n")[Math.floor(Math.random() * 100)].trim())
}

async function echoCMD(shell: Shell, args: string[]) {
    shell.t.writeln(args.join(" "))
}

async function connectCMD(shell:Shell, args: string[]) {
    const hostname = args[0]
    if (hostname) {
        const gates = terminal7.gates
        const gate = gates.get(hostname)
        if (!gate)
            shell.t.writeln(`Host not found: ${hostname}`)
        gate.connect()
    } else 
        terminal7.connect()
}

async function resetCMD(shell: Shell, args: string[]) {
    let gate
    if (args[0]) {
        gate = terminal7.gates.get(args[0])
        if (!gate)
            return shell.t.writeln(`Host not found: ${args[0]}`)
    } else {
        gate = terminal7.activeG
        if (!gate)
            return shell.t.writeln("No active connection")
    }
    await terminal7.map.shell.resetGate(gate)
}

async function editCMD (shell:Shell, args: string[]) {
    const hostname = args[0]
    if (!hostname)
        shell.t.writeln("Missing hostname")
    const gates = terminal7.gates
    const gate = gates.get(hostname)
    if (!gate)
        shell.t.writeln(`Host not found: ${hostname}`)
    await terminal7.map.shell.editGate(gate)
}

async function hostsCMD(shell: Shell) {
    let res = ""
    for (const [name, gate] of terminal7.gates) {
        res += `\x1B[1m${name}:\x1B[0m ${gate.addr}\n`
    }
    shell.t.writeln(res)
}
