import "./css/terminal7.css"
import "./css/xterm.css"
import { Terminal7, Host } from "./terminal7.js"

var host, pc
let state = 0
let sendChannel = null
var firstTime = true


function connect() {
            terminal7.connect(host, "guest", "wishingUsSuccess")
            terminal7.openCDC().then(() => { console.log("CDC"); pane.openDC()})
}
document.addEventListener("DOMContentLoaded", () => {
    let terminal7 = new Terminal7(),
        pane = terminal7.activeP

    terminal7.open(document.getElementById('terminal7'))
    // display the home page, starting with the plus button
    const plusHost = document.getElementById('plus-host')
    if (plusHost != null)
        plusHost.onclick = (ev) => 
            document.getElementById("add-host").style.display="block"
    document.getElementById('add-host-form').onsubmit = (ev) => {
        let remember = ev.target.querySelector('[name="remember"]').value
        terminal7.connect({addr: ev.target.querySelector('[name="host"]').value,
                    user: ev.target.querySelector('[name="username"]').value,
                    secret: ev.target.querySelector('[name="password"]').value,
                    remember: remember == "on"
        })
        terminal7.openCDC().then(() => terminal7.activeP.openDC())
        ev.target.parentNode.style.display = 'none'
        return false
    }
})
