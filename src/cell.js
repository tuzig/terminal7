/*! Terminal 7 cells - Cell, Layout & Pane
 *  This file contains the code that makes terminal 7 cells
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
const  ABIT                = 10

export class Cell {
    constructor(props) {
        console.log("in cell constructore")
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
        this.zoomedE = null
    }
    /*
     * Creates the HTML elment that will store our dimensions and content
     * get an optional className to be added to the element
     */
    createElement(className) {
        // creates the div element that will hold the term
        this.e = document.createElement("div")
        this.e.p = this
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
        this.active = true
        if (this.w.activeP !== null) {
            this.w.activeP.e.classList.remove("focused")
            this.w.activeP.active = false
        }
        this.w.activeP = this
        this.e.classList.add("focused")
    }
    /*
     * Used to grow/shrink the terminal based on containing element dimensions
     * Should be overide
     */
    fit() { }
    scale() {}
    refreshDividers() {}

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
            pinch = new Hammer.Pinch({event: "pinch"}),
            lastEventT = 0

        h.add([singleTap,
            doubleTap,
            pinch,
            new Hammer.Tap({event: "twofingerstap", pointers: 2})])

        h.on('tap', e => {
            this.focus()
            this.gate.sendState()
        })
        h.on('twofingerstap', e => {
            this.toggleZoom()
        })
        h.on('doubletap', e => {
            this.toggleZoom()
        })

        h.on('pinch', e => {
            console.log(e.additionalEvent, e.distance, e.angle, e.deltaTime, e.isFirst, e.isFinal)
            if (e.deltaTime < this.lastEventT)
                this.lastEventT = 0
            if (e.deltaTime - this.lastEventT < 200)
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
        this.e.remove()
        if (this.layout)
            this.layout.onClose(this)
    }
    toggleZoom() {
        if (this.zoomed) {
            // Zoom out
            let te = this.zoomedE.children[0].children[0]
            this.e.appendChild(te)
            document.body.removeChild(this.zoomedE)
            this.zoomedE = null
            this.w.e.classList.remove("hidden")
        } else {
            let H = document.body.offsetHeight,
                c = document.createElement('div'),
                e = document.createElement('div'),
                te = this.e.removeChild(this.e.children[0])
            c.classList.add("zoomed")
            e.classList.add("pane", "zoomed", "focused")
            e.style.height = `${H - 44}px`
            e.style.top = "22px"
            e.style.width = "98%"
            this.catchFingers(e)
            e.appendChild(te)
            c.appendChild(e)
            document.body.appendChild(c)
            this.zoomedE = c
            this.w.e.classList.add("hidden")
        }
        this.zoomed = !this.zoomed
        terminal7.run(_ => this.focus(), ABIT)
    }
}
