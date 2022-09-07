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

    async function getTWRBuffer() {
        return await page.evaluate(() => {
            const t = window.terminal7.map.t0
            const b = t.buffer.active
            let ret = ""
            for (let i = 0; i < b.length; i++) {
                const str = b.getLine(i).translateToString()
                console.log("adding:", str)
                ret = ret + str
            }
            return ret

        })
    }
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
            localStorage.setItem("CapacitorStorage.dotfile","")
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
        connectGate()
        await sleep(500)
        await page.screenshot({ path: `/result/2.png` })
        await page.locator('.tabbar .reset').click()
        await page.keyboard.press('Enter');
        await expect(page.locator('.pane')).toHaveCount(1)
        // TODO: fix getTWRBuffer
        // expect(getTWRBuffer()).toMatch(/foo.*: Connected/)
    })
})
