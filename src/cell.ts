/*! Terminal 7 Cell - a class used as super for both Pane & Layout
 *
 *  Copyright: (c) 2021 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { Gate } from "./gate"
import { Window } from "./window"
import { Layout } from "./layout"
import { Terminal7 } from "./terminal7"
import { Pane } from "./pane"

const FOCUSED_BORDER_COLOR = "#F4DB53",
      UNFOCUSED_BORDER_COLOR = "#373702"

export interface SerializedCell {
  sx: number,
  sy: number,
  xoff: number,
  yoff: number,
  zoomed: boolean,
}

export abstract class Cell {
    gate?: Gate
    w: Window
    id?: number
    layout?: Layout
    t7: Terminal7
    e: HTMLDivElement & {cell?: Cell}
    lastEventT: number
    protected constructor(props) {
        this.gate = props.gate || null
        this.w = props.w
        this.id = props.id || undefined
        this.layout = props.layout || null
        this.createElement(props.className)
        this.sx = props.sx || 0.8
        this.sy = props.sy || 0.8
        this.xoff = props.xoff || 0
        this.yoff = props.yoff || 0
        this.t7 = terminal7
    }
    /*
     * Creates the HTML elment that will store our dimensions and content
     * get an optional className to be added to the element
     */
    createElement(className) {
        // creates the div element that will hold the term
        this.e = document.createElement("div") as HTMLDivElement & {cell?: Cell}
        this.e.cell = this
        this.e.className = "cell"
        if (typeof className == "string")
            this.e.classList.add(className)
        this.w.e.appendChild(this.e)
        return this.e
    }

    /*
     * Set the focus on the cell
     */
    focus() {
        if (this.w.activeP !== null) {
            this.w.activeP.e.style.borderColor = UNFOCUSED_BORDER_COLOR
        }
        this.w.activeP = this as unknown as Pane
        this.e.style.borderColor = FOCUSED_BORDER_COLOR
        this.w.updateDivideButtons()
        setTimeout(() => window.location.href = `#pane-${this.id}`)
        this.w.nameE.setAttribute("href", `#pane-${this.id}`)
    }

    abstract dump()

    abstract refreshDividers()

    abstract fit()

    get sx(){
        return parseFloat(this.e.style.width.slice(0,-1)) / 100.0
    }
    set sx(val) {
        if (val > 1.0)
            val = 1.0
        this.e.style.width = String(val*100) + "%"
    }
    get sy() {
        return parseFloat(this.e.style.height.slice(0,-1)) / 100.0
    }
    set sy(val) {
        this.e.style.height = String(val*100) + "%"
    }
    get xoff() {
        return parseFloat(this.e.style.left.slice(0,-1)) / 100.0
    }
    set xoff(val) {
        this.e.style.left = String(val*100) + "%"
    }
    get yoff() {
        return parseFloat(this.e.style.top.slice(0,-1)) / 100.0
    }
    set yoff(val) {
        this.e.style.top = String(val*100) + "%"
    }
    /*
     * Cell.close removes a cell's elment and removes itself from the window
     */
    close() {
        // zero canvas dimension to free it
        this.e.querySelectorAll("canvas").forEach(canvas => {
            canvas.height = 0
            canvas.width = 0
        })
        this.e.remove()
        if (this.layout)
            this.layout.onClose(this)
        this.gate.sendState()
    }
    adjustDimensions(target: SerializedCell) {
        this.sx = target.sx
        this.sy = target.sy
        this.xoff = target.xoff
        this.yoff = target.yoff
  }
}
