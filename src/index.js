import "./css/terminal7.css"
import "./css/xterm.css"
import { Terminal7 } from "./terminal7.js"

var host, pc
var terminal7 = new Terminal7()
terminal7.open(document.getElementById('terminal7'))
let pane = terminal7.activeP
let term = pane.t
let state = 0
let sendChannel = null
var firstTime = true

// Handle pane keys before connecting to the remote
pane.t.onKey( (keys, ev) => {
    if (pane.state != "opened")
        return
    let code = keys.key.charCodeAt(0)
    term.write(keys.key)
    if (code == 13) {
        console.log(state+"=>3")
        console.log(host)
        state = 3
        term.write("\n\r\n\r")
        terminal7.connect(host)
        pane.openDC()
    }
    else if (firstTime) {
        console.log("1=>2")
        console.log(host)
        host = keys.key
        firstTime = false
    } else {
        console.log("2")
        host += keys.key
    }
})

function Connect() {
    if (!term)
        return
    host = window.location.href.substring(7, window.location.href.indexOf(":", 7))+":8888"
    term.write("\n +-+-+  +---+  +--\\     +   +    +  +  +     +     +      777777")
    term.write("\n   |    |      |   )   +++ +++   |  ++ |    +++    |         77")
    term.write("\n   |    +--+   +--/    + +++ +   |  +--+   ++ ++   |       777")
    term.write("\n   |    |      |  \\   +   +   +  |  | ++  +-----+  |      77")
    term.write("\n   +    +---+  |   \\  +       +  +  +  +  +     +  +---+  7")

    term.write("\n\nWelcome To Terminal Seven,\r\n")
    term.write("\nWhere is your host: ("+host+") ")
    term.focus()
}
/*
let p2 = pane.split("topbottom")
// p2.openURL()
p2.openTerminal()
p2.t.write("Another pane")
let p3 = p2.split("rightleft")
// p3.openURL()
p3.openTerminal()
 p3.t.write("\tLast pane")
    */
Connect()
