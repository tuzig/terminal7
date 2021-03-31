/*! Terminal 7 Pane - a class that colds a pane - a terminal emulation 
 * connected over a data channel to a remote interactive process
 *
 *  Copyright: (c) 2021 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { Plugins } from '@capacitor/core'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { SearchAddon } from 'xterm-addon-search'
import { CopymodeAddon } from './copy-mode/copymode-addon.ts'
import { Cell } from './cell.js'
import { fileRegex, urlRegex } from './utils.js'

import * as aE from 'ansi-escapes'
import * as XtermWebfont from 'xterm-webfont'

const  REGEX_SEARCH        = false,
       SEARCH_OPTS = {
            regex: REGEX_SEARCH,
            wholeWord: false,
            incremental: false,
            caseSensitive: true}


const { Browser, Clipboard } = Plugins
export class Pane extends Cell {
    constructor(props) {
        props.className = "pane"
        super(props)
        this.catchFingers()
        this.state = "init"
        this.d = null
        this.active = false
        this.webexecID = props.webexec_id || null
        this.fontSize = props.fontSize || 12
        this.theme = props.theme || terminal7.conf.theme
        this.searchVisible = false
        this.cmRep = 0
        this.cmSY = false
        this.dividers = []
    }

    /*
     * Pane.write writes data to the terminal
     */
    write(data) {
        this.t.write(data)
    }
                
    /*
     * Pane.openTerminal opens an xtermjs terminal on our element
     */
    openTerminal() {
        var con = document.createElement("div")

        con.p = this
        this.t = new Terminal({
            convertEol: false,
            fontFamily: "FiraCode",
            fontSize: this.fontSize,
            theme: this.theme,
            rows:24,
            cols:80
        })
        this.fitAddon = new FitAddon()
        this.searchAddon = new SearchAddon()
        this.copymodeAddon = new CopymodeAddon()
        this.copymodeAddon.searchAddon = this.searchAddon;
        this.copymodeAddon.onstop = () => { console.log('STOPPED'); }

        // there's a container div we need to get xtermjs to fit properly
        this.e.appendChild(con)
        con.style.height = "100%"
        con.style.width = "100%"
        this.t.loadAddon(new XtermWebfont())
        // the canvas gets the touch event and the nadler needs to get back here
        this.t.loadAddon(this.fitAddon)
        this.t.loadAddon(this.searchAddon)
        this.t.loadAddon(this.copymodeAddon)
        this.createDividers()
        this.t.loadWebfontAndOpen(con).then(_ => {
            this.fit(pane => { if (pane != null) pane.openDC() })

            this.t.textarea.tabIndex = -1
            con.querySelector(".xterm-cursor-layer").p = this
            this.t.attachCustomKeyEventHandler(ev => {
                // ctrl c is a special case 
                if (ev.ctrlKey && (ev.key == "c")) {
                    this.d.send(String.fromCharCode(3))
                    return false
                }
                if (ev.metaKey && (ev.key != "Shift") && (ev.key != "Meta")) {
                    // ensure help won't pop
                    terminal7.metaPressStart = Number.MAX_VALUE
                    return this.handleMetaKey(ev)
                }
                else
                    return true
            })
            this.t.onData(d =>  {
                if (!this.copymodeAddon.isActive && (this.d != null)
                    && (this.d.readyState == "open"))
                    this.d.send(d)
            })
            const resizeObserver = new ResizeObserver(_ => this.fit())
            resizeObserver.observe(this.e);
            this.state = "opened"
        })
        return this.t
    }
    // updateBufferPosition() {
    //     var v
    //     const b = this.t.buffer.active,
    //           pos = this.t.getSelectionPosition()
    //     if (pos !== undefined)
    //         v = `[${pos.startRow}/${b.length}]`
    //     else
    //         v = `[${b.baseY + b.cursorY + 1}/${b.length}]`
    // }
    setTheme(theme) {
        this.t.setOption("theme", theme)
    }
    /*
     * Pane.scale is used to change the pane's font size
     */
    scale(by) {
        this.fontSize += by
        if (this.fontSize < 6) this.fontSize = 6
        else if (this.fontSize > 30) this.fontSize = 30
        this.t.setOption('fontSize', this.fontSize)
        this.fit()
    }

    // fit a pane to the display area. If it was resized, the server is updated.
    // returns true is size was changed
    fit(cb) {
        var oldr = this.t.rows,
            oldc = this.t.cols,
            ret = false
            
        try {
            this.fitAddon.fit()
        } catch {
            if (this.retries < terminal7.conf.retries) {
                this.retries++
                terminal7.run(this.fit, 20*this.retries)
            }
            else {
                console.log(`fit failed ${this.retries} times. giving up`)
                if (cb instanceof Function) cb(null)
            }
            return
        }
        this.refreshDividers()
        if (this.t.rows != oldr || this.t.cols != oldc) {
            this.gate.sendState()
            this.gate.sendSize(this)
            ret = true
        }
        if (cb instanceof Function) cb(this)
        return ret
    }
    /*
     * Pane.focus focuses the UI on this pane
     */
    focus() {
        super.focus()
        if (this.t !== undefined)
            this.t.focus()
        else 
            console.log("can't focus, this.t is undefined")
    }
    /*
     * Splitting the pane, receivees a dir-  either "topbottom" or "rightleft"
     * and the relative size (0-1) of the area left for us.
     * Returns the new pane.
     */
    split(dir, s) {
        var sx, sy, xoff, yoff, l
        // if the current dir is `TBD` we can swing it our way
        if (typeof s == "undefined")
            s = 0.5
        if ((this.layout.dir == "TBD") || (this.layout.cells.length == 1))
            this.layout.dir = dir
        // if we need to create a new layout do it and add us and new pane as cells
        if (this.layout.dir != dir)
            l = this.w.addLayout(dir, this)
        else 
            l = this.layout

        // update the dimensions & position
        if (dir == "rightleft") {
            sy = this.sy * (1 - s)
            sx = this.sx
            xoff = this.xoff
            this.sy -= sy
            yoff = this.yoff + this.sy
        }
        else  {
            sy = this.sy
            sx = this.sx * (1 - s)
            yoff = this.yoff
            this.sx -= sx
            xoff = this.xoff + this.sx
        }
        this.fit()

        // add the new pane
        let p = l.addPane({sx: sx, sy: sy, 
                       xoff: xoff, yoff: yoff,
                       parent: this})
        p.focus()
        return p

    }
    openDC() {
        var tSize = this.t.rows+'x'+this.t.cols,
            label = ""
        this.buffer = []

        // stop listening to old channel events
        if (this.d) {
            this.d.onclose = undefined
            this.d.onopen = undefined
            this.d.onmessage = undefined
        }

        label = this.webexecID?`>${this.webexecID}`:
           `${tSize},${terminal7.conf.exec.shell}`

        console.log(`opening dc with label: "${label}`)
        this.d = this.gate.pc.createDataChannel(label)
        this.d.onclose = e => {
            console.log(`on dc "${this.webexecID}" close, marker - ${this.gate.marker}`)
            this.state = "disconnected"
            if (this.gate.marker == -1)
                this.close()
        }
        this.d.onopen = () => {
            this.state = "opened"
            terminal7.run(() => {
                if (this.state == "opened") {
                    this.gate.notify("Data channel is opened, but no first message")
                    this.gate.stopBoarding()
                }}, terminal7.conf.net.timeout)
        }
        this.d.onmessage = m => this.onMessage(m)

        return this.d
    }
    // called when a message is received from the server
    onMessage (m) {
        terminal7.onMessage(m)
        var enc = new TextDecoder("utf-8")
        if (this.state == "opened") {
            var msg = enc.decode(m.data)
            this.state = "connected"
            this.webexecID = parseInt(msg.split(",")[0])
            if (isNaN(this.webexecID)) {
                this.gate.notify(msg, true)
                terminal7.logDisplay(true)
                this.close()
            } else
                this.gate.onPaneConnected(this)
        }
        else if (this.state == "connected") {
            this.write(new Uint8Array(m.data))
        }
        else
            this.gate.notify(`${this.state} & dropping a message: ${m.data}`)
    }
    toggleZoom() {
        super.toggleZoom()
        this.fit()
    }
    /*
     * Pane.handleCopyModeKey(ev) is called on a key press event when the
     * pane is in copy mode. 
     * Copy mode uses vim movment commands to let the user for text, mark it 
     * and copy it.
     */
    // handleCopyModeKey(ev) {
    //     let b = this.t.buffer.active,
    //         updateSelection = false,
    //         postWrite = () => { this.updateCopyMode() }
    //     // special handling for numbers
    //     if (ev.keyCode >=48 && ev.keyCode <= 57) {
    //         this.cmRep = this.cmRep * 10 + ev.keyCode - 48
    //         return
    //     }
    //     let r = (this.cmRep==0)?1:this.cmRep
    //     switch (ev.key) {
    //     case "Enter":
    //         if (this.t.hasSelection()) {
    //             Clipboard.write(this.t.getSelection())
    //             this.cmSY = false
    //             this.t.clearSelection()
    //             break
    //         }
    //     case "n":
    //         this.findNext()
    //         break
    //     case "f":
    //         if (ev.ctrlKey)
    //             this.t.scrollToLine(b.baseY+this.t.rows-2)
    //         else if (ev.metaKey)
    //             this.toggleSearch()
    //         else
    //             this.notify("TODO: go back a a word")
    //         break
    //     case "b":
    //         if (ev.ctrlKey)
    //             this.t.scrollToLine(b.baseY-this.t.rows+2)
    //         else
    //             this.notify("TODO: go back a a word")
    //         break
    //     case "p":
    //         this.findPrevious()
    //         break
    //     case "o":
    //         if (REGEX_SEARCH) {
    //             var u = this.t.getSelection()
    //             Browser.open({url: u})
    //         }
    //         break
    //     case "Escape":
    //     case "q":
    //         this.exitCopyMode()
    //         break
    //     case "ArrowUp":
    //     case "k":
    //         if (r > b.cursorY) {
    //             // we need to scroll
    //             this.t.scrollToLine(b.viewportY-r+b.cursorY)
    //             /*
    //             for (var i=0; i < r - b.cursorY; i++)
    //                 this.t.write(aE.scrollDown)
    //             */
    //             this.t.write(aE.cursorTo(b.cursorX, 0), postWrite)
    //         }
    //         else
    //             this.t.write(aE.cursorUp(r), postWrite)
    //         this.updateBufferPosition()
    //         break
    //     case "ArrowDown":
    //     case "j":
    //         this.t.write(aE.cursorDown(r), postWrite)
    //         break
    //     case "ArrowRight":
    //     case "l":
    //         this.t.write(aE.cursorForward(r), postWrite)
    //         break
    //     case "ArrowLeft":
    //     case "h":
    //         this.t.write(aE.cursorBackward(r), postWrite)
    //         break
    //     case "?":
    //     case "/":
    //         this.showSearch()
    //         break
    //     default:
    //         if (ev.keyCode == 32) {
    //             this.cmSY = b.cursorY
    //             this.cmSX = b.cursorX
    //             console.log(`set cmSX & Y to ${this.cmSX}, ${this.cmSY}`)
    //         }
    //         else
    //             this.gate.notify("TODO: Add copy mode help")
    //     }
    //     this.cmRep = 0
    // }
    /*
     * toggleSearch displays and handles pane search
     * First, tab names are replaced with an input field for the search string
     * as the user keys in the chars the display is scrolled to their first
     * occurences on the terminal buffer and the user can use line-mode vi
     * keys to move around, mark text and yank it
     */
    toggleSearch() {
        this.searchVisible = !this.searchVisible
        if (this.searchVisible) {
            this.copymodeAddon.stop();
            this.showSearch()
        }
        else
            this.exitSearch() 
    }
    showSearch() {
        // show the search field
        const se = this.gate.e.querySelector(".search-box")
        se.classList.remove("hidden")
        // this.updateBufferPosition()
        document.getElementById("search-button").classList.add("on")
        // TODO: restore regex search
        let u = se.querySelector("a[href='#find-url']"),
            f = se.querySelector("a[href='#find-file']"),
            i = se.querySelector("input[name='search-term']")
        if (REGEX_SEARCH) {
            i.setAttribute("placeholder", "regex here")
            u.classList.remove("hidden")
            f.classList.remove("hidden")
            u.onclick = ev => {
                ev.preventDefault()
                ev.stopPropagation()
                this.focus()
                i.value = this.searchTerm = urlRegex
                // this.handleCopyModeKey({keyCode: 13})
            }
            // TODO: findPrevious does not work well
            f.onclick = _ => this.searchAddon.findPrevious(fileRegex, SEARCH_OPTS)
        } else 
            i.setAttribute("placeholder", "search string here")
        if (this.searchTerm)
            i.value = this.searchTerm

        i.onkeydown = ev => {
            if (ev.keyCode == 13) {
                ev.preventDefault()
                ev.stopPropagation()
                this.focus()
                this.searchTerm = ev.target.value
                this.findPrevious();
                this.hideSearch();
                this.copymodeAddon.start();
            }
        }
        i.focus()
    }
    hideSearch() {
        const se = this.gate.e.querySelector(".search-box")
        se.classList.add("hidden")
        document.getElementById("search-button").classList.remove("on")
    }
    exitSearch() {
        this.hideSearch();
        this.copymodeAddon.stop();
        this.t.clearSelection()
        this.t.scrollToBottom()
        // this.t.write(aE.cursorTo(this.cmX, this.cmY))
        this.focus()
    }
    handleMetaKey(ev) {
        var f = null
        console.log(`Handling meta key ${ev.key}`)
        switch (ev.key) {
        case "c":
            if (this.t.hasSelection()) 
                Clipboard.write({string: this.t.getSelection()})
            break
        case "z":
            f = () => this.toggleZoom()
            break
        case ",":
            f = () => this.w.rename()
            break
        case "d":
            f = () => this.close()
            break
        case "0":
            f = () => this.scale(12 - this.fontSize)
            break
        case "=":
                f = () => this.scale(1)
            break
        case "-":
            f = () => this.scale(-1)
            break
        case "5":
            f = () => this.split("topbottom")
            break
        case "'":
            f = () => this.split("rightleft")
            break
        case "[":
            console.log('COPYMODE START?', terminal7.conf.features);
            f = () => (terminal7.conf.features.copy_mode)
                      ?this.copymodeAddon.start()
                      :null
            break
        case "f":
            f = () => this.toggleSearch()
            break
        // next two keys are on the gate level
        case "t":
            f = () => this.gate.newTab()
            break
        case "r":
            f = () => this.gate.disengage(_ => this.gate.connect())
            break
        // this key is at terminal level
        case "l":
            f = () => terminal7.logDisplay()
            break
        case "ArrowLeft":
            f = () => this.w.moveFocus("left")
            break
        case "ArrowRight":
            f = () => this.w.moveFocus("right")
            break
        case "ArrowUp":
            f = () => this.w.moveFocus("up")
            break
        case "ArrowDown":
            f = () => this.w.moveFocus("down")
            break
        }
        if (f != null) {
            f()
            ev.preventDefault()
            ev.stopPropagation()
            return false
        }
        return true
    }
    findPrevious(searchTerm) {
        if (searchTerm != undefined)
            this.searchTerm = searchTerm
        if (this.searchTerm != undefined
            && !this.searchAddon.findNext(this.searchTerm, SEARCH_OPTS))
            this.gate.notify(`Couldn't find "${this.searchTerm}"`)
    }
    findNext(searchTerm) {
        if (searchTerm != undefined)
            this.searchTerm = searchTerm
        if (this.searchTerm != undefined
            && !this.searchAddon.findPrevious(this.searchTerm, SEARCH_OPTS))
            // TODO: it's too intrusive. use bell?
            this.gate.notify(`Couldn't find "${this.searchTerm}"`)
    }
    /*
     * createDividers creates a top and left educationsl dividers.
     * The dividers are here because they're elegant and they let the user know
     * he can move the borders
     * */
    createDividers() {
        // create the dividers
        var t = document.getElementById("divider-template")
        if (t) {
            var d = [t.content.cloneNode(true),
                     t.content.cloneNode(true)]
            d.forEach((e, i) => {
                this.w.e.prepend(e)
                e = this.w.e.children[0]
                this.dividers.push(e)
                if (i == 1)
                    e.style.transform = "rotate(90deg)"
            })
        }
    }
    /*
     * refreshDividerrs rrepositions the dividers after the pane has been
     * moved or resized
     */
    refreshDividers() {
        var W = this.w.e.offsetWidth,
            H = this.w.e.offsetHeight,
            d = this.dividers[0]
        if (this.xoff > 0.001 & this.sy * H > 50) {
            // add elft divider
            d.style.left = `${this.xoff * W - 4}px`
            d.style.top = `${(this.yoff + this.sy/2)* H - 22}px`
            d.classList.remove("hidden")
        } else
            d.classList.add("hidden")
        d = this.dividers[1]
        if (this.yoff > 0.001 & this.sx * W > 50) {
            // add top divider
            d.style.top = `${this.yoff * H - 25}px`
            d.style.left = `${(this.xoff + this.sx/2)* W - 22}px`
            d.classList.remove("hidden")
        } else
            d.classList.add("hidden")
    }
    close() {
        if (this.d)
            this.d.onclose = undefined
        this.dividers.forEach(d => d.classList.add("hidden"))
        super.close()
    }
    dump() {
        var cell = {
            sx: this.sx,
            sy: this.sy,
            xoff: this.xoff,
            yoff: this.yoff,
            fontSize: this.fontSize,
            webexec_id: this.webexecID,
        }
        if (this.w.activeP && this.webexecID == this.w.activeP.webexecID)
            cell.active = true
        return cell
    }
}

