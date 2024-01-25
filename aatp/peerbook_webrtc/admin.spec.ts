import { test, expect, Page, BrowserContext } from '@playwright/test'
import { authenticator } from 'otplib'
import waitPort from 'wait-port'
import * as redis from 'redis'
import { reloadPage, getTWRBuffer } from '../common/utils'

const url = process.env.LOCALDEV?"http://localhost:3000":"http://terminal7"

const CONF = 
`[theme]
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
insecure = true`

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
        await page.evaluate(async CONF => {
            localStorage.setItem("CapacitorStorage.dotfile", CONF)
            localStorage.setItem("CapacitorStorage.gates", "[]")
        }, CONF)
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
        await page.keyboard.press("Enter")
        await redisClient.set("tempid:$ValidBearer", "1")
        await sleep(1500)
        await page.evaluate(async () => {
            terminal7.pb.close()
            try {
                await terminal7.pb.connect({token: "$ValidBearer"})
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
        let fp = ""
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
            if (kind === "webexec") {
                expect(fp).toEqual("")
                fp = cfp
            }
        }
        expect(fp).toBeTruthy()
        const oId = await redisClient.get("uid:foo@bar.com")
        await redisClient.set("uid:foo@bar.com", "123456")
        const secret = await redisClient.hGet(`user:${oId}`, "secret")
        await redisClient.hSet("user:123456", "secret", secret, "email", "foo@bar.com")
        await page.reload()
        await sleep(500)
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
        const btns = page.locator('[data-test="gate-name"]')
        await expect(btns).toHaveCount(2)
        // count all elments with the from-peerbook class
        const fromPeerbook = await page.$$('.from-peerbook')
        expect(fromPeerbook.length).toBe(1)
    })
    test('rename a peer', async () => {
        const btns = page.locator('[data-test="gateButton"]')
        const btn = btns.first()
        const editBtn = btn.locator('.gate-edit')
        await editBtn.click()
        await sleep(100)
        await page.keyboard.press("Enter")
        await sleep(100)
        await page.keyboard.type(" ")
        await page.keyboard.press("Enter")
        await sleep(100)
        await page.keyboard.type("bar")
        await page.keyboard.press("Enter")
        await sleep(100)
        const fp = await page.evaluate(() => terminal7.gates[1].fp)
        const gateName = await page.locator('[data-test="gate-name"]')
            .first().innerText()
        expect(gateName).toMatch(/^bar/)
        const name = await redisClient.hGet(`peer:${fp}`, "name")
        expect(name).toMatch(/^bar/)
    })
    test('delete a peer', async () => {
        const fp = await page.evaluate(() => terminal7.gates[1].fp)
        console.log("fp", fp)

        const btns = page.locator('[data-test="gateButton"]')
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
        const twr = await getTWRBuffer(page)
        expect(twr).toMatch(/OTP:/)
        const uid = await redisClient.get("uid:foo@bar.com")
        const secret = await redisClient.hGet(`user:${uid}`, "secret")
        const token = authenticator.generate(secret)
        await page.keyboard.type(token)
        await page.keyboard.press("Enter")
        await sleep(1000)

        console.log("peers:", await redisClient.keys("peer*"))
        expect(await redisClient.exists(`peer:${fp}`)).toBeFalsy()
        expect(page.locator('[data-test="gate-name"]')).toHaveCount(1)
        const fromPeerbook = await page.$$('.from-peerbook')
        expect(fromPeerbook.length).toBe(0)
    })
    test('try subscribe with an invalid email', async ({ browser }) => {
        // TODO: rename to context2
        context = await browser.newContext()
        page = await context.newPage()
        page.on('console', (msg) => console.log('console log:', msg.text()))
        page.on('pageerror', (err: Error) => console.trace('PAGEERROR', err))
        const response = await page.goto(url)
        await expect(response.ok(), `got error ${response.status()}`).toBeTruthy()
        await page.evaluate(async CONF => {
            localStorage.setItem("CapacitorStorage.dotfile", CONF)
        }, CONF)
        // first page session for just for storing the dotfiles
        await reloadPage(page)
        redisClient = redis.createClient({url: 'redis://redis'})
        redisClient.on('error', err => console.log('Redis client error', err))
        await redisClient.connect()
        await sleep(500)

        const fp = await page.evaluate(() => terminal7.getFingerprint())
        expect(await redisClient.exists(`peer:${fp}`)).toBeFalsy()
        await sleep(100)
        if (await page.locator('[data-test="twr-minimized"]').isVisible())
            await page.click('[data-test="twr-minimized"]')
        await page.keyboard.type('subscribe')
        await page.keyboard.press("Enter")
        await sleep(100)
        let twr = await getTWRBuffer(page)
        expect(twr).toMatch(/email/)
        await page.keyboard.type('invalid@example.com')
        await page.keyboard.press("Enter")
        await sleep(100)
        twr = await getTWRBuffer(page)
        expect(twr).toMatch(/OTP/)
        await page.keyboard.type('123456')
        await page.keyboard.press("Enter")
        await page.keyboard.type('testclient')
        await page.keyboard.press("Enter")
        await sleep(100)
        twr = await getTWRBuffer(page)
        expect(twr).toMatch(/Invalid credentials/)
    })
    test('try subscribe with an invalid OTP', async () => {
        await sleep(100)
        await page.keyboard.type('subscribe')
        await page.keyboard.press("Enter")
        await sleep(100)
        let twr = await getTWRBuffer(page)
        expect(twr).toMatch(/email/)
        await page.keyboard.type('foo@bar.com')
        await page.keyboard.press("Enter")
        await sleep(100)
        twr = await getTWRBuffer(page)
        expect(twr).toMatch(/OTP/)
        await page.keyboard.type('123456')
        await page.keyboard.press("Enter")
        await page.keyboard.type('testclient')
        await page.keyboard.press("Enter")
        await sleep(100)
        twr = await getTWRBuffer(page)
        expect(twr).toMatch(/Invalid credentials/)
    })
    test('subscribe with a valid email & OTP', async () => {
        await sleep(100)
        await page.keyboard.type('subscribe')
        await page.keyboard.press("Enter")
        await sleep(100)
        let twr = await getTWRBuffer(page)
        expect(twr).toMatch(/email/)
        await page.keyboard.type('foo@bar.com')
        await page.keyboard.press("Enter")
        await sleep(100)
        twr = await getTWRBuffer(page)
        expect(twr).toMatch(/OTP/)
        const uid = await redisClient.get("uid:foo@bar.com")
        const secret = await redisClient.hGet(`user:${uid}`, "secret")
        const token = authenticator.generate(secret)
        await page.keyboard.type(token)
        await page.keyboard.press("Enter")
        await page.keyboard.type('testclient')
        await page.keyboard.press("Enter")
        const fp = await page.evaluate(() => terminal7.getFingerprint())
        let peerUID = await redisClient.hGet(`peer:${fp}`, "user")
        while (!peerUID) {
            await sleep(100)
            peerUID = await redisClient.hGet(`peer:${fp}`, "user")
        }
        expect(peerUID).toBe(uid)
        twr = await getTWRBuffer(page)
        expect(twr).toMatch(/Email sent/)
    })
    test('check email, click url and ensure client is logged in', async ({ request, browser }) => {
        await sleep(200)
        const res = await request.get('http://smtp:8025/api/v2/messages')
        const msg = await res.json()
        console.log("msg", msg)
        expect(msg.count).toBe(1)
        const body = msg.items[0].Content.Body
        const url = body.match(/http:\/\/\S+/)[0]
        expect(url).toMatch(/^http:\/\/peerbook:17777\/verify/)
        await sleep(500)
        const fp = await page.evaluate(() => terminal7.getFingerprint())
        console.log("new client's fp", fp)
        expect(await redisClient.hGet(`peer:${fp}`, "user")).toBe("123456")
        const verifyPage = await (await browser.newContext()).newPage()
        await verifyPage.goto(url)
        await verifyPage.click('button[type="submit"]')
        // TODO: optimize this sleep. 5 second is the max time it takes for the
        // client to be logged in. We should have a retry loop instead.
        await sleep(2000)
        const twr = await getTWRBuffer(page)
        expect(twr).toMatch(/Logged in/)
    })
    test('test the support command', async ({request}) => {
        await sleep(100)
        await page.keyboard.type('support')
        await page.keyboard.press('Enter')
        await sleep(100)
        await page.keyboard.press('ArrowDown')
        await page.evaluate(() => { terminal7.log('log line')})
        await page.keyboard.press('Enter')
        await sleep(100)
        let twr = await getTWRBuffer(page)
        expect(twr).toMatch(/address:$/)
        await page.keyboard.type('test@gmail.com')
        await page.keyboard.press('Enter')
        twr = await getTWRBuffer(page)
        expect(twr).toMatch(/issue:$/)
        await page.keyboard.type('test issue')
        await page.keyboard.press('Enter')

        let count = 0
        let msg
        while (count < 2) {
            await sleep(100)
            const res = await request.get('http://smtp:8025/api/v2/messages')
            msg = await res.json()
            count = msg.count
        }
        expect(msg.count).toBe(2)
        const body = msg.items[0].Content.Body
        expect(body).toMatch(/test issue/)
        expect(body).toMatch(/log line/)
    })
})
