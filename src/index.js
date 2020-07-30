import "./css/terminal7.css"
import "./css/xterm.css"
import "./css/framework7-icons.css"
import { Terminal7, Host } from "./terminal7.js"

var host, pc
let state = 0
let sendChannel = null
var firstTime = true

/*
 * Initilization code, where terminal 7 is created and opened
 */
document.addEventListener("DOMContentLoaded", () => {
    // do nothing when running a test
    if (window.__html__ == undefined) {
        let terminal7 = new Terminal7()
        console.log("openening terminal7")
        terminal7.open(document.getElementById('terminal7'))
    }
})
