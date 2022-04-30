import { test, expect, Page, BrowserContext } from '@playwright/test'
import * as fs from 'fs'
import waitPort from 'wait-port'


const local = process.env.LOCALDEV !== undefined,
      url = local?"http://localhost:3000":"http://terminal7"

test.describe('terminal7 direct WebRTC session', ()  => {

    const sleep = (ms) => { return new Promise(r => setTimeout(r, ms)) }
    const connectGate = async () => {
        const btns = page.locator('#static-hosts button')
        await page.screenshot({ path: `/result/zero.png` })
        await expect(btns).toHaveCount(2)
        await btns.last().dispatchEvent('pointerdown')
        await sleep(50)
        await btns.last().dispatchEvent('pointerup')
    }

    let page: Page,
        context: BrowserContext

    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext()
        page = await context.newPage()
        page.on('console', (msg) => console.log('console log:', msg.text()))
        page.on('pageerror', (err: Error) => console.log('PAGEERROR', err.message))
        await waitPort({host:'terminal7', port:80})
        const response = await page.goto(url)
        await expect(response.ok(), `got error ${response.status()}`).toBeTruthy()
        await page.evaluate(async () => {
            window.terminal7.notify = (msg: string) => console.log("NOTIFY: "+msg)
            localStorage.setItem("CapacitorStorage.dotfile",`
[theme]
foreground = "#00FAFA"
background = "#000"
selection = "#D9F505"
[indicators]
flash = 100
[exec]
shell = "bash"
[net]
timeout = 3000
retries = 3
ice_server = "stun:stun2.l.google.com:19302"
[ui]
quickest_press = 1000
max_tabs = 10
cut_min_distance = 80
cut_min_speed = 2.5
# no pinch when scrolling -> y velocity higher than XTZ px/ms
pinch_max_y_velocity = 0.1`
)
            localStorage.setItem("CapacitorStorage.gates", JSON.stringify(
                [{"id":0,
                  "addr":"webexec",
                  "name":"foo",
                  "windows":[],
                  "store":true,
                  "tryWebexec": true,
                }]
            ))
        })
        // first page session for just for storing the dotfiles
        await page.reload({waitUntil: "networkidle"})
        const fp = await page.evaluate(async () => {
            window.terminal7.notify = (msg: string) => console.log("NOTIFY: "+msg)
            return await window.terminal7.getFingerprint()
        })
        fs.writeFileSync('/webexec_config/authorized_tokens', fp + '\n')
        // add terminal7 initializtion and globblas
        await waitPort({host:'webexec', port:7777})

        const playButton = page.locator('.play-button')
        await expect(playButton).toBeVisible()
        await playButton.click()
        await page.screenshot({ path: `/result/first.png` })
        await page.locator('.onmobile').click()
        await page.locator('#mobile-instructions .close').click()
    })

    test('connect to gate see help page and hide it', async () => {
        connectGate()
        await page.screenshot({ path: `/result/second.png` })
        const help  = page.locator('#help-gate')
        await expect(help).toBeVisible()
        await help.click()
        await expect(help).toBeHidden()
    })
    test('pane is visible and session is open', async () => {
        await expect(page.locator('.pane')).toHaveCount(1)
        await sleep(500)
        const paneState = await page.evaluate(() => {
            const pane = window.terminal7.activeG.activeW.activeP
            return pane.d.readyState
        })
        expect(paneState).toEqual("open")
    })
    test('a pane can be split', async () => {
        await page.evaluate(async() => {
            const pane = window.terminal7.activeG.activeW.activeP
            const pane2 = pane.split("topbottom")
        })
        await expect(page.locator('.pane')).toHaveCount(2)
        await page.evaluate(() => window.terminal7.goHome())
    })
    test('a gate restores after reload', async() => {
        await page.reload({waitUntil: "networkidle"})
        await page.evaluate(async () => {
            window.terminal7.notify = console.log
        })
        await page.locator('.play-button').click()
        connectGate()
        await page.screenshot({ path: `/result/2.png` })
        await expect(page.locator('.pane')).toHaveCount(2)
    })
    test('a pane can be close', async() => {
        const exitState = await page.evaluate(() => {
            try {
                window.terminal7.activeG.activeW.activeP.d.send("exit\n")
                return "success"
            } catch(e) { return e.toString() }
        })
        expect(exitState).toEqual("success")
        await expect(page.locator('.pane')).toHaveCount(1)
    })
    test('disengage and reconnect', async() => {
        await page.evaluate(async() => {
            const gate = window.terminal7.activeG
            gate.activeW.activeP.d.send("seq 10; sleep 1; seq 10 100\n")
        })
        await sleep(500)
        await page.screenshot({ path: `/result/second.png` })
        const lines = await page.evaluate(() =>
           window.terminal7.activeG.activeW.activeP.t.buffer.active.length)
        expect(lines).toEqual(39)
        await page.evaluate(async() => {
            const gate = window.terminal7.activeG
            gate.disengage().then(() => {
                    window.terminal7.clearTimeouts()
            })
            console.log(">>> after disengage:", window.terminal7.activeG, gate.name)
        })
        await sleep(1000)
        await page.screenshot({ path: `/result/third.png` })
        await page.evaluate(async() => {
            window.terminal7.activeG.connect()
        })
        // connectGate()
        await expect(page.locator('.pane')).toHaveCount(1)
        await sleep(500)
        const lines2 = await page.evaluate(() => {
           const buffer = window.terminal7.activeG.activeW.activeP.t.buffer.active,
                 ret = buffer.length
            console.log(">>> -------  start of buffeer --------")
           for (var i=0; i<ret; i++)
               console.log(buffer.getLine(i).translateToString
())
            console.log(">>> -------  end of buffeer --------")
            return (ret)
        })
        await page.screenshot({ path: `/result/fourth.png` })
        // TODO: expect(lines2).toEqual(103)
        expect(lines2).toBeGreaterThan(100)
    })
    test('after disengage & reconnect, a a pane can be close', async() => {
        await page.screenshot({ path: `/result/fifth.png` })
        const exitState = await page.evaluate(() => {
            const pane = window.terminal7.activeG.activeW.activeP
            try {
                pane.d.send("exit\n")
                return "success"
            } catch(e) { return e.toString() }
        })
        expect(exitState).toEqual("success")
        await expect(page.locator('.pane')).toHaveCount(0)
    })
    test('auto restore gate', async() => {
        connectGate()
        await expect(page.locator('.pane')).toHaveCount(1)
        await page.evaluate(async () => {
            const value = localStorage.getItem("CapacitorStorage.dotfile")
            const lines = value + "\nauto_restore = true"
            console.log(lines)
            await localStorage.setItem("CapacitorStorage.dotfile", lines)
        })
        await page.reload({waitUntil: "networkidle"})
        await page.evaluate(async () => {
            window.terminal7.notify = console.log
        })
        await sleep(1000)
        await page.screenshot({ path: `/result/7.png` })
        await expect(page.locator('.pane')).toHaveCount(1)
        const inGate = await page.evaluate(() => window.terminal7.activeG != null)
        expect(inGate).toBeTruthy()
    })
})
