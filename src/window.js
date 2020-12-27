/*! Terminal 7 window
 *  This file contains the code that makes a terminal 7 window 
 *  (also know as tab).
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { Layout, Pane } from './cells.js'
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
        let div = document.createElement('div'),
            a = document.createElement('a')
        a.id = this.e.id+'-name'
        a.w = this
        a.setAttribute('href', `#${this.e.id}`)
        a.innerHTML = this.name
        // Add gestures on the window name for rename and drag to trash
        /*
        let h = new Hammer.Manager(a, {})
        h.options.domEvents=true; // enable dom events
        h.add(new Hammer.Press({event: "rename", pointers: 1}))
        h.add(new Hammer.Tap({event: "switch", pointers: 1}))
        h.on("rename", ev => this.rename())
        h.on("switch", (ev) => this.focus())
        */
        div.appendChild(a)
        this.nameE = a
        this.gate.e.querySelector(".tabbar-names").appendChild(div)
    }
    /*
     * Change the active window, all other windows and
     * mark its name in the tabbar as the chosen one
     */
    focus() {
        this.gate.breadcrumbs.push(this)
        // turn off the current active
        let a = this.gate.activeW
        if (a) {
            a.nameE.classList.remove("on")
            a.e.classList.add("hidden")
        }
        this.e.classList.remove("hidden")
        this.nameE.classList.add("on")
        this.gate.activeW = this
        window.location.href=`#tab-${this.gate.id}.${this.id+1}`
        this.gate.sendState()
        terminal7.run(_ => this.activeP.focus(), ABIT)
    }
    addLayout(dir, basedOn) {
        let l = new Layout(dir, basedOn)
        l.id = terminal7.cells.length
        terminal7.cells.push(l)
        if (this.rootLayout == null)
            this.rootLayout = l
        return l
    }
    /*
     * restoreLayout restores a layout, creating the panes and layouts as needed
     */
    restoreLayout(layout) {
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
                const newL = this.restoreLayout(cell)
                newL.layout = l
                l.cells.push(newL)
            }
            else {
                let p = l.addPane(cell)
                if (cell.active)
                    p.focus()
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
     * name when the field is changed. If we lose focus, we drop the changes.
     * In any case we remove the input field.
     */
    rename() {
        let e = this.nameE
        e.innerHTML= `<input size='10' name='window-name'>`
        let i = e.children[0]
        i.focus()
        // On losing focus, replace the input element with the name
        // TODO: chrome fires too many blur events and wher remove
        // the input element too soon
        i.addEventListener('blur', (e) => {
            let p = e.target.parentNode
            this.gate.sendState()
            terminal7.run(() => {
                p.innerHTML = p.w.name
                this.activeP.focus()
            }, 0)
        }, { once: true })
        i.addEventListener('change', (e) => {
            console.log("change", e)
            let p = e.target.parentNode
            p.w.name = e.target.value
            this.gate.sendState()
            terminal7.run(() => {
                p.innerHTML = p.w.name
                this.activeP.focus()
            }, 0)
        })
    }
    close() {
        // remove the window name
        this.nameE.parentNode.remove()
        // remove the element, panes and tabbar gone as they are childs
        this.e.remove()
        // if we're zoomed in, the pane is a chuld of body
        if (this.activeP.zoomed)
            document.body.removeChild(this.activeP.zoomedE)
        this.gate.windows.splice(this.gate.windows.indexOf(this), 1)
        // this.gate.activeW = null
        // if we removed a window it means the user can add a window
        this.gate.e.querySelector(".add-tab").classList.remove("off")
        // remove myself from the breadcrumbs
        this.gate.goBack()
    }
    fit() {
        if (this.rootLayout)
            this.rootLayout.fit()
    }
    moveFocus(where) {
        var s, off, b,
            un = { top: "bottom", bottom: "top",
                   right: "left", left: "right"
            },
            a = this.activeP,
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
        terminal7.cells.forEach(c => {
            if ((nextPane == null) && (c instanceof Pane)
                && c.w && (c.w == this))
                if (match(c))
                    nextPane = c
        })
        if (nextPane)
            nextPane.focus()
            
    }
}
