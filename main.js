import "./css/terminal7.css"
import "./css/xterm.css"
import "./css/framework7-icons.css"
import "./css/codemirror.css"
import "./css/dialog.css"
import { Terminal7 } from "./src/terminal7.js"
import { registerSW } from "virtual:pwa-register";

if ("serviceWorker" in navigator) {
  // && !/localhost/.test(window.location)) {
  registerSW();
}
/*
 * Initilization code, where terminal 7 is created and opened
 */
document.addEventListener("DOMContentLoaded", () => {
    // do nothing when running a test
    if (window.__html__ == undefined) {
        window.terminal7 = new Terminal7()
        terminal7.open()
    }
})
window.addEventListener('beforeinstallprompt', e => {
    window.installPrompt = e
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
})
