type Command = {
    name: string
    help: string
    usage: string
    execute(args: string[]): Promise<string | null>
}

export const commands: Map<string, Command> = new Map()

commands.set('help', {
    name: "help",
    help: "This help",
    usage: "help [command]",
    execute: async (args: string[]) => {
        let help = "" 
        if (!args[0]) {
            help += "\x1B[1mAvailable commands:\x1B[0m\n"
            for (const [name, command] of commands) {
                help += `  ${name}: ${command.help}\n`
            }
            help += "\nType 'help <command>' for more information."
        } else {
            const command = commands.get(args[0])
            if (!command)
                return `Command not found: ${args[0]}`
            help += `\x1B[1m${command.name}\x1B[0m\n`
            help += `  ${command.help}\n`
            help += `  Usage: ${command.usage}`
        }
        return help
    }
})

commands.set('fortune', {
    name: "fortune",
    help: "Get a fortune",
    usage: "fortune",
    execute: async () => {
        const res = await fetch("https://raw.githubusercontent.com/ruanyf/fortunes/master/data/fortunes")
        return (await res.text()).split("%\n")[Math.floor(Math.random() * 100)].trim()
    }
})

commands.set('echo', {
    name: "echo",
    help: "Echo a message",
    usage: "echo <message>",
    execute: async (args: string[]) => {
        return args.join(" ")
    }
})

commands.set('clear', {
    name: "clear",
    help: "Clear the screen",
    usage: "clear",
    execute: async () => {
        return "\x1Bc"
    }
})

commands.set('connect', {
    name: "connect",
    help: "Connect to an existing host",
    usage: "connect <hostname>",
    execute: async (args: string[]) => {
        const hostname = args[0]
        if (!hostname)
            return "Missing hostname"
        const gates = terminal7.gates
        const gate = gates.get(hostname)
        if (!gate)
            return `Host not found: ${hostname}`
        gate.connect()
    }
})

commands.set('reset', {
    name: "reset",
    help: "Reset the current connection",
    usage: "reset",
    execute: async () => {
        const gate = terminal7.activeG
        if (!gate)
            return "No active connection"
        await gate.reset()
    }
})

