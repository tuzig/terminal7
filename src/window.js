/*! Terminal 7 window
 *  This file contains the code that makes a terminal 7 window 
 *  (also know as tab).
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { Layout } from './layout.js'
import { Pane } from './pane.js'
import * as Hammer from 'hammerjs'

const ABIT = 10

export class Window {
    constructor(props) {
        this.gate = props.gate
        this.id = props.id
        this.name = props.name || `Tab ${this.id+1}`
        this.rootLayout = null
        this.e = null
        this.activeP = null
        this.t7 = window.terminal7
    }
    /*
     * Window.open opens creates the window's element and the first layout and
     * pane
     */
    open(e) {
        this.e = document.createElement('div')
        this.e.className = "window"
        this.e.id = `tab-${this.gate.id}.${this.id}`
        e.appendChild(this.e)

        // Add the name with link to tab bar
        let a = document.createElement('a')
        a.id = this.e.id+'-name'
        a.w = this
        a.innerHTML = this.name
        // Add gestures on the window name for rename and drag to trash
        let h = new Hammer.Manager(a, {})
        h.options.domEvents=true; // enable dom events
        h.add(new Hammer.Press({event: "rename", pointers: 1}))
        h.add(new Hammer.Tap({event: "switch", pointers: 1}))
        h.on("rename", () => this.rename())
        h.on("switch", () => this.focus())
        this.nameE = a
        this.gate.e.querySelector(".tabbar-names").appendChild(a)
    }
    /*
     * Change the active window, all other windows and
     * mark its name in the tabbar as the chosen one
     */
    focus() {
        // turn off the current active
        let a = this.gate.activeW
        if (a) {
            a.nameE.classList.remove("on")
            a.e.classList.add("hidden")
        }
        if (this.activeP && this.activeP.zoomed) {
            this.e.classList.add("hidden")
            this.t7.zoomedE.classList.remove("hidden")
        }
        else
            this.e.classList.remove("hidden")
        this.nameE.classList.add("on")
        this.gate.activeW = this
        if (this.activeP)
            this.activeP.focus()
    }
    addLayout(dir, basedOn) {
        let l = new Layout(dir, basedOn)
        l.id = this.t7.cells.length
        this.t7.cells.push(l)
        if (this.rootLayout == null)
            this.rootLayout = l
        return l
    }
    /*
     * restoreLayout restores a layout, creating the panes and layouts as needed
     */
    restoreLayout(layout, activeWindow) {
        var l = this.addLayout(layout.dir, {
            w: this,
            gate: this.gate,
            sx: layout.sx || null,
            sy: layout.sy || null,
            xoff: layout.xoff || null,
            yoff: layout.yoff || null
        })
        layout.cells.forEach(cell => {
            if ("dir" in cell) {
                // recurselvly add a new layout
                const newL = this.restoreLayout(cell, activeWindow)
                newL.layout = l
                l.cells.push(newL)
            }
            else {
                const p = l.addPane(cell)
                if (cell.active)
                    this.activeP = p
                if (cell.zoomed && activeWindow)
                    p.zoom()
            }
        })
        return l
    }
    dump() {
        let r = this.rootLayout.dump()
        if (this.active)
            r.active = true
        return r
    }
    /*
     * Replace the window name with an input field and updates the window
     * name when the field is changed. 
     */
    rename() {
        const e = this.nameE,
              se = this.gate.e.querySelector(".rename-box"),
              textbox = this.gate.e.querySelector("#name-input")

        se.classList.remove("hidden")
        textbox.value = e.innerHTML
        textbox.focus()

        const handler = (event) => {
            if (event.keyCode == 13 || event.type != "keyup") {
                console.log(event)
                textbox.removeEventListener('keyup', handler)
                textbox.removeEventListener('change', handler)
                textbox.removeEventListener('blur', handler)
                se.classList.add("hidden")
                this.t7.run(() => {
                    this.name = event.target.value
                    this.nameE.innerHTML = event.target.value
                    this.activeP.focus()
                }, ABIT)
                this.gate.sendState()
                event.preventDefault()
                event.stopPropagation()
            }
        }

        textbox.addEventListener('keyup', handler)
        textbox.addEventListener('change', handler)
        textbox.addEventListener('blur', handler)
    }
    close() {
        // remove the window name
        this.nameE.remove()
        // remove the element, panes and tabbar gone as they are childs
        this.e.remove()
        // if we're zoomed in, the pane is a child of body
        if (this.activeP && this.activeP.zoomed)
            this.activeP.unzoom()
        this.gate.windows.splice(this.gate.windows.indexOf(this), 1)
        this.gate.goBack()
    }
    fit() {
        if (this.rootLayout)
            this.rootLayout.fit()
    }
    moveFocus(where) {
        var a = this.activeP,
            b = a.t.buffer.active,
            x = a.xoff + b.cursorX * a.sx / a.t.cols,
            y = a.yoff + b.cursorY * a.sy / a.t.rows,
            match = null,
            nextPane = null
        switch(where) {
            case "left":
                match = p => ((Math.abs(p.xoff + p.sx - a.xoff) < 0.00001)
                    && (p.yoff <= y) && (p.yoff+p.sy >= y))
                break
            case "right":
                match = p => ((Math.abs(a.xoff + a.sx - p.xoff) < 0.00001)
                    && (p.yoff <= y) && (p.yoff+p.sy >= y))
                break
            case "up":
                match = p => ((Math.abs(p.yoff + p.sy - a.yoff) < 0.00001)
                    && (p.xoff <= x) && (p.xoff+p.sx >= x))
                break
            case "down":
                match = p => ((Math.abs(a.yoff + a.sy - p.yoff) < 0.00001)
                    && (p.xoff <= x) && (p.xoff+p.sx >= x))
                break
        }
        this.t7.cells.forEach(c => {
            if ((nextPane == null) && (c instanceof Pane)
                && c.w && (c.w == this))
                if (match(c))
                    nextPane = c
        })
        if (nextPane) {
            nextPane.focus()
            this.gate.sendState()
        }
    }
    updateDivideButtons() {
        let bV = document.getElementById("divide-v")
        let bH = document.getElementById("divide-h")
        if (this.activeP.isSplittable("topbottom"))
            bV.classList.remove("off")
        else
            bV.classList.add("off")
        if (this.activeP.isSplittable("rightleft"))
            bH.classList.remove("off")
        else
            bH.classList.add("off")
    }
}
