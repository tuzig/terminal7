/* Terminal 7 Map
 *  This file contains the code that makes a terminal 7's main screen.
 *  It's a dynamic map in that it can grow based on the number of gates
 *  added.
 *  
 *  Copyright: (c) 2022 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */

import { Terminal } from "@xterm/xterm"
import { Gate } from './gate'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { FitAddon } from "@xterm/addon-fit"
import { WebglAddon } from '@xterm/addon-webgl'
import { ImageAddon } from '@xterm/addon-image'

import { Shell } from './shell'
import { Capacitor } from '@capacitor/core'
import { WebRTCSession } from "./webrtc_session"

import interact from 'interactjs'
import FontFaceObserver from "fontfaceobserver"

// openEmulator loads the font and opens the given terminal
export async function openEmulator(e: HTMLElement, t: Terminal) {
    let fontFamily: string
    try {
        fontFamily = window.terminal7.conf.theme.fontFamily
    } catch (e) { 
        fontFamily = "FiraCode"
    }
    t.options.fontFamily = fontFamily
    // @ts-ignore
    if (!import.meta.env.TEST) {
        try {
            await new FontFaceObserver(fontFamily).load(null, 200)
            await new FontFaceObserver(fontFamily, { weight: "bold" }).load(null, 200)
        } catch (e) {
            this.notify(`Font ${fontFamily} not found, using FiraCode`)
            t.options.fontFamily = "FiraCode"
        }   
    }
    t.open(e)
}

type GatePadHTMLElement = HTMLDivElement & {gate: Gate}
export class T7Map {
    t0: Terminal
    ttyWait: number
    shell: Shell
    fitAddon: FitAddon
    webGLAddon: WebglAddon
    updateTask = 0

    open(): Promise<void> {
        return new Promise(resolve => {
            this.t0 = new Terminal({
                cursorBlink: true,
                cursorStyle: "block",
                theme: window.terminal7?.conf.theme,
                fontSize: 14,
                convertEol: true,
                rows: 20,
                cols: 55,
                linkHandler: {
                    activate: (_, url) => {
                        window.open(url, "_blank", "noopener")
                    }
                }
            })
            this.shell = new Shell(this)
            const e = document.getElementById("t0")
            this.fitAddon = new FitAddon()
            const webLinksAddon = new WebLinksAddon((MouseEvent, url) => {
                window.open(url, "_blank", "noopener")
            })
            const imageAddon = new ImageAddon()
            this.t0.loadAddon(imageAddon)
            this.t0.loadAddon(webLinksAddon)
            this.t0.loadAddon(this.fitAddon)
            setTimeout(() => {
                this.fitAddon.fit()
                console.log("TWR size", this.t0.cols, this.t0.rows)
            }, 100)
            this.t0.attachCustomKeyEventHandler(ev => {
                if (ev.ctrlKey && ev.key === "c") {
                    if (this.shell.masterChannel)
                        this.shell.masterChannel.send(String.fromCharCode(3))
                    else
                        this.shell.escape()
                    return false
                }
                if ((ev.ctrlKey || ev.metaKey) && ev.key === "v") {
                    this.shell.paste()
                    return false
                }
                return true
            })
            this.t0.onKey(iev => {
                this.interruptTTY()
                const ev = iev.domEvent
                // TWR is connected to a remote shell (for install)
                if (this.shell.masterChannel) {
                    return
                }
                this.shell.updateCapsLock(ev)
                this.shell.keyHandler(ev.key)
                ev.preventDefault()
            })
            this.t0.onData(d =>  this.shell.onTWRData(d))
            this.webGLAddon = new WebglAddon()
            this.webGLAddon.onContextLoss(() => this.outOfMemory())
            try {
                this.t0.loadAddon(this.webGLAddon)
            } catch (e) { 
                terminal7.notify("WebGL not supported, using fallback")
            }
            openEmulator(e, this.t0).finally(() => {
                // set line wrap
                this.t0.write("\x1b[?7h")
                if (Capacitor.getPlatform() === "android") {
                    // hack for android spacebar & virtual keyboard
                    this.t0.element.addEventListener("input", (ev: Event & {data?}) => {
                        if (ev.data)
                            this.shell.keyHandler(ev.data)
                    })
                }
                this.shell.start()
                resolve()
            })
            this.refresh()
            // handle the tower
            const log = document.getElementById("log")
            if (log) {
                const resizeObserver = new window.ResizeObserver(() =>
                    setTimeout(() => this.fitAddon.fit(), 100)
                )
                resizeObserver.observe(terminal7.e)
                log.addEventListener("click", (ev) => {
                    ev.stopPropagation()
                    ev.preventDefault()
                })
                document.getElementById("log-minimized").addEventListener("click", (ev) => {
                    this.showLog(true)
                    ev.stopPropagation()
                    ev.preventDefault()
                })
                interact(document.getElementById("map"))
                .on("tap", ev => {
                    this.showLog(false)
                    terminal7.showChangelog(false)
                    ev.stopPropagation()
                    ev.preventDefault()
                })
            }
            this.updateTask = window.setInterval(() => this.updateStats(), 1000)
        })
    }
    add(g: Gate): Element {
        const d = (document.createElement('div') as GatePadHTMLElement)
        const container = document.createElement('div')
        d.className = "gate-pad"
        d.gate = g
        if (g.fp)
            d.classList.add("from-peerbook")
        container.className = "text-button"
        container.setAttribute("data-test", "gateButton")
        container.innerHTML = `
            <div class="gate-status">
            <div class="gate-name" data-test="gate-name">${g.name}</div>
            <div class="gate-stats"></div>
            </div>
            <div class="gate-edit"></div>
        `
        d.appendChild(container)
        const gates = document.getElementById("gates")
        gates.prepend(d)
        const pad = d.querySelector(".text-button") as HTMLElement
        interact(pad)
        .on("pointerdown", () => {
            pad.style.borderStyle = "inset"
            pad.style.width = "98%"
        })
        .on("pointerup", () => {
            // remove the inset border
            pad.style.borderStyle = null
            pad.style.width = null
        })
        .on("tap", (ev) => {
                const g = ev.target.closest(".gate-pad").gate
                if (ev.dt < 500) {
                    ev.stopPropagation()
                    const command = (ev.target.closest(".gate-edit"))? "edit" : "connect"
                    console.log("tap", command)
                    this.shell.runCommand(command, [g.name])
                    .then(() => this.showLog(false))
                    .catch(e => terminal7.notify(e))
                }
        })
        .on("hold", ev => {
            const g = ev.target.closest(".gate-pad").gate
            ev.preventDefault()
            ev.stopPropagation()
            this.shell.runCommand("edit", [g.name])
        })
        this.refresh()
        return d
    }
    remove(g: Gate) {
        const e = g.nameE
        // some gates are not on the map
        if (!e)
            return
        e.remove()
        this.refresh()
    }

    update({ e, name, online, offline, unverified, peerbook }): void {

        const b = e.children[0]
        const status = b.children[0]
        const nameE = status.children[0]
        nameE.innerHTML = name
        const edit = b.children[1]
        edit.innerHTML = `<i class="f7-icons expand-gate">pencil</i>`
        if (peerbook) {
            const extraClass = offline? "offline" : ""
            if (unverified)
                nameE.innerHTML += `<i class="f7-icons peerbook-icon warning ${extraClass}">lock_shield</i>`
            else
                nameE.innerHTML += `<i class="f7-icons peerbook-icon ${extraClass}">peerbook</i>`
        }
        // there's nothing more to update for static hosts
        if (online)
            b.classList.add("online")
        else
            b.classList.remove("online")
    }

    refresh() {
        const pads = document.querySelectorAll(".gate-pad")
        const add = document.getElementById("add-gate")
        
        if (!add)
            return
        // fill the last line with empty pads as needed
        // start with cleaning old fillers
        document.querySelectorAll("#gates .empty-pad").forEach(e => e.remove())
        for (let i = pads.length % 4; i < 4; i++) {
            const e = document.createElement("div")
            e.appendChild(document.createElement("div"))

            e.className = "empty-pad"
            add.after(e)
        }
    }
    async updateStats() {
        terminal7.gates.forEach(async (g: Gate) => {
            let onGate = ""
            let onMap = ""
            if (g && g.session && (g.session as WebRTCSession).getStats) {
                const stats = await (g.session as WebRTCSession).getStats()
                if (!stats)
                    return

                const getBytes = (bytes: number) => {
                    const sizes = ['B', 'KB', 'MB', 'GB']
                    const i = bytes == 0 ? 0 : Math.floor(Math.log(bytes) / Math.log(1024))
                    if (i >= sizes.length)
                        return "1TB+"
                    return (+(bytes / Math.pow(1024, i)).toFixed(2) + sizes[i])
                }
                const pad = (s: string, n = 9) => s.padEnd(n, 'X').replace(/X/g, '&nbsp;')
                const extraClass = stats.roundTripTime > 400 ? "error" : stats.roundTripTime > 100 ? "warning" : ""

                onGate = `<i class="f7-icons ${extraClass}">arrow_up_arrow_down_circle</i><span class=${extraClass}>` + pad(stats.roundTripTime + 'ms', 7) + '</span>'
                onMap = onGate +
                    '<i class="f7-icons">arrow_down_circle</i>' + pad(getBytes(stats.bytesReceived)) +
                    '<i class="f7-icons">arrow_up_circle</i>' + pad(getBytes(stats.bytesSent))
            }

            g.nameE.querySelector(".gate-stats").innerHTML = onMap
            if (terminal7.activeG === g) {
                const e = document.getElementById("active-gate-stats")
                e.innerHTML = onGate
                if (g.activeW && g.activeW.activeP.zoomed)
                    e.classList.add("zoomed")
                else    
                    e.classList.remove("zoomed")
            }
        })
    }
    /* 
     * showLog display or hides the notifications.
     * if the parameters in undefined the function toggles the displays
     */
    showLog(show = undefined) {
        const log = document.getElementById("log")
        const minimized = document.getElementById("log-minimized")
        if (show === undefined)
            // if show is undefined toggle current state
            show = log.classList.contains("hidden")
        /* should we?
        if (!show && Form.activeForm)
            Form.activeForm.escape(this.t0)
        */
        if (show) {
            minimized.classList.add("hidden")
            log.classList.remove("hidden")
            document.getElementById("log-button").classList.add("on")
            this.t0.focus()
        } else {
            minimized.classList.remove("hidden")
            log.classList.add("hidden")
            document.getElementById("log-button").classList.remove("on")
            terminal7.focus()
        }
    }
    tty (msg: string) {
        this.showLog(true)
        const _tty = (m: string) =>  {
            if (this.ttyWait != 0) {
                this.t0.write(m[0])
                if (m.length > 1) 
                    setTimeout(() => _tty(m.substring(1)), this.ttyWait)
                else {
                    this.ttyWait = 0
                    this.shell.printPrompt()
                }
            }
        }
        this.ttyWait = 25
        _tty(msg)
    }
    interruptTTY() {
        if (this.ttyWait) {
            this.ttyWait = 0
            this.t0.scrollToBottom()
            this.t0.write("...INTERRUPTED\n\n")
            this.shell.printPrompt()
        }
    }
    outOfMemory() {
        console.log("lost context")
        this.webGLAddon.dispose()
        terminal7.gates.forEach(g => g.close())
        this.webGLAddon = new WebglAddon()
        this.t0.loadAddon(this.webGLAddon)
        this.webGLAddon.onContextLoss(() => this.outOfMemory())
        terminal7.notify("App out of memory, closed all gates.")
    }
    close() {
        if (this.updateTask != 0)
            clearInterval(this.updateTask)
    }

}
