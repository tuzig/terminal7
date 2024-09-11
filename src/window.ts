/*! Terminal 7 window
 *  This file contains the code that makes a terminal 7 window 
 *  (also know as tab).
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import interact from 'interactjs'
import { Layout, SerializedLayout } from './layout'
import { Pane } from './pane'
import { Gate } from "./gate"
import { Terminal7 } from "./terminal7"

const ABIT = 10

export interface SerializedWindow {
    name: string
    id: number
    layout: SerializedLayout
    active?: boolean
}

export class Window {
    gate: Gate
    id: number
    name: string
    rootLayout: Layout
    e?: HTMLElement
    draggedDivider: HTMLElement
    activeP?: Pane
    t7: Terminal7
    nameE: HTMLAnchorElement
    active: boolean
    constructor(props) {
        this.gate = props.gate
        this.id = props.id
        this.name = props.name || `Tab ${this.id+1}`
        this.rootLayout = null
        this.e = null
        this.activeP = null
        this.t7 = terminal7
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
        const a = document.createElement('a') as HTMLAnchorElement & {w: Window}
        a.id = this.e.id+'-name'
        a.w = this
        a.className = "window-name"
        a.innerHTML = this.name
        this.nameE = a
        this.gate.e.querySelector(".tabbar-names").appendChild(a)
        interact(this.nameE)
            .on("tap", ev => {
                this.focus()
                this.gate.sendState()
                ev.preventDefault()
                ev.stopPropagation()
            })
            .on("hold", ev => {
                // Can rename only th active window
                if (this.gate.activeW != this)
                    return
                this.rename()
                ev.preventDefault()
                ev.stopPropagation()
            })
    }
    /*
     * Change the active window, all other windows and
     * mark its name in the tabbar as the chosen one
     */
    focus() {
        // turn off the current active
        const last = this.gate.activeW
        if (last) {
            last.nameE.classList.remove("on")
            last.e.classList.add("hidden")
        }
        if (this.activeP && this.activeP.zoomed) {
            const c = document.getElementById("zoomed-pane") as HTMLDivElement
            c.classList.remove("hidden")
        }
        this.e.classList.remove("hidden")
        this.nameE.classList.add("on")
        this.gate.activeW = this
        if (this.activeP)
            this.activeP.focus()
    }
    addLayout(dir, basedOn) {
        const l = new Layout(dir, basedOn)
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
        const l = this.addLayout(layout.dir, {
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
                    this.t7.run(() => p.zoom(), ABIT)
            }
        })
        return l
    }
    dump() {
        const r = this.rootLayout.dump()
        if (this.active)
            r.active = true
        return r
    }
    onRenameEvent(event) {
        const se = document.getElementById("rename")
        if (event.keyCode == 13) {
            console.log("renaming", event.keyCode, event.type)
            se.classList.add("hidden")
            this.t7.run(() => {
                this.name = event.target.value
                this.nameE.innerHTML = event.target.value
                this.activeP.focus()
            }, ABIT)
            this.gate.sendState()
        }
        if (event.keyCode == 27) {
            se.classList.add("hidden")
            this.activeP.focus()
        }
    }
    /*
     * Replace the window name with an input field and updates the window
     * name when the field is changed. 
     */
    rename() {
        const se = document.getElementById("rename")
        const textbox = document.getElementById("name-input") as HTMLInputElement

        se.classList.remove("hidden")
        textbox.value = this.nameE.innerHTML
        terminal7.run(() => textbox.focus(), ABIT)
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
        const a = this.activeP,
            b = a.t.buffer.active,
            x = a.xoff + b.cursorX * a.sx / a.t.cols,
            y = a.yoff + b.cursorY * a.sy / a.t.rows
        let match = null,
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
        const bV = document.getElementById("divide-v")
        const bH = document.getElementById("divide-h")
        if (this.activeP.isSplittable("topbottom"))
            bV.classList.remove("off")
        else
            bV.classList.add("off")
        if (this.activeP.isSplittable("rightleft"))
            bH.classList.remove("off")
        else
            bH.classList.add("off")
    }
    syncLayout(thatLayout, theseCells = null) {
        if (!theseCells)
            theseCells = this.rootLayout.allCells()
        thatLayout.w = this
        thatLayout.gate = this.gate
        const newLayout = new Layout(thatLayout.dir, thatLayout)

        thatLayout.cells.forEach(thatCell => {
            let thisCell = null
            if (thatCell.dir) {
                console.log("syncing layout", thatCell)
                thatCell.w = this
                thatCell.gate = this.gate
                thisCell = new Layout(thatCell.dir, thatCell)
                thisCell = this.syncLayout(thatCell, theseCells)
                thisCell.layout = newLayout
                newLayout.cells.push(thisCell)
            } else {
                const thisI = theseCells.findIndex(c => c.channelID == thatCell.channelID)
                if (thisI >= 0) {
                    console.log("found pane in ", thisI)
                    thisCell = theseCells.splice(thisI, 1)[0]
                    thisCell.layout = newLayout
                    newLayout.cells?.push(thisCell)
                } else {
                    console.log("didn't find pane ", thatCell.channelID)
                    thisCell = newLayout.addPane(thatCell)
                }
            }
            thisCell.adjustDimensions(thatCell)
        })

        newLayout.refreshDividers()
        return newLayout
    }
    // used to recieve the touch event from the gate
}
