/* Terminal 7 Map
 *  This file contains the code that makes a terminal 7's main screen.
 *  It's a dynamic map in that it can grow based on the number of gates
 *  added.
 *  
 *  Copyright: (c) 2022 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */

import { Gate } from './gate.ts'
import { Terminal } from '@tuzig/xterm'
import { FitAddon } from "xterm-addon-fit"
import XtermWebfont from 'xterm-webfont'

export class T7Map {
    t0: Terminal;
    constructor() {
        const e = document.getElementById("t0")
        this.t0 = new Terminal({
            cursorBlink: true,
            cursorStyle: "block",
            theme: window.terminal7.conf.theme,
            fontFamily: "FiraCode",
            fontSize: 14,
            rendererType: "canvas",
            convertEol: true,
            rows: 20,
            cols: 55,
        })
        const fitAddon = new FitAddon()
        this.t0.loadAddon(fitAddon)
        this.t0.loadAddon(new XtermWebfont())
        const resizeObserver = new window.ResizeObserver(() => {
            console.log("fitting t0")
            fitAddon.fit()
        })
        resizeObserver.observe(document.getElementById("log"));
        this.t0.loadWebfontAndOpen(e).then(() => {
            fitAddon.fit()
        })
        this.t0.onKey((ev) => {
            const key = ev.domEvent.key
            if (key == 'Escape')
                this.showLog(false)
        })
        document.getElementById("log").addEventListener("transitionend", () => {
            const e = document.getElementById("log")
            fitAddon.fit()
            if (e.classList.contains("show"))
                this.t0.focus()
            else {
                this.t0.blur()
                // if we're not on the map, we're at the gate, hide the minimized version
                if (window.location.hash != "#map") {
                    e.classList.add("hidden")
                    window.terminal7.focus()
                }
            }
        })
        document.getElementById("log").addEventListener("click", (ev) => {
            const e = document.getElementById("log")
            
            if (e.classList.contains("show"))
                this.t0.focus()
            else
                this.showLog(true)
        
            ev.stopPropagation()
            ev.preventDefault()

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

    update({ e, name, boarding, offline, unverified }): void {

        const b = e.children[0]
        b.innerHTML = name
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
        const gates = document.getElementById("gates")
        const pads = document.querySelectorAll(".gate-pad")
        const add = document.getElementById("add-gate")
        
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
     * logDisplay display or hides the notifications.
     * if the parameters in udefined the function toggles the displays
     */
    showLog(show) {
        const e = document.getElementById("log")
        if (show === undefined)
            // if show is undefined toggle current state
            show = !e.classList.contains("show")
        
        if (show) {
            e.classList.remove("hidden")
            e.classList.add("show")
            document.getElementById("log-button").classList.add("on")

        } else {
            e.classList.remove("show")
            document.getElementById("log-button").classList.remove("on")
        }
    }
    tty (msg: string) {
        this.t0.write(msg[0])
        if (msg.length > 1)
            setTimeout(() => this.tty(msg.substring(1)), 42)
    }
}
