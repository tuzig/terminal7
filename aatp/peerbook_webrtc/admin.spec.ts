import { test, expect, Page, BrowserContext } from '@playwright/test'
import { authenticator } from 'otplib'
import waitPort from 'wait-port'
import * as redis from 'redis'

const url = process.env.LOCALDEV?"http://localhost:3000":"http://terminal7"

test.describe('peerbook administration', ()  => {

    const sleep = (ms) => { return new Promise(r => setTimeout(r, ms)) }
    let redisClient: redis.Redis,
        page: Page,
        context: BrowserContext,
        checkedC = 0

    async function getTWRBuffer() {
        const ret =  await page.evaluate(() => {
            const t = window.terminal7.map.t0
            const b = t.buffer.active
            let ret = ""
            for (let i = 0; i < b.length; i++) {
                const line = b.getLine(i).translateToString()
                ret += line
            }
            return ret.trimEnd()
        })
        console.log("TWR", ret)
        const lastC = checkedC
        checkedC = ret.length
        console.log("sustring", lastC, checkedC)
        return ret.substring(lastC)
    }
    test.afterAll(async () => await context.close() )
    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext()
        page = await context.newPage()
        page.on('console', (msg) => console.log('console log:', msg.text()))
        page.on('pageerror', (err: Error) => console.log('PAGEERROR', err.message))
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
ice_server = "stun:stun2.l.google.com:19302"
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
        await page.reload({waitUntil: "load"})
        // add terminal7 initializtion and globblas
        await waitPort({host:'webexec', port:7777})

        redisClient = redis.createClient({url: 'redis://redis'})
        redisClient.on('error', err => console.log('Redis client error', err))
        await redisClient.connect()
    })

    test('purchase update with no active subscription', async () => {
        await sleep(100)
        await page.evaluate(async () => {
            await window.terminal7.map.shell.onPurchasesUpdate({
                customerInfo: {
                    originalAppUserId: "ValidBearer",
                    entitlements: {active: []},
                },
                // purchases: {identifier: "com.terminal7.terminal7.terminal7", purchaseState: 0}
            })
        })
        const twr = await getTWRBuffer()
        await sleep(100)
        expect(twr).toMatch(/`subscribe`/)
    })
    test('purchase update with an active subscription and bad otp', async () => {
        await sleep(100)
        await redisClient.set("tempid:ValidBearer", "1")
        await page.evaluate(async () => {
            window.terminal7.map.shell.onPurchasesUpdate({
                customerInfo: {
                    originalAppUserId: "ValidBearer",
                    entitlements: {active: { peerbook: {expirationDate: "2021-01-01T00:00:00Z"}}},
                },
                // purchases: {identifier: "com.terminal7.terminal7.terminal7", purchaseState: 0}
            })
        })
        await sleep(1500)
        let twr = await getTWRBuffer()
        expect(twr).toMatch(/Peer name/)
        await page.keyboard.type("test")
        await page.keyboard.press("Enter")
        await sleep(100)
        twr = await getTWRBuffer()
        expect(twr).toMatch(/email/)
        await page.keyboard.type("foo@bar.com")
        await page.keyboard.press("Enter")
        await sleep(1200)
        twr = await getTWRBuffer()
        expect(twr).toMatch(/OTP:/)
        await page.keyboard.type("1234")
        await page.keyboard.press("Enter")
        await sleep(500)
        twr = await getTWRBuffer()
        expect(twr).toMatch(/Invalid OTP.*OTP:/)
    })
    test('complete purchase with a valid OTP', async () => {
        const uid = await redisClient.get("id:foo@bar.com")
        const secret = await redisClient.get(`secret:${uid}`)
        const token = authenticator.generate(secret);
        await page.keyboard.type(token)
        await page.keyboard.press("Enter")
        await sleep(100)
        const twr = await getTWRBuffer()
        expect(twr).toMatch(/Validated/)
    })
    /*
    test('validate otp', async () => {
        const uid = await redisClient.get("id:foo@bar.com")
        const secret = await redisClient.get(`secret:${uid}`)
        const token = authenticator.generate(secret);
        await page.evaluate(async (token) => {
            terminal7.map.shell.validateOTP(token)
        }, token)
        await(sleep(100))

        await page.keyboard.type(token)
        await page.keyboard.press("Enter")
        await sleep(1500)
        const twr = await getTWRBuffer()
        expect(twr).toMatch(/Validated/)
    })
    */
    test('validate webexec', async () => {
        const uid = await redisClient.get("id:foo@bar.com")
        const secret = await redisClient.get(`secret:${uid}`)
        const token = authenticator.generate(secret);
        const keys = await redisClient.keys('peer*')
        let fp: string
        for (const key of keys) {
            const peer = await redisClient.hGetAll(key)
            if (peer.kind === "webexec") {
                fp = peer.fp
                break
            }
        }
        await page.evaluate(async (fp) => {
            terminal7.map.shell.verifyFP(fp)
        }, fp)
        await sleep(100)
        await page.keyboard.type(token)
        await page.keyboard.press("Enter")
        await sleep(500)
        const twr = await getTWRBuffer()
        expect(twr).toMatch(/Validated/)
        // verify the fp is verified
        let verified = await redisClient.hGet(`peer:${fp}`, "verified")
        expect(verified).toBe("1")
        verified = await page.evaluate(async (fp) => {
            return terminal7.map.shell.peers[fp].verified
        }, fp)
        expect(verified).toBe(true)
    })
})
