/*! Terminal 7 Layout - a class that colds a layout container.
 * layout has a direction and an array of cells. layouts can be compund - 
 * a layout can contain layouts.
 *
 *  Copyright: (c) 2021 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { Cell } from './cell.js'
import { Pane } from './pane.js'

const  ABIT                = 10

export class Layout extends Cell {
    /*
     * Layout contructor creates a `Layout` object based on a cell.
     * The new object wraps the `basedOn` cell and makes it his first son
     */
    constructor(dir, basedOn) {
        super({
            sx: basedOn.sx || 1.0, 
            sy: basedOn.sy || 1.0,
            xoff: basedOn.xoff || 0.0,
            yoff: basedOn.yoff || 0.0,
            w: basedOn.w || null,
            className: "layout",
            gate: basedOn.gate ||null})
        this.t7.log("in layout constructore")
        this.dir = dir
        // if we're based on a cell, we make it our first cell
        if (basedOn instanceof Cell) {
            this.layout = basedOn.layout
            basedOn.layout = this
            this.cells = [basedOn]
            // if we're in a layout we need replace basedOn there
            if (this.layout != null)
                this.layout.cells.splice(this.layout.cells.indexOf(basedOn), 1, this)
        }
        else
            this.cells = []
    }
    fit() {
        this.cells.forEach(c => c.fit())
    }
    focus() {
        this.cells[0].focus()
    }
    /*
     * On a cell going away, resize the other elements
     */
    onClose(c) {
        if (c.zoomed) {
            c.toggleZoom()
        }
        this.t7.cells.splice(this.t7.cells.indexOf(c), 1)
        // if this is the only pane in the layout, close the layout
        if (this.cells.length == 1) {
            if (this.layout != null)
                this.layout.onClose(this)
            else {
                // activate the next window
                this.w.close()
            }
            this.e.remove()
        } else {
            let i = this.cells.indexOf(c), 
                p = (i > 0)?this.cells[i-1]:this.cells[1]
            // if no peer it means we're removing the last pane in the window
            if (p === undefined) {
                this.w.close()
                return
            }
            if (this.dir == "rightleft") {
                p.sy += c.sy
                if (c.yoff < p.yoff)
                    p.yoff = c.yoff
            } else {
                p.sx += c.sx
                if (c.xoff < p.xoff)
                    p.xoff = c.xoff
            }
            p.focus()
            // remove this from the layout
            this.cells.splice(i, 1)
        }
    }
    /*
     * Replace an old cell with a new cell, used when a pane
     * is replaced with a layout
     */
    replace(o, n) {
        this.cells.splice(this.cells.indexOf(o), 1, n)
    }
    /*
     * Adds a new pane. If the gate is connected the pane will open a
     * new data channel.
     */
    addPane(props) {
        // CONGRATS! a new pane is born. props must include at keast sx & sy
        let p = props || {}
        p.w = this.w
        p.gate = this.gate
        p.layout = this
        p.channel_id = props.channel_id
        p.id = this.t7.cells.length
        let pane = new Pane(p)
        this.t7.cells.push(pane)

        if (props.parent instanceof Cell) {
            let parent = null
            this.cells.splice(this.cells.indexOf(props.parent)+1, 0, pane)
            if (props.parent && props.parent.d)
                parent = props.parent.d.id
            pane.openTerminal(parent, props.channel_id)
        } else {
            this.cells.push(pane)
            pane.openTerminal(null, props.channel_id)
        }
        
        // opening the terminal and the datachannel are heavy so we wait
        // for 10 msecs to let the new layout refresh
        return pane
    }
    /*
     * waits a bit for the DOM to refresh and moves the dividers
     */
    refreshDividers() {
        this.t7.run(() => this.cells.forEach(c => {
            c.refreshDividers()
        }), ABIT)
    }

    toText() {
        // r is the text the function returns
        let r = (this.dir=="rightleft")?"[":"{"
        // get the dimensions of all the cell, recurse if a layout is found
        this.cells.forEach((c, i) => {
            if (i > 0)
                r += ','
            try {
                r += `${c.sx.toFixed(3)}x${c.sy.toFixed(3)}`
            }
            catch(e) {
                this.t7.log(i, c)
            }
            r += `,${c.xoff.toFixed(3)},${c.yoff.toFixed(3)}`
            if (c == this)
                this.t7.log("ERROR: layout shouldn't have `this` in his cells")
            // TODO: remove this workaround - `c != this`
            if ((c != this) && (typeof c.toText == "function"))
                r += c.toText()
            else
                r += `,${c.id || c.d.id}`
        })
        r += (this.dir=="rightleft")?"]":"}"
        return r
    }

    // Layout.dump dumps the layout to an object
    dump() {
        // r is the text the function returns
        let d = {
            dir: this.dir,
            sx: this.sx,
            sy: this.sy,
            xoff: this.xoff,
            yoff: this.yoff,
            cells: [],
        }
        // get the dimensions of all the cell, recurse if a layout is found
        this.cells.forEach(c => d.cells.push(c.dump()))
        return d
    }

    get sx() {
        return parseFloat(this.e.style.width.slice(0,-1)) / 100.0
    }
    /*
     * update the sx of the layout - resize the cells or spread them based on
     * the layout's direction.
     */
    set sx(val) {
        let oldS = this.sx,
            r = val/oldS
        this.e.style.width = String(val * 100) + "%"
        if (isNaN(r) || this.cells == undefined || this.cells.length == 0)
            return
        let off = this.cells[0].xoff
        this.cells.forEach((c) => {
            if (this.dir == "topbottom") {
                let oldS = c.sx,
                    s = oldS * r
                c.xoff = off
                c.sx = s
                off += s
            } else c.sx *= r
        })
    }
    get sy() {
        return parseFloat(this.e.style.height.slice(0,-1)) / 100.0
    }
    /*
     * update the sy of the layout - resize the cells or spread them based on
     * the layout's direction.
     */
    set sy(val) {
        let oldS = this.sy,
            r = val/oldS
        this.e.style.height = String(val * 100) + "%"
        if (isNaN(r) || this.cells == undefined || this.cells.length == 0)
            return
        let off = this.cells[0].yoff
        this.cells.forEach((c) => {
            if (this.dir == "rightleft") {
                let oldS = c.sy,
                    s = oldS * r
                c.yoff = off
                c.sy = s
                off += s
            } else c.sy *= r
        })
    }
    get xoff() {
        return parseFloat(this.e.style.left.slice(0,-1)) / 100.0
    }
    /*
     * Update the X offset for all cells
     */
    set xoff(val) {
        let x=val
        this.e.style.left = String(val * 100) + "%"
        if (this.cells !== undefined)
            this.cells.forEach((c) => {
                if (this.dir == "rightleft")
                    c.xoff = val
                else {
                    c.xoff = x
                    x += c.sx
                }
            })
    }
    get yoff() {
        return parseFloat(this.e.style.top.slice(0,-1)) / 100.0
    }
    /*
     * Update the Y offset for all cells
     */
    set yoff(val) {
        let y = val
        this.e.style.top = String(val * 100) + "%"
        if (this.cells !== undefined)
            this.cells.forEach((c) => {
                if (this.dir =="topbottom")
                    c.yoff = val
                else {
                    c.yoff = y
                    y += c.sy
                }
            })
    }
    prevCell(c) {
        var i = this.cells.indexOf(c) - 1
        return (i >= 0)?this.cells[i]:null
    }
    nextCell(c) {
        var i = this.cells.indexOf(c) + 1
        return (i < this.cells.length)?this.cells[i]:null
    }
    /*
     * Layout.moveBorder moves a pane's border
     */
    moveBorder(pane, border, dest) {
        var s, off
        let p0 = null,
            p1 = null
        // first, check if it's a horizontal or vertical border we're moving
        if (border == "top" || border == "bottom") {
            s = "sy"
            off = "yoff"
        } else {
            s = "sx"
            off = "xoff"
        }
        if (this.dir.indexOf(border) == -1) {
            if (border == "top" || border == "left") {
                p0 = this.prevCell(pane)
                p1 = pane
                // if it's the first cell in the layout we need to get the layout's
                // layout to move the borderg
            } else {
                p0 = pane
                p1 = this.nextCell(pane)
            }
        }
        if (p0 == null || p1 == null) {
            this.layout && this.layout.moveBorder(this, border, dest)
            return
        }
        let max = this.findNext(p1)
        dest = Math.max(dest, p0[off] + 0.02)
        dest = Math.min(dest, (max?.[off] || 1) - 0.02)
        let by = p1[off] - dest
        p0[s] -= by
        p1[s] += by
        p1[off] = dest
        p0.refreshDividers()
        p1.refreshDividers()
        this.w.toggleDivideButtons()
    }
    findNext(c) {
        if (this.nextCell(c))
            return this.nextCell(c)
        let root = this.layout?.layout
        if (root)
            return root.findNext(this.layout)
        return null
    }
}
