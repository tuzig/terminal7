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
            this.t0.write("\n")
        })
        this.t0.onKey((ev) => {
            const key = ev.domEvent.key
            if (key == 'Escape')
                this.showLog(false)
        })
        document.getElementById("log").addEventListener("transitionend", () => {
            const e = document.getElementById("log")
            const log = document.getElementById("log")
            fitAddon.fit()
            if (e.classList.contains("show"))
                this.t0.focus()
            else
                this.t0.blur()
        })
    }
    add(g: Gate): Element {
        const d = document.createElement('div')
        const b = document.createElement('button')
        d.className = "gate-pad"
        b.className = "text-button"
        d.gate = g
        d.appendChild(b)
        this.update(g, d)
        const gates = document.getElementById("gates")
        gates.prepend(d)
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

    update(g: Gate, e?: Element) {
        if (!e)
            e = g.nameE
        const b = e.children[0]
        b.innerHTML = g.name || g.addr
        // there's nothing more to update for static hosts
        if (!g.fp)
            return
        if (g.verified)
            b.classList.remove("unverified")
        else
            b.classList.add("unverified")
        if (g.online)
            b.classList.remove("offline")
        else
            b.classList.add("offline")
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
        const log = document.getElementById("log")
        if (show === undefined)
            // if show is undefined toggle current state
            show = !e.classList.contains("show")
        
        if (show) {
            e.classList.add("show")
            document.getElementById("log-button").classList.add("on")
            e.classList.remove("hidden")

        } else {
            e.classList.remove("show")
            document.getElementById("log-button").classList.remove("on")
        }
    }
}
