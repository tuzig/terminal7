import { RTSession, RTChannel } from "../src//rtsession.ts"
import { Terminal7 } from "../src/terminal7"
import { Gate } from "../src/gate"
import { T7Map } from "../src/map"
import { vi } from "vitest";
import { Terminal } from '@xterm/xterm'

vi.mock("xterm");
vi.mock('@revenuecat/purchases-capacitor')

export class resizeObs {
    constructor(cb) {
        cb();
    }
    observe() {
    }
    disconnect() {
    }
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

export function returnLater(ret: unknown) {
    vi.fn(() => new Promise( resolve => setTimeout(() => resolve(ret), 0)))
}

export class Terminal7Mock extends Terminal7 {
    conf = { ui: {max_tabs: 10,
                    max_panes: 10,
                    min_pane_size: 0.01},
             net: {timeout: 1000,
                   iceServer: ""}, 
             exec: {shell: "bash" },
             peerbook: { insecure: true },
           }
    keys = {default: { public: "TBD", private: "TBD" }}
    netConnected = true
    notifications: string[] = []
    notify(message: string) {
        this.map.t0.out += message
    }
    constructor() {
        super({})
        window.ResizeObserver = resizeObs
        
        document.body.innerHTML = `
<div id='t7'></div>
<div id='map'>
    <div id='log-minimized'></div>
    <div id='gates'>
        <div id='add-gate'></div>
    </div>
</div>
<div id='log'><div id="t0"><div id="capslock-indicator"></div></div></div>
<div id='log-button'></div>
<div id='log-msgs'></div>
<div id='help-button'></div>
<div id='help-gate'></div>
<div id='map-button'></div>
    <template id="gate-template">
    <div class="windows-container">
    </div>
    <div class="gate-stats">
    </div>
    <div class="hidden search-box border">
      <nav class="tabbar-search">
        <button type="button" class="search-up"><i class="f7-icons">arrowtriangle_up</i></button>
        <button type="button" class="search-down"><i class="f7-icons">arrowtriangle_down</i></button>
        <!-- TODO: implment the url & file buttons
        <a href="#find-url" class="hidden">URL</a>
        <a href="#find-file" class="hidden">File</a>
        -->
        <input type="text" name="search-term">
        <button type="button" class="search-close"><i class="f7-icons">xmark</i></button>
      </nav>
    </div>
    <div class="hidden rename-box border">
      <nav class="tabbar-search">
        <button type="button" class="rename-close"><i class="f7-icons">xmark</i></button>
        <input type="text" name="new-name" id="name-input">
      </nav>
    </div>

    <nav class="tabbar">
          <button type="button" class="add-tab"><i class="f7-icons">
                  plus</i></button>
          <nav class="tabbar-names">
          </nav>
          <button type="button" class="reset"><i class="f7-icons">
                  arrow_2_circlepath</i></button>
    </nav>
    </template>
    <template id="divider-template">
        <div class="divider hidden">
            <img width="8" height="44" src="img/divider.png" alt="a divider">
        </div>
    </template>
    <template id="lose-state-template">
       <div class="lose-state modal border temporal">
          <pre></pre>
          <nav>
              <button type="button" class="close"></button>
              <button type="button" class="continue"></button>
              <button type="button" class="copy"></button>
          </nav>
       </div>
    </template>
    <button id="add-static-host"></button>
    <div id="add-host" class="hidden"></div>
    <div id="divide-v"></div>
    <div id="divide-h"></div>
`

    }
    clearTempGates() {
    }
    clearTimeouts() {
    }
    open(e) {
        this.e = e
        this.map = new T7Map()
        this.map.open()
    }
    getFingerprint() {
        return new Promise((resolve, reject) => {
            resolve("BADFACE")
        })
    }
    async readId() {
        return {
            publicKey: "foo",
            privateKey: "bar"
        }
    }
}
