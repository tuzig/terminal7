import "./css/terminal7.css"
import "./css/xterm.css"
import "./css/framework7-icons.css"
import "./css/codemirror.css"
import "./css/dialog.css"
import { Terminal7 } from "./terminal7.js"
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
if ('serviceWorker' in navigator) {
   window.addEventListener('load', () => {
     navigator.serviceWorker.register('/service-worker.js').then(registration => {
       console.log('SW registered: ', registration);
     }).catch(registrationError => {
       console.log('SW registration failed: ', registrationError);
     });
   });
 // Initialize deferredPrompt for use later to show browser install prompt.
}
window.addEventListener('beforeinstallprompt', e => {
    let button = document.getElementById("install-button"),
        notes = document.getElementById("installation")
    button.classList.remove("hidden")
    notes.remove()
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    button.addEventListener('click', _ => {
        e.prompt()
        e.userChoice
        .then(outcome => {
            if (outcome) 
                terminal7.clear()
        })
    })
    console.log(`'beforeinstallprompt' event was fired.`);
})
