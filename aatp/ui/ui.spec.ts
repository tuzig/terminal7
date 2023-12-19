import { test, expect, Page, BrowserContext } from '@playwright/test'
import { Client } from 'ssh2'
import * as fs from 'fs'
import waitPort from 'wait-port'

import { connectFirstGate } from '../common/utils'


const local = process.env.LOCALDEV !== undefined,
      url = local?"http://localhost:3000":"http://terminal7"

test.describe('terminal7 UI', ()  => {

    const sleep = (ms) => { return new Promise(r => setTimeout(r, ms)) }
    let page: Page,
        context: BrowserContext

    async function getTWRBuffer() {
        return await page.evaluate(() => {
            const t = window.terminal7.map.t0
            const b = t.buffer.active
            let ret = ""
            for (let i = 0; i < b.length; i++) {
                const line = b.getLine(i).translateToString()
                ret += line
            }
            return ret
        })
    }
    test.afterAll(async () => await context.close())
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
        const btns = page.locator('[data-test="gateButton"]')
        const btn = btns.first()
        const editBtn = btn.locator('.gate-edit')
        await editBtn.click()
        await sleep(100)
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
        let port = await page.evaluate(() => terminal7.gates[0].sshPort)
        expect(port).toEqual(1234)
        await page.reload({ waitUntil: "networkidle" })
        port = await page.evaluate(async () => {
            while (!window.terminal7 || !window.terminal7.gates || window.terminal7.gates.length === 0)
                await new Promise(r => setTimeout(r, 100))
            return terminal7.gates[0].sshPort
        })
        expect(port).toEqual(1234)
    })

    test('a host with no port can added', async () => {
        const addBtn = page.locator('[data-test="addButton"]').first()
        await addBtn.click()
        await sleep(100)
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
        await sleep(100)
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
    })

    test('gates can be deleteted', async () => {
        const btns = page.locator('[data-test="gateButton"]').filter({ hasText: "baz" })
        const btn = btns.first()
        const editBtn = btn.locator('.gate-edit')
        await editBtn.click()
        await sleep(100)
        await page.keyboard.press("ArrowDown")
        await page.keyboard.press("ArrowDown")
        await page.keyboard.press("Enter")
        await sleep(100)
        await page.keyboard.type("y")
        await page.keyboard.press("Enter")
        await sleep(100)
        await page.keyboard.type("edit bar")
        await page.keyboard.press("Enter")
        await sleep(100)
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
        await sleep(100)
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await expect(page.locator('.windows-container')).toBeHidden()
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
        await sleep(100)
        await page.keyboard.press('Enter')
        await sleep(100)
        await expect(page.locator('#t0')).toBeHidden()
        await expect(page.locator('.pane')).toHaveCount(1)
        await expect(page.locator('.windows-container')).toBeVisible()
        /* TODO: Fix getTWRBuffer
        await sleep(6000)
        expect(await getTWRBuffer()).toMatch(/foo.*: Connected\s+$/)
        */
    })
    test('how a gate handles disconnect', async() => {
        let sshC, stream
        await page.evaluate(() => window.terminal7.notify = (msg: string) => console.log("NOTIFY: "+msg))
        try {
            sshC = await new Promise((resolve, reject) => {
                const conn = new Client()
                conn.on('error', e => reject(e))
                conn.on('ready', () => resolve(conn))
                conn.connect({
                  host: 'webexec',
                  port: 22,
                  username: 'runner',
                  password: 'webexec'
                })
            })
        } catch(e) { expect(e).toBeNull() }
        // log key SSH events
        sshC.on('error', e => console.log("ssh error", e))
        sshC.on('close', e => {
            console.log("ssh closed", e)
        })
        sshC.on('end', e => console.log("ssh ended", e))
        sshC.on('keyboard-interactive', e => console.log("ssh interaction", e))
        // shorten the net timeout for a shorter run time
        await page.evaluate(async () => window.terminal7.conf.net.timeout = 1000)
        try {
            stream = await new Promise((resolve, reject) => {
                sshC.exec("webexec stop", { }, async (err, s) => {
                    if (err)
                        reject(err)
                    else
                        resolve(s)
                })
            })
        } catch(e) { expect(e).toBeNull() }
        try {
            await new Promise<void>((resolve, reject) => {
                stream.on('close', (code, signal) => {
                    console.log(`closed with ${signal}`)
                    sshC.end()
                    reject()
                }).on('data', async (data) => {
                    const b = new Buffer.from(data)
                    const s = b.toString()
                    expect(s).toMatch("SIGINT")
                    resolve()
                })
            })
        } catch(e) { expect(e).toBeNull() }
        // TODO: sleep and verify TWR came up while the windows-container
        // remained visible
        await sleep(15000)
        await expect(page.locator('#t0')).toBeVisible()
        const twr = await getTWRBuffer()
        expect(twr).toMatch(/Reconnect\s+Close\s*$/)
    })
})
