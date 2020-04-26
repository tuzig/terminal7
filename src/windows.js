import { Deque } from '@blakeembrey/deque'
import { Terminal } from 'xterm'

const THEME = {foreground: "#00FAFA", background: "#271d30"}
const MINIMUM_COLS = 2
const MINIMUM_ROWS = 1

class Panes {
    constructor() {
        this.lastID = 0
    }
    newID() { return "l"+ this.lastID++}
    add(props) {
        if (!props.id)
            props.id = panes.newID()
        this[props.id] = new Pane(props)
        return this[props.id]
    }
}
// let windows = new Deque()
// windows.add = props => this.push(Pane(props))
class Cell {
    constructor(props) {
        this.p = props
        this.parent = null
    }
}


class LayoutCell extends Cell {
    constructor(props) {
        super(props)
        this.sons = Deque();
    }
    redraw() {
        if (this.p.type == "rightleft") {
            let l = this.sons.size
            let w = this.p.sx / l
            let xoff = 0
            for (s in this.sons.entries()) {
                s.p.sx = w
                s.p.xoff = xoff
                xoff += w
                s.redraw()
            }       
        }
    }


}

class Pane extends Cell {
    constructor(props) {
        super(props)
        this.t = new Terminal({
            // cols: this.p.sx,
            // rows: this.p.sy,
            convertEol: true,
            theme: THEME,
        })
    }
    open(elem) {
        this.e = elem
        this.t.open(elem)
        this.fit()
    }
    redraw() {
        this.e.width = this.sx
        this.e.height = this.sy
        this.e.top = yoff
        this.e.left = xoff
    }
    proposeDimensions() {
        if (!this.t) {
          return undefined
        }

        if (!this.t.element || !this.t.element.parentElement) {
          return undefined
        }

        const core = this.t._core

        const parentElementStyle = window.getComputedStyle(this.e.parentElement)
        const parentElementHeight = parseInt(parentElementStyle.getPropertyValue('height'))
        const parentElementWidth = Math.max(0, parseInt(parentElementStyle.getPropertyValue('width')))
        const elementStyle = window.getComputedStyle(this.t.element)
        const elementPadding = {
          top: parseInt(elementStyle.getPropertyValue('padding-top')),
          bottom: parseInt(elementStyle.getPropertyValue('padding-bottom')),
          right: parseInt(elementStyle.getPropertyValue('padding-right')),
          left: parseInt(elementStyle.getPropertyValue('padding-left'))
        }
        const elementPaddingVer = elementPadding.top + elementPadding.bottom
        const elementPaddingHor = elementPadding.right + elementPadding.left
        const availableHeight = parentElementHeight - elementPaddingVer
        const availableWidth = parentElementWidth - elementPaddingHor - core.viewport.scrollBarWidth
        const geometry = {
          cols: Math.max(MINIMUM_COLS, Math.floor(availableWidth / core._renderService.dimensions.actualCellWidth)),
          rows: Math.max(MINIMUM_ROWS, Math.floor(availableHeight / core._renderService.dimensions.actualCellHeight))
        }
        return geometry
    }
    fit() {
        const dims = this.proposeDimensions()
        if (this.t.rows !== dims.rows || this.t.cols !== dims.cols) {
              this.t._core._renderService.clear();
              this.t.resize(dims.cols, dims.rows);
        }
    }
    // splitting the pane, receivees a type-  either "topbottom" or "rightleft"
    split(type) {
        if (this.parent && this.parent.type != type) {
            // Add layout_cell
        // create a layout based on this.p
            let l_props = JSON.parse(JSON.stringify(this.p))
            l_props.type = type
            let l = new LayoutCell(l_props)
            l.parent = this.parent
            this.parent = l
            if (type == "topbottom") {
                let netRows = this.sy - 1 // save a row for the border
                let halfSize = netRows / 2 // rounded down
                this.p.sy = halfSize + netRows%2
                // TODO: resize t.term
                p_props = {sx: this.sx, sy: halfSize,
                           yoff: this.p.sy+1, xoff: this.p.xoff} 
            }
            else if (type == "rightleft") {
                let netCols = this.sx - 1
                let halfSize = netCols / 2
                this.p.sx = halfSize  + netCols%2
                p_props = {sx: halfSize, sy: this.sy,
                           yoff: this.sy, xoff: this.p.sx+1} 
                
            }
            var p = new Pane(p_props)
            l.sons.extend([this, p])
            l.redraw()
                
        }
        else {
            console.log("TODO: just squeeze another pane in")
        }
    }
    output(buf) {
        this.t.write(buf)
    }
}
export { Panes, Pane, LayoutCell }
