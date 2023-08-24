import "./css/terminal7.css"
import "./css/xterm.css"
import "./css/framework7-icons.css"
import "./css/codemirror.css"
import "./css/dialog.css"
import { Terminal7 } from "./src/terminal7.js"
import { registerSW } from "virtual:pwa-register";
import { StatusBar, Style } from '@capacitor/status-bar';

if ("serviceWorker" in navigator) {
  // && !/localhost/.test(window.location)) {
  registerSW();
}
/*
 * Initilization code, where terminal 7 is created and opened
 */
document.addEventListener("DOMContentLoaded", async () => {
    // do nothing when running a test
    if (window.__html__ == undefined) {
        try {
            await StatusBar.setStyle({ style: Style.Dark });
            await StatusBar.show();
            await StatusBar.setOverlaysWebView({ overlay: true });
        } catch(e) {}
        window.terminal7 = new Terminal7()
        terminal7.open()
    }
})
window.addEventListener('beforeinstallprompt', e => {
    window.installPrompt = e
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
})
