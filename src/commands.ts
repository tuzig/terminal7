import { Purchases } from '@revenuecat/purchases-capacitor'
import { Clipboard } from '@capacitor/clipboard'
import { Shell } from "./shell"
import { Preferences } from "@capacitor/preferences"
import { DEFAULT_DOTFILE } from "./terminal7"
import { Fields } from "./form"
//@ts-ignore
import fortuneURL from "../resources/fortune.txt"
import { Gate } from './gate'
import { SSHSession, SSHChannel } from './ssh_session'
import { ControlMessage } from './webrtc_session'
import { Failure } from './session'
import { NativeBiometric } from 'capacitor-native-biometric'
import { Capacitor } from "@capacitor/core"
import { Filesystem, Directory , Encoding} from '@capacitor/filesystem'

export type Command = {
    name: string
    help: string
    usage: string
    execute(args: string[]): Promise<void>
}
export function loadCommands(shell: Shell): Map<string, Command> {
    return new Map<string, Command>(Object.entries({
        'add': {
            name: "add",
            help: "Add a new gate",
            usage: "a[dd]",
            execute: async () => addCMD(shell)
        },
        clear: {
            name: "clear",
            help: "Clear the TWR",
            usage: "cle[ar]",
            execute: async () => void setTimeout(() => shell.t.clear(),10)
        },
        close: {
            name: "close",
            help: "Close the current gate",
            usage: "clo[se]",
            execute: async args => closeCMD(shell, args)
        },
        config: {
            name: "config",
            help: "Edit the config file",
            usage: "conf[ig]",
            execute: async () => configCMD(shell),
        },
        connect: {
            name: "connect",
            help: "Connect to an existing gate",
            usage: "conn[ect] <gatename>",
            execute: async args => connectCMD(shell, args)
        },
        copykey: {
            name: "copykey",
            help: "Copy the public key",
            usage: "copy[key]",
            execute: async () => copyKeyCMD(shell)
        },
        edit: {
            name: "edit",
            help: "Edit a gate",
            usage: "e[dit] <gatename>",
            execute: async args => editCMD(shell, args)
        },
        fortune: {
            name: "fortune",
            help: "Get a fortune",
            usage: "f[ortune]",
            execute: async () => fortuneCMD(shell)
        },
        gates: {
            name: "gates",
            help: "List all gates",
            usage: "g[ates]",
            execute: async () => gatesCMD(shell)
        },
        help: {
            name: "help",
            help: "This help",
            usage: "he[lp] [command]",
            execute: async args => helpCMD(shell, args)
        },
        hide: {
            name: "hide",
            help: "Hide this window",
            usage: "hi[de]",
            execute: async () => shell.map.showLog(false)
        },
        install: {
            name: "install",
            help: "Install backend on a gate",
            usage: "i[nstall] [gatename]",
            execute: async args => installCMD(shell, args)
        },
        login: {
            name: "login",
            help: "Login to an existing PeerBook account",
            usage: "l[ogin]",
            execute: async () => loginCMD(shell)
        },
        map: {
            name: "map",
            help: "Back to the map",
            usage: "m[ap]",
            execute: async () => terminal7.goHome()
        },
        reset: {
            name: "reset",
            help: "Reset various settings",
            usage: "r[eset]",
            execute: async args => resetCMD(shell, args)
        },
        support: {
            name: "support",
            help: "Get support",
            usage: "sup[port]",
            execute: async () => supportCMD(shell)
        },
        subscribe: {
            name: "subscribe",
            help: "Subscripte to PeerBook",
            usage: "sub[scribe]",
            execute: async () => subscribeCMD(shell)
        },
    }))
}

async function helpCMD(shell: Shell, args: string[]) {
    let help = ""
    if (!args[0]) {
        help += `This CLI provides full control over Terminal7.

\x1B[1mAvailable commands:\x1B[0m\n
`
        for (const [, command] of shell.commands) {
            help += `  ${command.usage}: ${command.help}\n`
        }
        help += "\nType 'help <command>' for more information."
    } else {
        const command = shell.commands.get(args[0])
        if (!command) {
            if (args[0] == "copymode") {
                help +=`
Copy mode let's you navigate, search mark & copy
the active pane's buffer. Here's are the supported keys:
  hjkl & arrows:  Move
  w: word forward
  b: word backward
  e: end of word
  $: end of line
  f<Char>: forward find <char> inclusive
  F<Char>: backward find <char> inclusive
  t<Char>: forward until before <char>
  T<Char>: backward exclusive <char> 
  0: beginning of line
  Space:  Mark
  Enter:   Copy & Exit
  ?:  Search Backward
  /:  Search Forward
  q:  Quit

All navigation commands support a repetition factor.
For example, "5k" moves the cursor 5 lines up (type hi to hide).
`
            } else
                help += "No help for " + args[0]
        } else {
            help += `\x1B[1m${command.name}\x1B[0m\n`
            help += `  ${command.help}\n`
            help += `  Usage: ${command.usage}`
        }
    }
    shell.t.writeln(help)
}

async function fortuneCMD(shell: Shell) {
    const res = await fetch(fortuneURL)
    const abages = (await res.text()).split("%\n")
    shell.t.writeln(abages[Math.floor(Math.random() * abages.length)].trim())
}

async function connectCMD(shell:Shell, args: string[]) {
    const hostname = args[0]
    if (!hostname) {
        shell.t.writeln("Missing hostname")
        return
    }
    const gate: Gate = shell.getGate(hostname)
    if (!gate) {
        shell.t.writeln(`Host not found: ${hostname}`)
        return
    }
    const native = Capacitor.isNativePlatform()
    const pbOpen = terminal7.pb?.isOpen()
    let overPB = pbOpen && gate.fp?.length > 0 && gate.online
    if (overPB && !gate.verified) {
        try {
            await terminal7.pb.verifyFP(gate.fp, "Unverified peer. Please enter OTP to verify or CTRL-C")
        } catch(e) {
            if (native) {
                shell.t.writeln("Falling back to SSH")
                overPB = false
            }
            else {
                shell.t.writeln("Please verify the gate before connecting")
                return
            }
        }
    }
    if (native && !overPB)  {
        let dirty = false
        if (!gate.addr) {
            try {
                gate.addr = await shell.askValue("Host address")
            } catch (e) {
                shell.t.writeln("Failed to get host address")
                return  
            }
            dirty = true
        }
        if (!gate.username) {
            try {
                gate.username = await shell.askValue("Username")
            } catch (e) {
                shell.t.writeln("Failed to get username")
                return
            }
            dirty = true
        }
        if (dirty) {
            gate.store = true
            terminal7.storeGates()
        }
    }
    if (gate.session) {
        gate.focus()
        return
    }
    const  firstGate = (await Preferences.get({key: "first_gate"})).value
    const timeout = (firstGate == "nope") ? undefined : 10000

    shell.startWatchdog(timeout).catch(e => gate.handleFailure(e))
    if (terminal7.activeG && !terminal7.isActive(gate)) {
        terminal7.activeG.stopBoarding()
        terminal7.activeG.blur()
    }
    terminal7.activeG = gate
    gate.fitScreen = true
    try {
        await gate.connect()
    } catch(e) {
        gate.notify("Failed to connect")
        gate.notify("Please try again and if it keeps failing, `support`")
        return
    } finally {
        shell.stopWatchdog()
    }
    if (gate.firstConnection) {
        if (!gate.name) {
            const fields: Fields = [{
                prompt: "Gate's name",
                validator: (a) => gate.t7.validateHostName(a),
                default: gate.addr,
            }]
            const res = await shell.runForm(fields, "text")
            const name = res[0]
            gate.name = name
        }
        gate.verified = true
        gate.updateNameE()
        gate.store = true
        gate.firstConnection = false
        await terminal7.storeGates()
    }
    if (gate.session.isSSH && !gate.onlySSH && pbOpen) {
        let toConnect: boolean
        try {
            toConnect = await shell.offerInstall(gate)
        } catch (e) {
            toConnect = true
        }
        if (!toConnect) {
            gate.close()
            return
        }
    }
    Preferences.get({key: "first_gate"}).then(v => {
            if (v.value != "nope")
                setTimeout(() => {
                    Preferences.set({key: "first_gate", value: "nope"})
                    terminal7.toggleHelp()
                }, 200)
        })
}

async function addCMD(shell: Shell) {
    const f = [
        { prompt: "Enter destination (ip or domain[:port])" }
    ]
    let destination: string,
        hostname: string,
        sshPort = NaN
    while (isNaN(sshPort) || sshPort < 1 || sshPort > 65535) {
        try {
            destination = (await shell.runForm(f, "text"))[0]
        } catch (e) {
            console.log("got error", e)
            return
        }
        const parts = destination.split(":")
        hostname = parts[0]
        sshPort = parts[1] ? parseInt(parts[1], 10) : 22
        if (isNaN(sshPort) || sshPort < 1 || sshPort > 65535)
            shell.t.writeln("Port must be a 16 bit number")
    }

    if (shell.getGate(hostname)) {
        shell.t.writeln(`${hostname} already exists, connecting...`)
        return connectCMD(shell, [hostname])
    }
    const gate = terminal7.addGate({
        name: hostname, // temp name
        addr: hostname,
        id: hostname,
        firstConnection: true,
        store: true,
        sshPort: sshPort,
    })
    terminal7.storeGates()
    return connectCMD(shell, [gate.name])
}

async function resetCMD(shell: Shell, args: string[]) {
    let gate: Gate
    if (args[0]) {
        gate = shell.getGate(args[0])
        if (!gate) {
            return shell.t.writeln(`Host not found: ${args[0]}`)
        }
    } else {
        gate = terminal7.activeG
    }
    if (gate) {
        const fields = [
            { prompt: "Close gate" },
            { prompt: "Reset connection & Layout" },
            { prompt: "\x1B[31mFactory reset\x1B[0m" },
        ]
        if (gate.session && !gate.fitScreen)
            fields.splice(0, 0, { prompt: "Fit my screen" })
        if (!gate.onlySSH)
            // Add the connection reset option for webrtc
            fields.splice(0, 0, { prompt: "Reset connection" })
        shell.t.writeln(`\x1B[4m${gate.name}\x1B[0m`)
        let choice
        try {
            choice = await shell.runForm(fields, "menu")
        } catch (e) {
            return
        }

        switch (choice) {
            case "Fit my screen":
                gate.setFitScreen()
                shell.map.showLog(false)
                return

            case "Reset connection":
                // TODO: simplify
                if (gate.session) {
                    gate.session.onStateChange = undefined
                    gate.session.close()
                    gate.session = null
                }
                // reset peerbook connection
                terminal7.pbClose()
                try {
                    await shell.runCommand("connect", [gate.name])
                } catch(e) {
                    shell.t.writeln("Failed to connect. Please try again and if it keeps failing, close and connect fresh.")
                    shell.t.writeln("  Please take the time to write your flow\n  in ##🪳bugs🪳at https://discord.com/invite/rDBj8k4tUE")
                }
                return

            case "Reset connection & Layout":
                if (gate.session) {
                    await gate.session.setPayload("")
                    gate.session.close()
                    gate.session = null
                }
                gate.clear()
                await shell.runCommand("connect", [gate.name])
                return

            case "Close gate":
                gate.close()
                return
        }
    }
    const reset = [
        { prompt: "Dotfile" },
        { prompt: "Fingerprint" },
        { prompt: "Gates" },
        { prompt: "Private/public key" },
        { prompt: "\x1B[31mEverything\x1B[0m" },
    ]
    const factoryResetVerify = [{
        prompt: `Factory reset will remove the key, certificate,\n     all gates and configuration`,
        values: ["y", "n"],
        default: "n"
    }]
    const res = await shell.runForm(reset, "menu", "What do you want to reset?")
    let ans
    switch(res) {
        case "Dotfile":
            terminal7.saveDotfile(DEFAULT_DOTFILE)
            shell.t.writeln("dotfile back to default")
            break
        case "Fingerprint":
            await Purchases.logOut()
            await terminal7.deleteFingerprint()
            shell.t.writeln("Cleared fingerprint and disconnected from PeerBook")
            terminal7.pbClose()
            await terminal7.pbConnect()
            break
        case "Gates":
            terminal7.resetGates()
            break
        case "Private/public key":
            terminal7.keys = undefined
            NativeBiometric.deleteCredentials({ server: "dev.terminal7.default" })
            shell.t.writeln("Keys removed")
            break
        case "\x1B[31mEverything\x1B[0m":
            ans = (await shell.runForm(factoryResetVerify, "text"))[0]
            if (ans == "y") {
                terminal7.factoryReset()
            }
            else
                shell.map.showLog(false)
            break
    }
}

async function editCMD(shell:Shell, args: string[]) {
    const hostname = args[0]
    if (!hostname)
        return shell.t.writeln("Missing hostname")
    const gate = shell.getGate(hostname)
    if (!gate)
        return shell.t.writeln(`Host not found: ${hostname}`)
    const isPB = !!gate.fp
    const fMain = [
        { prompt: "Edit" },
        { prompt: "Connect" },
        { prompt: "\x1B[31mDelete\x1B[0m" },
    ]
    let fFields = [
        {
            prompt: "Name",
            default: gate.name,
            validator: a => gate.t7.validateHostName(a)
        },
        {
            prompt: isPB ? "Fallback Hostname" : "Hostname",
            default: gate.addr,
            validator: a => gate.t7.validateHostAddress(a)
        },
        { prompt: "Username", default: gate.username || "" },
        {
            prompt: "SSH port",
            default: String(gate.sshPort || 22),
            validator: a => {
                const port = parseInt(a)
                return (isNaN(port) || port > 65535 || port < 1) ? "Port must be a 16 bit number" : ""
            }
        },
        { prompt: "SSH only", values: ["y", "n"], default: gate.onlySSH ? "y" : "n" },
    ]
    const fDel = [{
        prompt: isPB ? `Delete ${gate.name} from PeerBook?` : `Delete ${gate.name}?`,
        values: ["y", "n"],
        default: "n",
    }]
    if (isPB) {
        const schema = terminal7.conf.peerbook.insecure ? "http" : "https",
            url = `${schema}://${terminal7.conf.net.peerbook}`
        shell.t.writeln(`You can also edit this peer in the web interface at \n${url}`)
    }
    const choice = await shell.runForm(fMain, "menu", "")
    let enabled, res
    const gateAttrs = ["name", "addr", "username", "sshPort", "onlySSH"]
    switch (choice) {
        case 'Connect':
            await connectCMD(shell, [hostname])
            break
        case 'Edit':
            enabled = await shell.runForm(fFields, "choice", `\x1B[4m${gate.name}\x1B[0m edit`)
            if (!enabled) {
                await gate.t7.clear()
                return
            }
            fFields = fFields.filter((_, i) => enabled[i])
            res = await shell.runForm(fFields, "text")
            if (isPB && enabled[0])
                await terminal7.pb.adminCommand(
                    new ControlMessage("rename", { target: gate.fp, name: res[0]}))
            gateAttrs.filter((_, i) => enabled[i])
                     .forEach((k, i) =>  {
                         let v = res[i]
                         if (k == "sshPort")
                             v = parseInt(v)
                         if (k == "onlySSH")
                             v = v == "y"
                         gate[k] = v
                    })
            gate.t7.storeGates()
            gate.updateNameE()
            break
        case "\x1B[31mDelete\x1B[0m":
            res = await shell.runForm(fDel, "text")
            if (res[0] != "y")
                return
            if (isPB) {
                const otp = await shell.askValue("OTP")
                try {
                    await terminal7.pb.adminCommand(
                        new ControlMessage("delete",{ target: gate.fp, otp: otp }))
                } catch (e) {
                    console.log("Failed to delete host", e)
                    shell.t.writeln("Failed to delete host")
                    return
                }
                    shell.t.writeln("Gate deleted")
            }
            gate.delete()
            break
    }
}

async function gatesCMD(shell: Shell) {
    const maxWidth = (shell.t.cols - 15) / 2
    const truncate = (s: string) => s.length > maxWidth ? s.slice(0, maxWidth - 1) + "…" : s,
        hostAtAddr = (g: Gate) => g.addr ? `${g.username || "TBD"}@${g.addr}` : "",
        fp = (g: Gate) => g.fp ? `${g.fp.slice(0, 4)}…${g.fp.slice(-4)}` : ""
    const attrs = terminal7.gates.map(g => [truncate(g.name),truncate(hostAtAddr(g)),fp(g)])
    const maxLengths = attrs.reduce((a, b) => [
        Math.max(a[0], b[0].length),
        Math.max(a[1], b[1].length),
    ], [0, 0])

    let res = "\x1B[1m" + "Name".padEnd(maxLengths[0] + 2) +
        "User@Host".padEnd(maxLengths[1] + 2) +
        "Fingerprint\x1B[0m\n"
    res += attrs.map(a => a[0].padEnd(maxLengths[0] + 2) +
        a[1].padEnd(maxLengths[1] + 2) + a[2]).join("\n") + "\n"
    
    shell.t.writeln(res)
}

async function closeCMD(shell: Shell, args: string[]) {
    let gate: Gate
    if (args[0]) {
        gate = shell.getGate(args[0])
        if (!gate)
            return shell.t.writeln(`Host not found: ${args[0]}`)
    } else {
        gate = terminal7.activeG
        if (!gate)
            return shell.t.writeln("No active connection")
    }
    gate.close()
}
async function copyKeyCMD(shell: Shell) {
    let publicKey
    try {
        const ret = await terminal7.readId()
        publicKey = ret.publicKey
    } catch(e) {
        terminal7.log("readId error", e)
        return shell.t.writeln(`Error reading key: ${e}`)
    }
    Clipboard.write({ string: publicKey })
    return shell.t.writeln(`${publicKey}\n☝️ copied to 📋`)
}
async function subscribeCMD(shell: Shell) {
    const { customerInfo } = await Purchases.getCustomerInfo()
    if (Capacitor.isNativePlatform() && !customerInfo.entitlements.active.peerbook) {
        shell.t.writeln("Join PeerBook subscribers and enjoy:")
        shell.t.writeln("")
        shell.t.writeln("  󰟆  Persistent Sessions")
        shell.t.writeln("    2FA & SRTP Based Encryption")
        shell.t.writeln("  󰴽  WebRTC w/ Direct and Relay Connections")
        shell.t.writeln("  󰟀  Behind-the-NAT Desktops connections")
        shell.t.writeln("    Ephemeral IP Servers connections")
        shell.t.write("\t\t\t(\x1B]8;;https://terminal7.dev/privacy\x07Privacy Policy\x1B]8;;\x07 & ")
        shell.t.writeln("\x1B]8;;https://www.apple.com/legal/internet-services/itunes/dev/stdeula/\x07Terms of Service\x1B]8;;\x07)")
        const TYPES = {
            "MONTHLY": "Month",
            "TWO_MONTH": "2 Months",
            "THREE_MONTH": "3 Months",
            "SIX_MONTH": "6 Months",
            "ANNUAL": "Year",
        }
        let offerings
        try {
            offerings = await Purchases.getOfferings()
        } catch(e) {
            shell.t.writeln(e)
            return
        }
        const offer = offerings.current
        const packages = offer.availablePackages.map(p => {
            const price = p.product.priceString,
                period = TYPES[p.packageType],
                introPrice = p.product.introPrice
            let prompt = `${price} / ${period}`
            if (introPrice) {
                const price = (introPrice.price == 0)?"Free":introPrice.priceString,
                    unit = introPrice.periodUnit.toLowerCase(),
                    period = (introPrice.periodNumberOfUnits == 1)?unit:`${introPrice.periodNumberOfUnits} ${unit}s`
                prompt += `     🎁 ${price} for the first ${period} 🎁`
            }
            return { prompt, p }
        })
        const fields: Fields = packages.map(p => ({ prompt: p.prompt }))
        fields.push({ prompt: "Restore Purchases" })
        fields.push({ prompt: "Cancel" })
        let choice
        try {
            choice = await shell.runForm(fields, "menu")
        } catch(e) {
            return
        }
        if (choice == "Cancel")
            return
        if (choice == "Restore Purchases") {
            shell.t.writeln("Restoring purchases")
            shell.startWatchdog(10000).catch(e => {
                shell.t.writeln("Sorry, restore command timed out")
                shell.t.writeln("Please try again or `support`")
                throw e
            })
            try {
                await Purchases.restorePurchases()
            } catch(e) {
                shell.stopWatchdog()
                shell.t.writeln("Error restoring purchases, please try again or `support`")
                return
            }
            shell.stopWatchdog()
            const { customerInfo } = await Purchases.getCustomerInfo()
            if (!customerInfo.entitlements.active.peerbook) {
                shell.t.writeln("Sorry, no active subscription found")
                return
            } else {
                shell.t.writeln("Subscription restored")
            }
        } else {
            const p = packages.find(p => p.prompt == choice)
            shell.t.writeln("Thank you 🙏 directing you to the store")
            shell.startWatchdog(120000).catch(e => {
                shell.t.writeln("Sorry, subscribe command timed out")
                shell.t.writeln("Please try again or `support`")
                throw e
            })
            terminal7.ignoreAppEvents = true
            try {
                await terminal7.pb.purchase(p.p)
            } catch(e) {
                console.log("purchase error", e)
                shell.stopWatchdog()
                shell.t.writeln("Error purchasing, please try again or `support`")
                return
            } finally {
                terminal7.ignoreAppEvents = false
            }
            shell.stopWatchdog()

        }
    }
    if (!terminal7.pb.isOpen()) {
        if (!Capacitor.isNativePlatform()) {
            // we can't add a new subscriber on the web.
            // the user has to buy a subscription from the app store
            // on the weeb all he can do is login
            shell.t.writeln("Subscribing is still WIP for web client")
            shell.t.writeln("If you subscribed on the app, please login")
            shell.t.writeln("")
            await loginCMD(shell);
            return
        }
        terminal7.pb.startSpinner()
        try {
            await terminal7.pb.connect({token: customerInfo.originalAppUserId})
        } catch(e) {
            if (e == "Unregistered") {
                shell.t.writeln("You are subscribed, please register:")
                try {
                    await terminal7.pb.register()
                } catch (e) {
                    return
                }
            } else if (e == "Unauthorized") {
                shell.t.writeln("Failed to connect to PeerBook, please try again or `support`")
                return
            } else {
                let msg = "PeerBook connection failed"
                if (e)
                    msg += ": " + e
                shell.t.writeln(msg)
                shell.t.writeln("Please try again and if persists, `support`")
                return
            }
        } finally {
            terminal7.pb.stopSpinner()
        }
    }
    const uid = await terminal7.pb.getUID()
    if (uid === "TBD") {
        await terminal7.pb.register()
        return
    }
    shell.t.writeln("You are subscribed and registered" )
    const answer = await shell.askValue(`Copy user id to the clipboard? (y/N)`, "n")
    if (answer.toLowerCase() == "y") {
        Clipboard.write({ string: uid })
        shell.t.writeln("UID copied to clipboard")
    }
}
export async function installCMD(shell: Shell, args: string[]) {
    const native = Capacitor.isNativePlatform()
    if (!native) {
        if (!terminal7.pb?.isOpen()) {
            shell.t.writeln("If you are subscribed to PeerBook please `login` first")
            const res = await shell.runForm([
                { prompt: "Just install" },
                { prompt: "Login" },
                { prompt: "Cancel" },
            ], "menu")
            if (res == "Cancel")
                return
            if (res == "Login")
                await loginCMD(shell)
        }
    } else if (!terminal7.pb?.isOpen()) {
        shell.t.writeln("Please `subscribe` to PeerBook first")
        return
    }

    const uid = terminal7.pb.uid
    let gate: Gate

    if (args[0]) {
        gate = shell.getGate(args[0])
        if (!gate) {
            shell.t.writeln(`Host not found: ${args[0]}`)
            return
        }
    } else {
        gate = terminal7.activeG
        if (!gate && native) {
            if (terminal7.gates.length == 1) {
                gate = terminal7.gates[0]
                shell.t.writeln(`Installing on the only server: ${gate.name}`)
            } else {
                const choices = []
                terminal7.gates.forEach(gate => {
                    choices.push({ prompt: gate.name })
                })
                if (choices.length == 0) {
                    shell.t.writeln("No servers found")
                    shell.t.writeln("Please `add` one and run install again")
                    return
                }
                shell.t.writeln("Please select server to install on:")
                const choice = await shell.runForm(choices, "menu")
                gate = shell.getGate(choice)
            }
        }
    }

    const host = terminal7.conf.net.peerbook
    let cmd = ""
    if (uid) {
        cmd = `PEERBOOK_UID=${uid} PEERBOOK_NAME="${gate.name}"`
        if (host != "api.peerbook.io")
            cmd += ` PEERBOOK_HOST=${host}`
        cmd += " \\\n"
    }
    cmd += "bash <(curl -sL https://get.webexec.sh)"

    // Connect to the gate over SSH and install webexec
    let publicKey, privateKey
    let done = false
    let error = false
    const fields: Fields = [
        { prompt: "Copy command" },
        { prompt: "Cancel" },
    ]
    if (native)
        fields.unshift({ prompt: "Connect & send command" })
    shell.t.writeln("To download and install the WebRTC backend:")
    shell.t.writeln("")
    shell.t.writeln(`\t\x1B[1m${cmd}\x1B[0m`)
    shell.t.writeln("")
    const choice= await shell.runForm(fields, "menu")
    if (choice == "Cancel")
        return
    if (choice == "Copy command") {
        Clipboard.write({ string: cmd })
        shell.t.writeln("Next, open a legacy terminal and paste the command")
        shell.t.writeln("When installation is done, reconect")
        let res: string
        try {
            res = await shell.runForm(shell.reconnectForm, "menu")
        } catch (err) {
            gate.handleFailure(Failure.Aborted)
        }
        if (res == "Reconnect")
            await gate.connect()
        else {
            gate.close()
            shell.map.showLog(false)
        }
        return
    }
    const passConnect = async () => {
        let password: string
        try {
            password = await shell.askPass()
        } catch(e) {
            error = true
            return
        }
        session.passConnect(undefined, password)
    }

    try {
        const ids = await terminal7.readId()
        publicKey = ids.publicKey
        privateKey = ids.privateKey
    } catch(e) {
        terminal7.log("readId error", e)
        terminal7.notify(`Error reading key: ${e}`)
    }

    const session = new SSHSession(gate.addr, gate.username)

    session.onStateChange = async (state, failure?: Failure) => {
        let channel: SSHChannel
        terminal7.log("Install SSH session got state", state, failure)
        switch (state) {
            case "connecting":
                shell.t.writeln("Connecting...")
                break
            case "connected":
                shell.t.writeln("Connected")
                try {
                    console.log("opening channel", shell.t.cols, shell.t.rows)
                    channel = await session.openChannel(
                        ["*"], null,
                        shell.t.cols, shell.t.rows)
                } catch (e) {
                    shell.t.writeln("Error opening channel")
                    session.close()
                    error = true
                    return
                }
                shell.t.clear()
                shell.t.writeln(`Connecting to ${gate.addr}`)
                shell.masterChannel = channel
                // set #log border color to yellow
                document.getElementById("log").style.borderColor = "var(--remote-border)"
                channel.onClose = () => {
                    shell.t.writeln("~~~ Disconnected without install")
                    document.getElementById("log").style.borderColor = "var(--local-border)"
                    channel.onClose = undefined
                    shell.masterChannel = null
                    error = true
                }

                channel.send(cmd)

                channel.onMessage = async (msg: string) => {
                    shell.t.write(msg)
                    // use regex to extract the fingerprint from the message.
                    // fingerprint is on a line "Fingerprint: <fingerprint>"
                    const match = msg.match(/Fingerprint:\s*([A-F0-9]+)/)
                    if (match) {
                        const fp = match[1]
                        // install is done, now we need to verify the fingerprint
                        setTimeout(async () => {
                            document.getElementById("log").style.borderColor = "var(--local-border)"
                            shell.masterChannel = null
                            channel.onClose = undefined
                            channel.close()
                            shell.t.writeln("~~~ Orderly Disconnect")
                            // will throw exception if not verified
                            try {
                                await terminal7.pb.verifyFP(fp, "Finished install, enter OTP to verify")
                            } catch(e) {
                                shell.t.writeln("Verification failed")
                                error = true
                                return
                            }
                            done = true
                            // TODO: resolve the command that started it all
                        }, 1000)
                    }
                }   
                break
            case "failed":
                if (failure == Failure.KeyRejected) {
                    shell.t.write("🔑 Rejected")
                    await passConnect()
                    return
                } else if (failure == Failure.WrongPassword) {
                    shell.t.writeln("Wrong password")
                    await passConnect()
                    return
                } else {
                    shell.t.writeln("Connection failed")
                    error = true
                    return
                }
                break
        }
    }
    if (publicKey) {
        session.connect(0, publicKey, privateKey)
    } else {
        await passConnect()
    }
    while (!done && !error) 
        await (new Promise(r => setTimeout(r, 100)))
    if (done) {
        // wait for the gate to get an fp
        let timedOut = false
        shell.startWatchdog(terminal7.conf.net.timeout)
            .catch(() => timedOut = true)
        while (!gate.fp && ! timedOut)
            await (new Promise(r => setTimeout(r, 100)))
        if (gate.fp)
            shell.t.writeln(`Gate is installed & verified, use \`connect ${gate.name}\``)
        else
            shell.t.writeln("Install failed, please try again or `support`")
        shell.stopWatchdog()
    } else {
        shell.t.writeln("Install failed")
        shell.t.writeln("Please try again or type `support`")
    }
}
async function configCMD(shell: Shell) {
    shell.t.writeln("Opening vi-style editor.")
    shell.t.writeln("Use \x1B[1;37m:w\x1B[0m to save & exit or \x1B[1;37m:q\x1B[0m to exit without saving.")
    shell.t.writeln("An example config is available at")
    shell.t.writeln("https://github.com/tuzig/terminal7/wiki/Setting-file-format")
    await shell.waitForKey()
    await shell.openConfig()
}
async function supportCMD(shell: Shell) {
    shell.t.write("Apologies. Have you tried resetting the App?\n")
    shell.t.writeln("If that doesn't work, please send us a log of the error.")
    const insecure = terminal7.conf.peerbook.insecure,
          schema = insecure?"http":"https"
    // ask for email address + check validity
    // Menu to ask user if they want to send the log or Post it to mail
    const fieldsNative = [
        {prompt: "Send log to support"},
        {prompt: "Copy log to clipboard"},
        {prompt: "Save log to file"},
        {prompt: "Cancel"}
    ]

    // Ask user for choice
    !Capacitor.isNativePlatform() ? fieldsNative.splice(2,1) : fieldsNative
    const choice = await shell.runForm(fieldsNative,"menu" , "Choose an option")
   // Switch case to handle user choice
    switch (choice) {
        case "Copy log to clipboard":
            // Saving the log to the clipboard
            const log = terminal7.dumpLog()
            await Clipboard.write({string: (await log).toString()})
            terminal7.notify("Log copied to clipboard.")
            shell.t.writeln("Please paste into discord support channel.")
            break
        case "Send log to support":
            const sendFailed = () => {
                shell.t.writeln("Failed to send log to support.")
                shell.t.writeln("Please send us a message our discord server")
                shell.t.writeln("https://discord.com/invite/rDBj8k4tUE")
            }

            let email = terminal7.conf.peerbook.email || (await shell.askValue("Enter your email address"))
            while (!email.match(/^\w+([-+.']\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*$/)) {
                shell.t.writeln("Invalid email address")
                email = await shell.askValue("Enter your email address")
            }
            let description = await shell.askValue("Please explain how to recreate the issue: \n")
            description += `\n\nOn: ${navigator.userAgent}\n`
            shell.t.writeln("Sending...")
            shell.startWatchdog(5000).catch(() => sendFailed())
            const res = await fetch(`${schema}://${terminal7.conf.net.peerbook}/support`, {
                method: "POST",
                body: JSON.stringify({
                    email,
                    log: await terminal7.dumpLog(),
                    description
                }),
            })
            shell.stopWatchdog()
            if (res.ok) {
                shell.t.writeln("Report sent 🙏")
            } else
                sendFailed()
            break
        case "Save log to file":
            shell.t.writeln("Saving log to file")
            const log2 = terminal7.dumpLog()
            // Works only on ios and android
            if(Capacitor.isNativePlatform()) {
                try{
                    await Filesystem.requestPermissions()
                    await Filesystem.checkPermissions()
                    await Filesystem.writeFile({
                        path: "log-" + Date.now().toString() +".txt",
                        data: (await log2).toString(),
                        directory: Directory.Documents,
                        encoding: Encoding.UTF8
                })
                } catch(e) {
                    terminal7.log(e)
                }
            }
            break
        case "Cancel":
            break
    }
 }
async function loginCMD(shell: Shell) {
    if (terminal7.pb.isOpen()) {
        shell.t.writeln("You are already logged in")
        return
    }
    const { customerInfo } = await Purchases.getCustomerInfo()
    if (customerInfo.entitlements.active.peerbook) {
        shell.t.writeln("You are already subscribed, please `subscribe` to login")
        return
    }
    const user = await shell.askValue("Please enter your email or UID")
    const otp = await shell.askValue("OTP")
    const name = await shell.askValue("Client name")
    const fp = await terminal7.getFingerprint()
    console.log("login with", user, otp, fp)
    let res: Response
    try {
        const schema = terminal7.conf.peerbook.insecure ? "http" : "https"
        res = await fetch(`${schema}://${terminal7.conf.net.peerbook}/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ user, otp, fp, name }),
        })
    } catch(e) {
        console.log("Failed to fetch", e)
        shell.t.writeln("Failed to login, please try again or `support`")
        return
    }
    if (res.status == 401) {
        shell.t.writeln("Invalid credentials, please try again or `support`")
        return
    }
    if (res.status != 201) {
        console.log("Login failed", res.status, await res.text())
        shell.t.writeln("Failed to login, please try again or `support`")
        return
    }
    shell.t.writeln(`PeerBook response: ${await res.text()}`)
    let timedOut = false
    shell.startWatchdog(180000).catch(() => timedOut = true)
    while (!terminal7.pb.uid && !timedOut) {
        await new Promise(r => setTimeout(r, 2000))
        try {
            await terminal7.pbConnect()
        } catch(e) {
            terminal7.log("Failed to connect to PeerBook", e)
        }

    }
    if (timedOut) {
        shell.t.writeln("Login timed out, please try again")
        return
    }
    shell.stopWatchdog()
    shell.t.writeln(`Logged in as user ${terminal7.pb.uid}`)
}

