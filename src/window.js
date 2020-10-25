import { Layout } from './cells.js'
import * as Hammer from 'hammerjs'

const ABIT = 10

export class Window {
    constructor(props) {
        this.host = props.host
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
        this.e.id = `tab-${this.host.id}.${this.id}`
        e.appendChild(this.e)

        // Add the name with link to tab bar
        let div = document.createElement('div'),
            a = document.createElement('a')
        a.id = this.e.id+'-name'
        a.w = this
        a.setAttribute('href', `#${this.e.id}`)
        a.innerHTML = this.name
        // Add gestures on the window name for rename and drag to trash
        let h = new Hammer.Manager(a, {})
        h.options.domEvents=true; // enable dom events
        h.add(new Hammer.Press({event: "rename", pointers: 1}))
        h.add(new Hammer.Tap({event: "switch", pointers: 1}))
        h.on("rename", ev => this.rename())
        h.on("switch", (ev) => this.focus())
        div.appendChild(a)
        this.nameE = a
        let wn = this.host.e.querySelector(".tabbar-names")
        if (wn != null)
            wn.appendChild(div)
    }
    /*
     * Change the active window, all other windows and
     * mark its name in the tabbar as the chosen one
     */
    focus() {
        this.host.breadcrumbs.push(this)
        // turn off the current active
        let a = this.host.activeW
        if (a) {
            a.nameE.classList.remove("on")
            a.e.classList.add("hidden")
        }
        this.e.classList.remove("hidden")
        this.nameE.classList.add("on")
        this.host.activeW = this
        window.location.href=`#tab-${this.host.id}.${this.id+1}`
        this.host.sendState()
        setTimeout(_ => this.activeP.focus(), ABIT)
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
            host: this.host,
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
            this.host.sendState()
            setTimeout(() => p.innerHTML = p.w.name, 0)
        }, { once: true })
        i.addEventListener('change', (e) => {
            console.log("change", e)
            let p = e.target.parentNode
            p.w.name = e.target.value
            this.host.sendState()
            setTimeout(() => p.innerHTML = p.w.name, 0)
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
        this.host.windows.splice(this.host.windows.indexOf(this), 1)
        this.host.activeW = null
        // remove myself from the breadcrumbs
        this.host.breadcrumbs.pop()
        if (this.host.windows.length == 0)
            this.host.close()
        else
            if (this.breadcrumbs.length > 0)
                this.host.breadcrumbs.pop().focus()
            else
            this.host.windows[0].focus()

    }

}
