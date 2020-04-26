import { Deque } from '@blakeembrey/deque'
import { Terminal } from 'xterm'

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
}

class Pane extends Cell {
    constructor(props) {
        super(props)
        this.t = new Terminal({
            cols: this.p.sx,
            rows: this.p.sy,
            convertEol: true,
            theme: {foreground: "#00FAFA", background: "#271d30"}
        })
    }
    // splitting the pane, receivees a type-  either "topbottom" or "rightleft"
    split(type) {
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
    }
    output(buf) {
        this.t.write(buf)
    }
}
export { Panes, Pane, LayoutCell }
