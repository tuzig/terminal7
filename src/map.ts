/* Terminal 7 Map
 *  This file contains the code that makes a terminal 7's main screen.
 *  It's a dynamic map in that it can grow based on the number of gates
 *  added.
 *  
 *  Copyright: (c) 2022 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */

import { Gate } from './gate.ts'

export class T7Map {
    add(g: Gate): Element {
        const d = document.createElement('div')
        const b = document.createElement('button')
        d.className = "gate-pad"
        b.className = "text-button"
        d.gate = g
        d.appendChild(b)
        this.update(g, d)
        document.getElementById("gates").prepend(d)
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
        const pads = document.querySelectorAll(".gate-pad")
        let col = 0
        // set the background
        pads.forEach((e, i) => {
            col = i % 4
            if (col % 2 == 0)
                e.style.background = 'top / contain no-repeat url("/map/left_half.svg")'
            else
                e.style.background = 'top / contain no-repeat url("/map/right_half.svg")'
        })
        document.querySelectorAll(".empty-pad").forEach(e => e.remove())
        const gates = document.getElementById("gates")
        for (let i = col + 1; i < 4; i++) {
            const e = document.createElement("div")
            e.appendChild(document.createElement("div"))

            e.className = "empty-pad"
            if (i % 2 == 0)
                e.style.background = 'top / contain no-repeat url("/map/left_half.svg")'
            else
                e.style.background = 'top / contain no-repeat url("/map/right_half.svg")'
            gates.appendChild(e)
        }
        // add the footer line
        for (let i = 0; i < 4; i++) {
            const e = document.createElement("div")
            e.appendChild(document.createElement("div"))
            e.className = "empty-pad"
            if (i % 2 == 0)
                e.style.background = 'top / contain no-repeat url("/map/footer_left_half.svg")'
            else
                e.style.background = 'top / contain no-repeat url("/map/footer_right_half.svg")'
            gates.appendChild(e)
        }
        document.querySelectorAll(".map-TBD").forEach(e => e.remove())
        const clear = document.createElement("div")
        clear.style.clear = 'both'
        clear.className = 'map-TBD'
        gates.appendChild(clear)
    }
}
