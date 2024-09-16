import { test, expect, Page, BrowserContext } from '@playwright/test'
import * as fs from 'fs'
import waitPort from 'wait-port'

import { connectFirstGate, waitForTWROutput, runSSHCommand } from '../common/utils'


const local = process.env.LOCALDEV !== undefined,
      url = local?"http://localhost:3000":"http://terminal7"

test.describe('terminal7 UI', ()  => {

    const sleep = (ms) => { return new Promise(r => setTimeout(r, ms)) }
    const webexecSSHConfig = {
          host: 'webexec',
          port: 22,
          username: 'runner',
          password: 'webexec'
    }
    let page: Page,
        context: BrowserContext

    test.afterAll(async () => await context.close())
    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext()
        page = await context.newPage()
        page.on('console', (msg) => console.log('console log:', msg.text()))
        page.on('pageerror', (err: Error) => console.log('PAGEERROR', err.message))
        await waitPort({host:'terminal7', port:80})
        const response = await page.goto(url)
        expect(response.ok(), `got error ${response.status()}`).toBeTruthy()
        await page.evaluate(async () => {
            window.terminal7.notify = (msg: string) => console.log("NOTIFY: "+msg)
            localStorage.setItem("CapacitorStorage.dotfile",`
[net]
peerbook = "peerbook:17777"
[peerbook]
insecure=true`)
            localStorage.setItem("CapacitorStorage.gates", JSON.stringify(
                [{"id":0,
                  "addr":"webexec",
                  "name":"foo",
                  "windows":[],
                  "store":true,
                  "firstConnection":true,
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

    })
    test('a gate ssh port can be edited', async () => {
        const editBtn = page.locator('.gate-edit')
        await editBtn.click()
        await page.locator('#t0').isVisible()

        await page.keyboard.press("Enter")
        await sleep(100)
        await page.keyboard.press("ArrowDown")
        await page.keyboard.press("ArrowDown")
        await page.keyboard.press("ArrowDown")
        await page.keyboard.type(" ")
        await page.keyboard.press("Enter")
        await sleep(100)
        await page.keyboard.type("1234")
        await page.keyboard.press("Enter")
        await sleep(100)
        await page.screenshot({path: '/result/1.png'})
        let port = await page.evaluate(() => terminal7.gates[0].sshPort)
        expect(port).toEqual(1234)
        await page.reload({ waitUntil: "networkidle" })
        port = await page.evaluate(async () => {
            while (!window.terminal7 || !window.terminal7.gates || window.terminal7.gates.length === 0)
                await new Promise(r => setTimeout(r, 100))
            return terminal7.gates[0].sshPort
        })
        expect(port).toEqual(1234)
        // hide TWR for next test
        await page.keyboard.type("hide")
        await page.keyboard.press("Enter")
    })

    test('a host with no port can added', async () => {
        const addBtn = page.locator('[data-test="addButton"]').first()
        await addBtn.click()
        await sleep(200)
        await page.keyboard.type("bar")
        await page.keyboard.press("Enter")
        const port = await page.evaluate(async () => {
            while (!window.terminal7 || !window.terminal7.gates || window.terminal7.gates.length < 2) {
                await new Promise(r => setTimeout(r, 100))

            }
            return terminal7.gates[1].sshPort
        })
        expect(port).toEqual(22)
        const name = await page.evaluate(() => terminal7.gates[1].name)
        expect(name).toEqual("bar")
    })
    test('a host with a port can added', async () => {
        await page.reload({ waitUntil: "networkidle" })
        const addBtn = page.locator('[data-test="addButton"]').first()
        await addBtn.click()
        await waitForTWROutput(page, "Enter destination", 500)
        await page.keyboard.type("baz:1234")
        await page.keyboard.press("Enter")
        const port = await page.evaluate(async () => {
            while (!window.terminal7 || !window.terminal7.gates || window.terminal7.gates.length < 3) {
                await new Promise(r => setTimeout(r, 100))
            }
            return terminal7.gates[2].sshPort
        })
        expect(port).toEqual(1234)
        const name = await page.evaluate(() => terminal7.gates[2].name)
        expect(name).toEqual("baz")
        await page.evaluate(async () => await terminal7.map.shell.escape())
    })

    test('gates can be deleteted', async () => {
        const btns = page.locator('[data-test="gateButton"]').filter({ hasText: "baz" })
        const btn = btns.first()
        const editBtn = btn.locator('.gate-edit')
        await editBtn.click()
        await waitForTWROutput(page, "Delete", 1000)
        await page.keyboard.press("ArrowDown")
        await page.keyboard.press("ArrowDown")
        await page.keyboard.press("Enter")
        await sleep(100)
        await page.keyboard.type("y")
        await page.keyboard.press("Enter")
        await page.evaluate(() => {
            terminal7.map.showLog(true)
        })
        await sleep(100)
        await page.keyboard.type("edit bar")
        await page.keyboard.press("Enter")
        await waitForTWROutput(page, "Delete", 1000)
        await page.keyboard.press("ArrowDown")
        await page.keyboard.press("ArrowDown")
        await page.keyboard.press("Enter")
        await sleep(100)
        await page.keyboard.type("y")
        await page.keyboard.press("Enter")
        await sleep(100)
        const numOfGates = await page.evaluate(async () => terminal7.gates.length)
        expect(numOfGates).toEqual(1)
        await page.keyboard.type("hide")
        await page.keyboard.press("Enter")
    })
    test('connect to gate with no webexec, get install command', async () => {
        await runSSHCommand(webexecSSHConfig, "webexec stop")
        await connectFirstGate(page)
        await sleep(1000)
        await expect(page.locator('#t0')).toBeVisible()
        await waitForTWROutput(page, 'Does the address', 1000)
        await page.keyboard.press('Enter')
        await waitForTWROutput(page, 'webexec', 1000)
        await page.keyboard.press('Enter')
        await waitForTWROutput(page, 'install', 1000)
        await sleep(200)
        await page.keyboard.press('Enter')
        await waitForTWROutput(page, 'Copy command', 3000)
        await page.keyboard.press('Enter')
        await page.keyboard.type("hide")
        await page.keyboard.press("Enter")
        /* TODO: find a way to access the clipboard
        const cb = await page.evaluate(async () => await navigator.clipboard.readText())

        expect(cb).toMatch(/^bash </)
        */
        // await expect(page.locator('.windows-container')).toBeHidden()
        await runSSHCommand(webexecSSHConfig, "bash -c 'WEBEXEC_SERVER_URL=http://webexec:7777 webexec start'")
        await sleep(3000)
    })
    test('connect to gate see help page and hide it', async () => {
        await connectFirstGate(page)
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
    test('a pane can be closed', async () => {
        await page.locator('.tabbar .reset').locator('visible=true').click()
        await expect(page.locator('#t0')).toBeVisible()
        await waitForTWROutput(page, 'Close', 1000)
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        // all gates should be hidden
        const containers = page.locator('.windows-container')
        const count = await containers.count()
        expect(count).toEqual(3)
        for (let i = 0; i < count; i++)
            await expect(containers.nth(i)).toBeHidden()

    })
    test('a pane can be reseted', async () => {
        await page.reload({waitUntil: "networkidle"})
        await page.evaluate(async () => {
            window.notifications = []
            while (!window.terminal7) {
                await new Promise(r => setTimeout(r, 100))
            }
            window.terminal7.notify = (m) => window.notifications.push(m)
        })
        await connectFirstGate(page, "foo")
        await sleep(500)
        await page.locator('.tabbar .reset').click()
        await expect(page.locator('#t0')).toBeVisible()
        await waitForTWROutput(page, 'Close', 1000)
        await sleep(100)
        await page.keyboard.press('Enter')
        await sleep(100)
        await expect(page.locator('#t0')).toBeHidden()
        await expect(page.locator('.pane')).toHaveCount(1)
        await expect(page.locator('.windows-container')).toBeVisible()
        await sleep(100)
        await page.screenshot({path: '/result/connection_reseted.png'})
        await waitForTWROutput(page, /foo:.* over WebRTC/, 2000)
    })
    test('how a gate handles disconnect', async() => {
        await page.evaluate(async () => 
            window.terminal7.conf.net.timeout = 1000)
        await runSSHCommand({
          host: 'webexec',
          port: 22,
          username: 'runner',
          password: 'webexec'
        }, "webexec stop")
        // TODO: sleep and verify TWR came up while the windows-container
        // remained visible
        await sleep(15000)
        await expect(page.locator('#t0')).toBeVisible()
        await waitForTWROutput(page, "Reconnect", 1000)
    })
})
