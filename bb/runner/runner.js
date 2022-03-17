const puppeteer = require('puppeteer'),
      chai = require('chai'),
      redis = require('redis'),
      expect = chai.expect,
      local = process.env.LOCALDEV !== undefined,
      url = local?"http://localhost:3000":"http://terminal7"

var browser, page, server
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

describe('Terminal7', function() {
    if (local)
        this.timeout(100000)
    before(async function() {
        browser = await puppeteer.launch({
            headless: !local,
            devtools: local,
            slowMo: local?500:0,
            timeout: 10000,
            args: [
                // Required for Docker version of Puppeteer
                '--no-sandbox',
                '--disable-setuid-sandbox',
                // This will write shared memory files into /tmp instead of /dev/shm,
                // because Docker’s default for /dev/shm is 64MB
                '--disable-dev-shm-usage'
            ]
        })
        console.log(`Launched browser`)
        const browserVersion = await browser.version()
        console.log(`Started ${browserVersion}`)
        page = await browser.newPage()
        page.on('console', (msg) => console.log('console log:', msg.text()));
        page.on('error', (msg) => console.log('page error', msg.text()));
        const response = await page.goto(url)
        expect(response.status()).to.equal(200)
    })

    after(async function() {
        await browser.close()
    })
    it('renders', async() => {
        await page.screenshot({ path: `/result/home.png` })
    })
    /*
    it('can generate certificate', async function() {
        const gateCount = await page.evaluate(async() => {
            let cert = await window.terminal7.
    })
    */
    it('registers with peerbook', async function() {
        await page.evaluate(async() => {
            window.terminal7.notify = console.log
            window.terminal7.conf.net.peerbook = "peerbook:17777"
            window.terminal7.conf.peerbook = { email: "joe@example.com", insecure: true }
            console.log("b4 verify")
            try {
                await window.terminal7.pbVerify()
            } catch(e) {
                console.log("pbVerify return error", e.toString())
            }
        })
        const rc = redis.createClient({url: 'redis://redis'})
        rc.on('error', err => console.log('Redis client error', err))
        await rc.connect()
        for await (const key of rc.scanIterator({MATCH:'peer*'})) {
            console.log("verifying: " +key)
            await rc.hSet(key, 'verified', "1")
        }
        const ng = await page.evaluate(async() => {
            await window.terminal7.pbVerify()
            var n = 0
            for (const [fp, gate] of Object.entries(window.terminal7.PBGates)) {
                console.log("connecting to: ", gate.fp)
                gate.connect()
                n += 1
            }
            return n
        })
        expect(ng).to.equal(1)
    })
})
