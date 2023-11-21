import { test, expect, Page, BrowserContext } from '@playwright/test'
import waitPort from 'wait-port'
import * as redis from 'redis'

import { reloadPage, connectFirstGate, sleep, webexecReset } from '../common/utils'

const url = process.env.LOCALDEV?"http://localhost:3000":"http://terminal7"

test.describe('terminal7 session', ()  => {

    let page: Page
    let context: BrowserContext

    test.afterAll(async () => {
        // delete the user and peer from redis
        const redisClient = redis.createClient({url: 'redis://redis'})
        redisClient.on('error', err => console.log('Redis client error', err))
        await redisClient.connect()
        await redisClient.flushAll()
        await redisClient.quit()
        await context.close()
    })
    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext()
        page = await context.newPage()
        page.on('console', (msg) => console.log('console log:', msg.text()))
        page.on('pageerror', (err: Error) => console.log('PAGEERROR', err.message))
        await waitPort({host:'terminal7', port:80})
        const response = await page.goto(url)
        await expect(response.ok(), `got error ${response.status()}`).toBeTruthy()
        await context.addInitScript(async () => {
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
timeout = 8000
retries = 3
peerbook = "peerbook:17777"
[ui]
quickest_press = 1000
max_tabs = 10
cut_min_distance = 80
cut_min_speed = 2.5
pinch_max_y_velocity = 0.1
[peerbook]
user_id = "123456"
name = "client"
insecure = true
`)
        })
        await reloadPage(page)
        await page.evaluate(() => localStorage.removeItem("CapacitorStorage.first_gate"))
        await page.evaluate(() => localStorage.setItem("CapacitorStorage.gates", "[]"))
        // first page session for just for storing the dotfiles
        await waitPort({host:'peerbook', port:17777})
        await waitPort({host:'webexec', port:7777})
        await waitPort({host:'revenuecat', port:1080})
        const redisClient = redis.createClient({url: 'redis://redis'})
        redisClient.on('error', err => console.log('Redis client error', err))
        await redisClient.connect()
        await redisClient.flushAll()
        redisClient.hSet("u:123456", "email", "joe@example.com")
        redisClient.set("id:joe@example.com", "123456")
        const fp = await page.evaluate(async () => terminal7.getFingerprint())
        console.log("adding peer to redis", fp)
        redisClient.hSet(`peer:${fp}`, {
            verified: "1",
            name: "foo",
            kind: "terminal7",
            fp: fp,
            user: "123456",
        })
        await webexecReset("123456")
        console.log("waiting for peerbook to update")
        sleep(2000)
        const keys = await redisClient.keys('peer*')
        console.log("keys", keys)
        keys.forEach(async key => {
            // key is in the template of `peer:${fp}`
            console.log("verifying: " +key)
            await redisClient.hSet(key, 'verified', "1")
            await redisClient.hSet(key, 'user', "123456")
            const fp = key.split(':')[1]
            redisClient.sAdd("user:123456", fp)
        })
        await reloadPage(page)
    })

    test('connect to gate see help page and hide it', async () => {
        await sleep(1000)
        await page.evaluate(async() => {
            window.terminal7.map.showLog(true)
        })
        // await sleep(1000)
        await page.screenshot({ path: `/result/second.png` })
        connectFirstGate(page)
        const help  = page.locator('#help-gate')
        await page.screenshot({ path: '/result/3.png' })
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
            pane.split("topbottom")
        })
        await expect(page.locator('.pane')).toHaveCount(2)
        // wait for resize to finish
        await sleep(500)
    })
    test('a gate restores after reload', async() => {
        await reloadPage(page)
        await sleep(500)
        connectFirstGate(page)
        await sleep(500)
        await page.screenshot({ path: `/result/second.png` })
        await expect(page.locator('.pane')).toHaveCount(2)
        await expect(page.locator('.windows-container')).toBeVisible()
    })
    test('a pane can be closed', async() => {
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
        await page.evaluate(async() => 
            await window.terminal7.activeG.activeW.activeP.d.send(
                "seq 10; sleep 1; seq 10 20\n"))
        await page.screenshot({ path: `/result/first.png` })
        const y1 = await page.evaluate(async() => {
            const ret = window.terminal7.activeG.activeW.activeP.t.buffer.active.cursorY
            window.terminal7.onAppStateChange({isActive: false})
            return ret
        })
        await page.screenshot({ path: `/result/second.png` })
        await context.setOffline(true)
        await sleep(1000)
        await context.setOffline(false)
        await page.screenshot({ path: `/result/third.png` })
        await page.evaluate(async() =>
            window.terminal7.onAppStateChange({isActive: true}))
        await expect(page.locator('.pane')).toHaveCount(1)
        await sleep(1500)
        const y2 = await page.evaluate(() =>
           window.terminal7.activeG.activeW.activeP.t.buffer.active.cursorY)
        await page.screenshot({ path: `/result/fourth.png` })
        console.log(y1, y2)
        expect(y2-y1).toEqual(11)
    })
    test('after disengage & reconnect, a a pane can be closed', async() => {
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
    test('reconnect after 7 seconds of offline', async() => {
        await sleep(500)
        connectFirstGate(page)
        const pane = page.locator('.pane')
        await expect(pane).toBeVisible()
        await page.evaluate(async() => 
            await window.terminal7.activeG.activeW.activeP.d.send(
                "seq 10; sleep 1; seq 10 20\n"))
        await page.evaluate(async() =>
            window.terminal7.onAppStateChange({isActive: false}))
        context.setOffline(false)
        await sleep(7000)
        context.setOffline(true)
        await page.evaluate(async() =>
            window.terminal7.onAppStateChange({isActive: true}))
        await expect(page.locator('.pane')).toHaveCount(1)
        await sleep(500)
        const y = await page.evaluate(() =>
           window.terminal7.activeG.activeW.activeP.t.buffer.active.cursorY)
        expect(y).toBeGreaterThan(10)
        await page.screenshot({ path: `/result/eee.png` })
    })
    test.skip('auto restore gate', async() => {
        await connectFirstGate(page)
        await expect(page.locator('.pane')).toHaveCount(1)
        await page.screenshot({ path: `/result/6.png` })
        // set auto restore to true
        await page.evaluate(async () => {
            const value = localStorage.getItem("CapacitorStorage.dotfile")
            const lines = value.split("\n").map((l: string) => {
                if (l == "[peerbook]")
                    return "auto_restore = true\n" + l
                else 
                    return l
            })
            await localStorage.setItem("CapacitorStorage.dotfile", lines.join("\n"))
        })
        await reloadPage(page)
        await page.screenshot({ path: `/result/7.png` })
        const inGate = await page.evaluate(() => window.terminal7.activeG != null)
        expect(inGate).toBeTruthy()
        await expect(page.locator('.pane')).toHaveCount(1)
    })
})
