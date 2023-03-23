/* Terminal 7 Map
 *  This file contains the code that makes a terminal 7's main screen.
 *  It's a dynamic map in that it can grow based on the number of gates
 *  added.
 *  
 *  Copyright: (c) 2022 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */

import { Terminal } from 'xterm'
import { Gate } from './gate'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { FitAddon } from "xterm-addon-fit"
import { WebglAddon } from 'xterm-addon-webgl'
import { ImageAddon } from 'xterm-addon-image';
import XtermWebfont from '@liveconfig/xterm-webfont'

import { Shell } from './shell'

export class T7Map {
    t0: Terminal
    ttyWait: number
    shell: Shell
    fitAddon: FitAddon
    open() {
        return new Promise(resolve => {
            this.t0 = new Terminal({
                cursorBlink: true,
                cursorStyle: "block",
                theme: window.terminal7?.conf.theme,
                fontFamily: "FiraCode",
                fontSize: 14,
                rendererType: "canvas",
                convertEol: true,
                rows: 20,
                cols: 55,
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
            this.t0.loadAddon(new XtermWebfont())
            // this.t0.attachCustomKeyEventHandler(ev => {
            this.t0.onKey(iev => {
                this.interruptTTY()
                const ev = iev.domEvent
                this.shell.keyHandler(ev)
            })
            this.t0.onData(d =>  this.shell.onTWRData(d))
            this.t0.loadWebfontAndOpen(e).then(() => {
                const webGLAddon = new WebglAddon()
                webGLAddon.onContextLoss(() => {
                    console.log("lost context")
                      webGLAddon.dispose()
                })
                try {
                    this.t0.loadAddon(webGLAddon)
                } catch (e) { console.log("no webgl: " +e.toString()) }
                this.shell.start()
                resolve()
            })
            this.refresh()
            // handle the tower
            const log = document.getElementById("log")
            if (!log)
                return
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
        })
    }
    add(g: Gate): Element {
        const d = document.createElement('div')
        const b = document.createElement('button')
        d.className = "gate-pad"
        b.className = "text-button"
        d.gate = g
        d.appendChild(b)
        const gates = document.getElementById("gates")
        gates.prepend(d)
        this.refresh()
        d.addEventListener("click", (ev) => {
            ev.stopPropagation()
            ev.preventDefault()
        })
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

    update({ e, name, boarding, offline, unverified, peerbook }): void {

        const b = e.children[0]
        if (peerbook)
            b.innerHTML = `<i class="f7-icons expand-gate">book</i>${name}`
        else
            b.innerHTML = `<i class="f7-icons expand-gate">expand</i>${name}`
        // there's nothing more to update for static hosts
        if (boarding)
            b.classList.add("boarding")
        else
            b.classList.remove("boarding")

        if (unverified)
            b.classList.add("unverified")
        else
            b.classList.remove("unverified")

        if (offline)
            b.classList.add("offline")
        else
            b.classList.remove("offline")
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
    /* 
     * showLog display or hides the notifications.
     * if the parameters in udefined the function toggles the displays
     */
    showLog(show) {
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
        this.ttyWait = 42
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
}
