import { test, expect, Page, BrowserContext } from '@playwright/test'
import { authenticator } from 'otplib'
import waitPort from 'wait-port'
import * as redis from 'redis'
import { reloadPage } from '../common/utils'

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
    test.afterAll(async () => {
        // delete the user and peer from redis
        const redisClient = redis.createClient({url: 'redis://redis'})
        redisClient.on('error', err => console.log('Redis client error', err))
        await redisClient.connect()
        redisClient.del("u:123456")
        redisClient.del("id:foo@bar.com")
        const fp = await page.evaluate(() => window.terminal7.getFingerprint())
        redisClient.del(`peer:${fp}`)
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
        await reloadPage(page)
        // add terminal7 initializtion and globblas
        await waitPort({host:'webexec', port:7777})

        redisClient = redis.createClient({url: 'redis://redis'})
        redisClient.on('error', err => console.log('Redis client error', err))
        await redisClient.connect()
    })

    test('purchase update with no active subscription', async () => {
        await sleep(500)
        await page.evaluate(async () => {
            terminal7.pbConnect()
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
            terminal7.pb.connect("$ValidBearer")
        })
        await sleep(2500)
        let twr = await getTWRBuffer()
        expect(twr).toMatch(/Peer name/)
        await page.keyboard.type("test")
        await page.keyboard.press("Enter")
        await sleep(100)
        twr = await getTWRBuffer()
        expect(twr).toMatch(/email/)
        await page.keyboard.type("foo@bar.com")
        await page.keyboard.press("Enter")
        await sleep(1000)
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
        const token = authenticator.generate(secret)
        await sleep(200)
        await page.keyboard.type(token)
        await page.keyboard.press("Enter")
        await sleep(200)
        const twr = await getTWRBuffer()
        expect(twr).toMatch(/Validated/)
    })
    test('validate servers', async () => {
        // change the user id of foo@bar.com to 123456
        let fp: string
        let keys = []
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
            await redisClient.sAdd("user:123456", cfp)
            if (kind === "webexec")
                fp = cfp
        }
        const oId = await redisClient.get("id:foo@bar.com")
        await redisClient.hSet("u:123456", "email", "foo@bar.com")
        await redisClient.set("id:foo@bar.com", "123456")
        const secret = await redisClient.get(`secret:${oId}`)
        await redisClient.set("secret:123456", secret)
        const token = authenticator.generate(secret)
        await page.evaluate(async (fp) => {
            terminal7.pb.verifyFP(fp).then(() => 
                terminal7.map.shell.t.writeln("VVVerified"))
            .catch(() => terminal7.map.shell.t.writeln("Failed"))
        }, fp)
        await sleep(100)
        await page.keyboard.type(token)
        await page.keyboard.press("Enter")
        await sleep(500)
        const verified = await redisClient.hGet(`peer:${fp}`, "verified")
        expect(verified).toBe("1")
        const twr = await getTWRBuffer()
        // create a regexp to match "Validated <first 8 chars of fp>"
        expect(twr).toMatch(/VVVerified/)
    })
    test('peers are properly displayed', async () => {
        await sleep(500)
        await page.evaluate(async () => {
            terminal7.pbClose()
            await terminal7.pbConnect()
        })
        const btns = page.locator('#gates button')
        await expect(btns).toHaveCount(2)
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
        const btns = page.locator('#gates button')
        await expect(btns).toHaveCount(3)
        // count all elments with the from-peerbook class
        const fromPeerbook = await page.$$('.from-peerbook')
        expect(fromPeerbook.length).toBe(1)
    })
})
