import "./css/terminal7.css"
import "./css/xterm.css"
import "./css/framework7-icons.css"
import "./css/codemirror.css"
import "./css/dialog.css"
import { Terminal7 } from "./terminal7.js"
import { Plugins } from '@capacitor/core'
const { StatusBar } = Plugins
/*
 * Initilization code, where terminal 7 is created and opened
 */
document.addEventListener("DOMContentLoaded", () => {
    // do nothing when running a test
    if (window.StatusBar) {
        StatusBar.hide()
    }
    if (window.__html__ == undefined) {
        window.terminal7 = new Terminal7()
        console.log("openening terminal7")
        terminal7.open(document.getElementById('terminal7'))
    }
})
