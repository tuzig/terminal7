/*! Terminal 7 Cell - a class used as super for both Pane & Layout
 *
 *  Copyright: (c) 2021 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import * as Hammer from 'hammerjs'
const   ABIT                = 10,
        FOCUSED_BORDER_COLOR = "#F4DB53",
        UNFOCUSED_BORDER_COLOR = "#373702"

export class Cell {
    constructor(props) {
        this.gate = props.gate || null
        this.w = props.w
        this.id = props.id || undefined
        this.layout = props.layout || null
        this.createElement(props.className)
        this.sx = props.sx || 0.8
        this.sy = props.sy || 0.8
        this.xoff = props.xoff || 0
        this.yoff = props.yoff || 0
        this.zoomed = false
        this.t7 = window.terminal7
    }
    /*
     * Creates the HTML elment that will store our dimensions and content
     * get an optional className to be added to the element
     */
    createElement(className) {
        // creates the div element that will hold the term
        this.e = document.createElement("div")
        this.e.cell = this
        this.e.classList = "cell"
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
        this.w.activeP = this
        this.e.style.borderColor = FOCUSED_BORDER_COLOR
        this.w.updateDivideButtons()
        setTimeout(() => window.location.href = `#pane-${this.id}`)
        this.w.nameE.setAttribute("href", `#pane-${this.id}`)
    }

    /*
     * Catches gestures on an elment using hammerjs.
     * If an element is not passed in, `this.e` is used
     */
    catchFingers(elem) {
        let e = (typeof elem == 'undefined')?this.e:elem,
            h = new Hammer.Manager(e, {}),
        // h.options.domEvents=true; // enable dom events
            singleTap = new Hammer.Tap({event: "tap"}),
            doubleTap = new Hammer.Tap({event: "doubletap", taps: 2}),
            pinch = new Hammer.Pinch({event: "pinch"})

        h.add([singleTap,
            doubleTap,
            pinch,
            new Hammer.Tap({event: "twofingerstap", pointers: 2})])

        h.on('tap', () => {
            if (this.w.activeP != this) {
                this.focus()
                this.gate.sendState()
            }
        })
        h.on('twofingerstap', () => {
            this.toggleZoom()
        })
        h.on('doubletap', () => {
            this.toggleZoom()
        })

        h.on('pinch', e => {
            this.t7.log(e.additionalEvent, e.distance, e.velocityX, e.velocityY, e.direction, e.isFinal)
            if (e.deltaTime < this.lastEventT)
                this.lastEventT = 0
            if ((e.deltaTime - this.lastEventT < 200) ||
                 (e.velocityY > this.t7.conf.ui.pinchMaxYVelocity))
                return
            this.lastEventT = e.deltaTime
            if (e.additionalEvent == "pinchout") 
                this.scale(1)
            else
                this.scale(-1)
        })
        this.mc = h
    }
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
            canvas.height = 0;
            canvas.width = 0;
        })
        if (this.zoomed)
            this.unzoom()
        this.e.remove()
        if (this.layout)
            this.layout.onClose(this)
        this.gate.sendState()
    }
    styleZoomed(e) {
        e = e || this.t7.zoomedE.querySelector(".pane")
        const se = this.gate.e.querySelector(".search-box")
        let style
        if (se.classList.contains("show"))
            style = `${document.querySelector('.windows-container').offsetHeight - 22}px`
        else
            style = `${document.body.offsetHeight - 42}px`
        e.style.height = style
        e.style.top = "0px"
        e.style.width = "100%"
        this.fit()
    }
    toggleZoom() {
        if (this.zoomed)
            this.unzoom()
        else
            this.zoom()
        this.gate.sendState()
        this.t7.run(() => this.focus(), ABIT)
    }
    zoom() {
        let c = document.createElement('div'),
            e = document.createElement('div'),
            te = this.e.removeChild(this.e.children[0])
        c.classList.add("zoomed")
        e.classList.add("pane", "focused")
        e.style.borderColor = FOCUSED_BORDER_COLOR
        e.appendChild(te)
        c.appendChild(e)
        this.catchFingers(e)
        document.body.appendChild(c)
        this.t7.zoomedE = c
        this.w.e.classList.add("hidden")
        this.resizeObserver = new window.ResizeObserver(() => this.styleZoomed(e))
        this.resizeObserver.observe(e)
        this.zoomed = true
    }
    unzoom() {
        if (this.resizeObserver != null) {
            this.resizeObserver.disconnect()
            this.resizeObserver = null
        }
        let te = this.t7.zoomedE.children[0].children[0]
        this.e.appendChild(te)
        document.body.removeChild(this.t7.zoomedE)
        this.t7.zoomedE = null
        this.w.e.classList.remove("hidden")
        this.zoomed = false
    }
}
