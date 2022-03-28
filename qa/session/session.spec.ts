import { test, expect, Page, BrowserContext } from '@playwright/test'
import waitPort from 'wait-port'
const redis = require('redis')


    const local = process.env.LOCALDEV !== undefined,
          url = local?"http://localhost:3000":"http://terminal7"

test.describe('terminal 7session', ()  => {

    const sleep = (ms) => { return new Promise(r => setTimeout(r, ms)) }
    const connectGate = async () => {
        const btns = page.locator('#peerbook-hosts .text-button')
        await expect(btns).toHaveCount(3)
        await btns.last().dispatchEvent('pointerdown')
        await sleep(50)
        await btns.last().dispatchEvent('pointerup')
    }

    let firstTime = true,
        page: Page,
        context: BrowserContext

    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext()
        page = await context.newPage()
        page.on('console', (msg) => console.log('console log:', msg.text()))
        page.on('pageerror', (err: Error) => console.log('on pageerror', err.message))
        await waitPort({host:'peerbook', port:17777})
        await waitPort({host:'terminal7', port:80})
        const response = await page.goto(url)
        await expect(response.ok(), `got error ${response.status()}`).toBeTruthy()
        await page.evaluate(async () => {
            window.terminal7.notify = console.log
            window.terminal7.conf.net.peerbook = "peerbook:17777"
            window.terminal7.conf.peerbook = { email: "joe@example.com", insecure: true }
            window.terminal7.pbVerify()
        })
        // add terminal7 initializtion and globblas
        await waitPort({host:'webexec', port:7777})
        const playButton = page.locator('.play-button')
        await expect(playButton).toBeVisible()
        await playButton.click()

        const redisClient = redis.createClient({url: 'redis://redis'})
        redisClient.on('error', err => console.log('Redis client error', err))
        await redisClient.connect()
        const keys = await redisClient.keys('peer*')
        keys.forEach(async key => {
            console.log("verifying: " +key)
            await redisClient.hSet(key, 'verified', "1")
        })
        await page.evaluate(async () =>
            await window.terminal7.pbVerify())
        await page.locator('.onmobile').click()
        await page.locator('#mobile-instructions .close').click()
        firstTime = false
    })

    test('connect to gate see help page and hide it', async () => {
        // await page.evaluate(async () =>
            // Object.values(window.terminal7.PBGates)[0].connect())
        connectGate()
        const help  = page.locator('#help-gate')
        await expect(help).toBeVisible()
        await help.click()
        await expect(help).toBeHidden()
        await page.screenshot({ path: `/result/zero.png` })
    })
    test('pane is visible and session is open', async () => {
        await expect(page.locator('.pane')).toHaveCount(1)
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
        await page.screenshot({ path: `/result/first.png` })
    })
    test('a gate retains the layout after reload', async() => {
        await page.reload({waitUntil: "networkidle"})
        await page.locator('.play-button').click()
        await page.evaluate(async () => {
            window.terminal7.notify = console.log
            window.terminal7.conf.net.peerbook = "peerbook:17777"
            window.terminal7.conf.peerbook = { email: "joe@example.com", insecure: true }
            await window.terminal7.pbVerify()
        })
        connectGate()
        await expect(page.locator('.pane')).toHaveCount(2)
    })
    test('a pane can be close', async() => {
        const exitState = await page.evaluate(() => {
            const gate = Object.values(window.terminal7.PBGates)[0],
                  pane = gate.activeW.activeP
            try {
                pane.d.send("exit\n")
                return "success"
            } catch(e) { return e.toString() }
        })
        expect(exitState).toEqual("success")
        await expect(page.locator('.pane')).toHaveCount(1)
    })

    test('disengage and reconnect', async() => {
        await page.evaluate(async() => {
            const sleep = (ms) => { return new Promise(r => setTimeout(r, ms)) }
            const gate = window.terminal7.activeG
            gate.activeW.activeP.d.send("seq 10; sleep 1; seq 10 100\n")
            sleep(300)
            await gate.disengage()
            console.log(window.terminal7.activeG, gate.name)
        })
        await page.screenshot({ path: `/result/second.png` })
        await sleep(1000)
        await page.evaluate(async() => {
            window.terminal7.activeG.connect()
        })
        // connectGate()
        await sleep(500)
        await expect(page.locator('.pane')).toHaveCount(1)
        await page.screenshot({ path: `/result/third.png` })
        const lines = await page.evaluate(() =>
           window.terminal7.activeG.activeW.activeP.t.buffer.active.length)
        expect(lines).toEqual(103)
    })
})
