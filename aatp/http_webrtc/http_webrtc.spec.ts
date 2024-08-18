import { test, expect, Page, BrowserContext } from '@playwright/test'
import * as fs from 'fs'
import waitPort from 'wait-port'
import { connectFirstGate, reloadPage, getLines, sleep } from '../common/utils'


const local = process.env.LOCALDEV !== undefined,
      url = local?"http://localhost:3000":"http://terminal7"

test.describe('terminal7 direct WebRTC session', ()  => {

    let page: Page,
        context: BrowserContext

    test.afterAll(async () => await context.close())
    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext()
        page = await context.newPage()
        page.on('console', (msg) => {
            if (msg.type() == 'trace')
                console.trace('console trace:', msg.text())
            else 
                console.log('console log:', msg.text())
        })
        page.on('pageerror', (err: Error) => console.log('PAGEERROR', err.message))
        await waitPort({host:'terminal7', port:80})
        const response = await page.goto(url)
        await expect(response.ok(), `got error ${response.status()}`).toBeTruthy()
        await context.addInitScript(async () => {
            await localStorage.setItem("CapacitorStorage.dotfile",`
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
peerbook = "peerbook:17777"
[ui]
quickest_press = 1000
max_tabs = 10
cut_min_distance = 80
cut_min_speed = 2.5
# no pinch when scrolling -> y velocity higher than XTZ px/ms
pinch_max_y_velocity = 0.1`
)
            await localStorage.setItem("CapacitorStorage.gates", JSON.stringify(
                [{"id":0,
                  "addr":"webexec",
                  "name":"foo",
                  "windows":[],
                  "store":true,
                }]
            ))
        })
        // first page session for just for storing the dotfiles
        await reloadPage(page)
        const fp = await page.evaluate(async () => {
            return await window.terminal7.getFingerprint()
        })
        fs.writeFileSync('/webexec_config/authorized_fingerprints', fp + '\n')
        // add terminal7 initializtion and globblas
        await waitPort({host:'webexec', port:7777})
    })

    test('connect to gate see help page and hide it', async () => {
        connectFirstGate(page)
        const twrHelp = page.locator('#twr .help-bubble-text')
        await expect(twrHelp).toBeHidden()
        const splitHelp = page.locator('#divide-h .help-bubble-text')
        await expect(splitHelp).toBeVisible()
        const helpButton = page.locator('#help-button')
        await helpButton.dispatchEvent('pointerdown')
        await sleep(50)
        await helpButton.dispatchEvent('pointerup')
        await sleep(100)
        await expect(splitHelp).toBeHidden()
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
            pane.split("topbottom")
        })
        // wait for the update to hit the server
        await sleep(500)
        await expect(page.locator('.pane')).toHaveCount(2)
    })
    test('a gate restores after reload', async() => {
        await reloadPage(page)
        await connectFirstGate(page)
        await sleep(500)
        await page.screenshot({ path: `/result/2.png` })
        await expect(page.locator('.pane')).toHaveCount(2)
    })
    test('a pane can be closed', async() => {
        await sleep(500)
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

        await reloadPage(page)
        await connectFirstGate(page)
        await sleep(500)
        await page.evaluate(async() => {
            const gate = window.terminal7.activeG
            gate.activeW.activeP.d.send("seq 10; sleep 1; seq 10 100\n")
        })
        await sleep(500)
        await page.screenshot({ path: `/result/second.png` })
        let lastLine = (await getLines(page, -1, -1))[0]
        expect(lastLine).toMatch(/^10 *$/)
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
            await window.terminal7.activeG.reconnect()
        })
        // connectFirstGate()
        await expect(page.locator('.pane')).toHaveCount(1)
        await sleep(500)
        lastLine = (await getLines(page, -1, -1))[0]
        expect(lastLine).toMatch(/^100 *$/)
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
        await expect(page.locator('.windows-container')).toBeHidden()
    })
    test('after exit, the gate can be re-opened', async() => {
        connectFirstGate(page)
        await page.screenshot({ path: `/result/6.png` })
        await expect(page.locator('.windows-container')).toBeVisible()
        await expect(page.locator('.pane')).toHaveCount(1)
    })
    test('handling background events', async() => {
        await page.evaluate(async() =>
            window.terminal7.onAppStateChange({isActive: false}))
        await sleep(500)
        await page.screenshot({ path: `/result/7.png` })
        await page.evaluate(async() =>
            window.terminal7.onAppStateChange({isActive: true}))
        await expect(page.locator('.windows-container')).toBeVisible()
        await expect(page.locator('.pane')).toHaveCount(1)
        await expect(page.locator('#twr')).toBeHidden()

    })
    test.skip('auto restore gate', async() => {
        connectFirstGate(page)
        await expect(page.locator('.pane')).toHaveCount(1)
        await page.evaluate(async () => {
            const value = localStorage.getItem("CapacitorStorage.dotfile")
            const lines = value + "\nauto_restore = true"
            console.log(lines)
            await localStorage.setItem("CapacitorStorage.dotfile", lines)
        })
        await reloadPage()
        await sleep(1000)
        await expect(page.locator('.pane')).toHaveCount(1)
        const inGate = await page.evaluate(() => window.terminal7.activeG != null)
        expect(inGate).toBeTruthy()
    })
})
