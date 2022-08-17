import { test, expect, Page, BrowserContext } from '@playwright/test'
import * as fs from 'fs'
import waitPort from 'wait-port'


const local = process.env.LOCALDEV !== undefined,
      url = local?"http://localhost:3000":"http://terminal7"

test.describe('terminal 7session', ()  => {

    const sleep = (ms) => { return new Promise(r => setTimeout(r, ms)) }
    const connectGate = async () => {
        const btns = page.locator('#gates button')
        await page.screenshot({ path: `/result/0.png` })
        await expect(btns).toHaveCount(2)
        await btns.first().dispatchEvent('pointerdown')
        await sleep(50)
        await btns.first().dispatchEvent('pointerup')
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
        fs.writeFileSync('/webexec_config/authorized_fingerprints', fp + '\n')
        // add terminal7 initializtion and globblas
        await waitPort({host:'webexec', port:7777})

        const playButton = page.locator('.play-button')
        await expect(playButton).toBeVisible()
        await playButton.click()
        await page.screenshot({ path: `/result/1.png` })
        await page.locator('.onmobile').click()
        await page.locator('#mobile-instructions .close').click()
    })

    test('connect to gate see help page and hide it', async () => {
        connectGate()
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
    test('a pane can be reseted', async () => {
        await page.reload({waitUntil: "networkidle"})
        await page.evaluate(async () => {
            window.notifications = []
            window.terminal7.notify = (m) => window.notifications.push(m)
        })
        await page.locator('.play-button').click()
        connectGate()
        await sleep(500)
        await page.screenshot({ path: `/result/2.png` })
        page.locator('.tabbar .reset').click()
        let notConnected = true
        let i = 0
        while (true) {
            const len = await page.evaluate(async () => window.notifications.length)
            if (len == 5)
                break;
            await sleep(100)
            i++
            test.fail(i > 20, 'Timeout waiting for connection')
        }
        const nots = await page.evaluate(async () => window.notifications)
        await expect(page.locator('.pane')).toHaveCount(1)
        await expect(nots.slice(-1)[0]).toMatch(/foo.*: Connected/)
    })
})
