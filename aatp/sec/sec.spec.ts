import { test, expect, Page, BrowserContext } from '@playwright/test'
import waitPort from 'wait-port'

import { connectFirstGate, waitForTWROutput, runSSHCommand,
    authorizeFingerprint, getTWRBuffer } from '../common/utils'


const local = process.env.LOCALDEV !== undefined,
      url = local?"http://localhost:3000":"http://terminal7"

test.describe('terminal7 UI', ()  => {

    const sleep = (ms) => { return new Promise(r => setTimeout(r, ms)) }
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
        // add terminal7 initializtion and globblas
        await waitPort({host:'webexec', port:7777})

    })
    test('an unknown client is rejected', async () => {
        await connectFirstGate(page)
        await page.screenshot({path: '/result/1.png'})
        await expect(page.locator('#t0')).toBeVisible()
        let twr = await getTWRBuffer(page)
        expect(twr).toMatch(/webexec client add/)
    })
    test('authorizing a client happens ASAP', async () => {
        await authorizeFingerprint(page)
        await connectFirstGate(page)
        await page.screenshot({path: '/result/2.png'})
        await expect(page.locator('#t0')).toBeHidden()
    })
})
