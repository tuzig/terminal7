import { test, expect, Page, BrowserContext } from '@playwright/test'
import { authenticator } from 'otplib'
import waitPort from 'wait-port'
import * as redis from 'redis'
import { reloadPage, getTWRBuffer } from '../common/utils'

const url = process.env.LOCALDEV?"http://localhost:3000":"http://terminal7"

test.describe('peerbook administration', ()  => {

    const sleep = (ms) => { return new Promise(r => setTimeout(r, ms)) }
    let redisClient: redis.Redis,
        page: Page,
        context: BrowserContext

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
        page.on('pageerror', (err: Error) => console.trace('PAGEERROR', err))
        await waitPort({host:'peerbook', port:17777})
        await waitPort({host:'terminal7', port:80})
        const response = await page.goto(url)
        await expect(response.ok(), `got error ${response.status()}`).toBeTruthy()
        await page.evaluate(async () => {
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
peerbook = "peerbook:17777"
[ui]
quickest_press = 1000
max_tabs = 10
cut_min_distance = 80
cut_min_speed = 2.5
pinch_max_y_velocity = 0.1
[peerbook]
insecure = true`)
        })
        // first page session for just for storing the dotfiles
        await reloadPage(page)
        // add terminal7 initializtion and globblas
        await waitPort({host:'webexec', port:7777})
        await waitPort({host:'revenuecat', port:1080})

        redisClient = redis.createClient({url: 'redis://redis'})
        redisClient.on('error', err => console.log('Redis client error', err))
        await redisClient.connect()
    })

    test('purchase update with no active subscription', async () => {
        await sleep(500)
        await page.evaluate(async () => {
            try {
                await terminal7.pbConnect()
            } catch (e) {
                console.log("pbConnect failed", e)
            }
        })
        const pbOpen = await page.evaluate(() => window.terminal7.pb.isOpen())
        expect(pbOpen).toBeFalsy()
    })
    test('purchase update with an active subscription and bad otp', async () => {
        await sleep(500)
        await redisClient.set("tempid:$ValidBearer", "1")
        await sleep(1500)
        await page.evaluate(async () => {
            terminal7.pb.close()
            try {
                await terminal7.pb.connect("$ValidBearer")
            } catch (e) {
                console.log("pb.connect failed", e)
                if (e == "Unregistered")
                    terminal7.pb.register()
            }
        })
        await sleep(2500)
        let twr = await getTWRBuffer(page)
        expect(twr).toMatch(/Peer name/)
        await page.keyboard.type("test")
        await page.keyboard.press("Enter")
        await sleep(100)
        twr = await getTWRBuffer(page)
        expect(twr).toMatch(/email/)
        await page.keyboard.type("foo@bar.com")
        await page.keyboard.press("Enter")
        await sleep(1000)
        twr = await getTWRBuffer(page)
        expect(twr).toMatch(/OTP:/)
        await page.keyboard.type("1234")
        await page.keyboard.press("Enter")
        await sleep(500)
        twr = await getTWRBuffer(page)
        expect(twr).toMatch(/Invalid OTP.*OTP:/)
    })
    test('complete purchase with a valid OTP', async () => {
        const uid = await redisClient.get("uid:foo@bar.com")
        const secret = await redisClient.hGet(`user:${uid}`, "secret")
        const token = authenticator.generate(secret)
        await sleep(200)
        await page.keyboard.type(token)
        await page.keyboard.press("Enter")
        await sleep(200)
        const twr = await getTWRBuffer(page)
        expect(twr).toMatch(/Validated/)
    })
    test('validate servers', async () => {
        // change the user id of foo@bar.com to 123456
        let fp: string
        let keys = []
        reloadPage(page)
        while (keys.length < 2) {
            await sleep(200)
            keys = await redisClient.keys('peer*')
        }
        expect(keys.length).toBeGreaterThan(1)
        for (const key of keys) {
            const cfp = await redisClient.hGet(key, "fp")
            if (!cfp) continue
            const kind  = await redisClient.hGet(key, "kind")
            console.log("fp", cfp, "kind", kind)
            await redisClient.hSet(key, "user", "123456")
            await redisClient.sAdd("userset:123456", cfp)
            if (kind === "webexec")
                fp = cfp
        }
        const oId = await redisClient.get("uid:foo@bar.com")
        console.log("abcd1")
        await redisClient.set("uid:foo@bar.com", "123456")
        console.log("abcd2")
        const secret = await redisClient.hGet(`user:${oId}`, "secret")
        console.log("abcd3")
        await redisClient.hSet("user:123456", "secret", secret, "email", "foo@bar.com")
        console.log("abcd4")
        const token = authenticator.generate(secret)
        console.log("abcd5")
        await sleep(500)
        await page.evaluate(async (fp) => {
            terminal7.pb.verifyFP(fp)
        }, fp)
        await sleep(100)
        await page.keyboard.type(token)
        await page.keyboard.press("Enter")
        await sleep(500)
        const verified = await redisClient.hGet(`peer:${fp}`, "verified")
        console.log("verified", verified)
        expect(verified).toBe("1")
    })
    test('peers are properly displayed', async () => {
        await sleep(500)
        const btns = page.locator('[data-test="gateButton"]')
        await expect(btns).toHaveCount(1)
        const isOpen = await page.evaluate(() => window.terminal7.pb.isOpen())
        await expect(isOpen).toBeTruthy()
        const btn = btns.first()
        await expect(btn).toHaveClass(/text-button/)
        await expect(btn).not.toHaveClass(/unverified/)
    })

    test('local and peerbook gates are properly displayed', async () => {
        // add a gate to storage
        const keys = await redisClient.keys('peer*')
        keys.forEach(async key => {
            console.log("verifying: " +key)
            await redisClient.hSet(key, 'verified', "1")
        })
        await page.evaluate(() => {
            localStorage.setItem("CapacitorStorage.gates", JSON.stringify(
                [{"id":0,
                  "addr":"webexec",
                  "name":"foo",
                }]
            ))
        })
        await reloadPage(page)
        const btns = page.locator('[data-test="connectGate"]')
        await expect(btns).toHaveCount(2)
        // count all elments with the from-peerbook class
        const fromPeerbook = await page.$$('.from-peerbook')
        expect(fromPeerbook.length).toBe(1)
    })
})
