const puppeteer = require('puppeteer'),
      chai = require('chai'),
      redis = require('redis'),
      waitPort = require('wait-port'),
      expect = chai.expect,
      local = process.env.LOCALDEV !== undefined,
      url = local?"http://localhost:3000":"http://terminal7"


describe('Terminal7', function() {
    var browser, page,redisClient
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
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
        page.on('console', (msg) => console.log('console log:', msg.text()))
        page.on('error', (msg) => console.log('on error', msg.text()))
        page.on('pageerror', (msg) => console.log('on pageerror', msg.text()))
        await waitPort({host:'terminal7', port:80})
        const response = await page.goto(url)
        expect(response.status()).to.equal(200)
        // add terminal7 initializtion and globblas
        await waitPort({host:'peerbook', port:17777})
        await waitPort({host:'webexec', port:7777})
    })
    beforeEach(async function() {
        await page.evaluate(async() => {
            window.sleep = (ms) => new Promise(r => setTimeout(r, ms))
            document.getElementById("greetings-modal").classList.add("hidden")
            window.terminal7.notify = console.log
            window.terminal7.conf.net.peerbook = "peerbook:17777"
            window.terminal7.conf.peerbook = { email: "joe@example.com", insecure: true }
            try {
                await window.terminal7.pbVerify()
            } catch(e) {
                console.log("pbVerify return error", e.toString())
            }
        })
        redisClient = redis.createClient({url: 'redis://redis'})
        redisClient.on('error', err => console.log('Redis client error', err))
        await redisClient.connect()
        for await (const key of redisClient.scanIterator({MATCH:'peer*'})) {
            console.log("verifying: " +key)
            redisClient.hSet(key, 'verified', "1")
            await sleep(10)
        }
    })

    after(async function() {
        await browser.close()
    })
    afterEach (async function() {
        console.log("exit all panes")
        await page.reload({waitUntil: "networkidle2"})
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
        const gates = await page.evaluate(async() => {
            await window.terminal7.pbVerify()
            var n = 0
            for (const [fp, gate] of Object.entries(window.terminal7.PBGates)) {
                console.log("connecting to: ", gate.fp)
                gate.connect()
                n += 1
            }
            return n
        })
        expect(gates).to.equal(1)
        await sleep(3000)
        console.log("verifying a pane is open")
        const panes = await page.evaluate(() => {
            return document.querySelectorAll(".pane").length
        })
        await page.screenshot({ path: `/result/WTF.png` })
        expect(panes).to.equal(1)
        console.log("verifying gate help is visible")
        const helpVisible = await page.evaluate(async () => {
            const help = document.getElementById("help-gate"),
                  style = window.getComputedStyle(help)
            return style.display !== 'none'
        })
        expect(helpVisible).to.be.true
        console.log("verifying a pane is visible")
        const paneVisible = await page.evaluate(() => {
            const help = document.getElementById("help-gate"),
                  pane = document.querySelector(".pane"),
                  style = window.getComputedStyle(pane)
            help.classList.toggle("show")
            return (style.display !== 'none')
        })
        expect(paneVisible).to.be.true
        console.log("verifying a pane's data channel is open")
        const paneState = await page.evaluate(() => {
            const pane = window.terminal7.activeG.activeW.activeP
            return pane.d.readyState
        })
        expect(paneState).to.equal("open")
        console.log("verifying a pane can be split")
        const pane2State = await page.evaluate(async() => {
            const pane = window.terminal7.activeG.activeW.activeP
            const pane2 = pane.split("topbottom")
            await window.sleep(100)
            if (pane2.d)
                return pane2.d.readyState
            else
                return "unopened"
        })
        expect(pane2State).to.equal("open")
        console.log("verifying a pane can be closed")
        const exitState = await page.evaluate(() => {
            const pane = window.terminal7.activeG.activeW.activeP
            try {
                pane.d.send("exit\n")
                return "success"
            } catch(e) { return e.toString() }
        })
        expect(exitState).to.equal("success")
        await sleep(2000)
        const panes3 = await page.evaluate(() => {
            return window.terminal7.activeG.panes().length
        })
        await sleep(2000)
        await page.screenshot({ path: `/result/aftersplitnclose.png` })
        expect(panes3).to.equal(1)
        console.log("test layout persistence")
        const pane3State = await page.evaluate(async() => {
            const pane = window.terminal7.activeG.activeW.activeP
            const pane2 = pane.split("topbottom")
            await window.sleep(100)
            if (pane2.d)
                return pane2.d.readyState
            else
                return "unopened"
        })
        expect(pane3State).to.equal("open")
        await page.screenshot({ path: `/result/b4reset.png` })
        await page.reload({waitUntil: "networkidle2"})
        const panes4 = await page.evaluate(async() => {
            // after reload, need to set all globals
            window.sleep = (ms) => new Promise(r => setTimeout(r, ms))
            document.getElementById("greetings-modal").classList.add("hidden")
            window.terminal7.notify = console.log
            window.terminal7.conf.net.peerbook = "peerbook:17777"
            window.terminal7.conf.peerbook = { email: "joe@example.com", insecure: true }
            await window.terminal7.pbVerify()
            await window.sleep(1000)
            var n = 0
            for (const [fp, gate] of Object.entries(window.terminal7.PBGates)) {
                console.log("connecting to: ", gate.fp)
                gate.connect()
                break
            }
            await window.sleep(3000)
            return document.querySelectorAll(".pane").length
        })
        expect(panes4).to.equal(2)
    })
    it('orderly disengages', async function() {
        const lines = await page.evaluate(async() => {
            await sleep(500)
            await window.terminal7.pbVerify()
            var n = 0
            const [fp, gate] = Object.entries(window.terminal7.PBGates)[0]
            console.log("connecting to: ", fp)
            gate.connect()
            document.getElementById("help-gate").classList.toggle("show")
            await sleep(2000)
            gate.activeW.activeP.d.send("seq 10; sleep 1; seq 10 100\n")
            await gate.disengage()
            await sleep(1100)
            console.log("connecting... again")
            gate.connect()
            await sleep(2000)
            return gate.activeW.activeP.t.buffer.active.length
        })
        await page.screenshot({ path: `/result/final.png` })
        expect(lines).to.be.at.least(100)
    })
})
