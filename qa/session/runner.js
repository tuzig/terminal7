const puppeteer = require('puppeteer'),
      chai = require('chai'),
      redis = require('redis'),
      waitPort = require('wait-port'),
      expect = chai.expect,
      local = process.env.LOCALDEV !== undefined,
      url = local?"http://localhost:3000":"http://terminal7"


describe('session', function() {
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
        await page.evaluate(async() => {
            window.sleep = ms => new Promise(r => setTimeout(r, ms))
            window.forTrue = f => new Promise(resolve => {
                const testnwait = () => {
                    if (f())
                        resolve()
                    else
                        setTimeout(testnwait, 50)
                }
                testnwait()
            })
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
        const keys = await redisClient.keys('peer*')
        keys.forEach(async key => {
            console.log("verifying: " +key)
            await redisClient.hSet(key, 'verified', "1")
        })
    })

    after(async function() {
        await browser.close()
    })
    it('registers with peerbook, connects, disengages & reconnect', async function() {
        console.log(">>> suite starts")
        await page.evaluate(async() => {
            await window.terminal7.pbVerify()
            var n = 0
            const gate = Object.values(window.terminal7.PBGates)[0]
            gate.connect()
            await forTrue(() => gate.session && gate.session.pc && gate.session.pc.connectionState == "connected")
        })
        console.log(">>> gate connected")
        const panes = await page.evaluate(() => {
            return document.querySelectorAll(".pane").length
        })
        expect(panes).to.equal(1)
        console.log(">>> with a single pane")
        const helpVisible = await page.evaluate(async () => {
            const help = document.getElementById("help-gate"),
                  style = window.getComputedStyle(help)
            return style.display !== 'none'
        })
        expect(helpVisible).to.be.true
        console.log(">>> verifying a pane is visible")
        const paneVisible = await page.evaluate(() => {
            const help = document.getElementById("help-gate"),
                  pane = document.querySelector(".pane"),
                  style = window.getComputedStyle(pane)
            help.classList.toggle("show")
            return (style.display !== 'none')
        })
        expect(paneVisible).to.be.true
        console.log(">>> verifying a pane's data channel is open")
        const paneState = await page.evaluate(() => {
            const pane = window.terminal7.activeG.activeW.activeP
            return pane.d.readyState
        })
        expect(paneState).to.equal("open")
        console.log(">>> verifying a pane can be split")
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
        console.log(">>> verifying a pane can be closed")
        const exitState = await page.evaluate(() => {
            const pane = window.terminal7.activeG.activeW.activeP
            try {
                pane.d.send("exit\n")
                return "success"
            } catch(e) { return e.toString() }
        })
        expect(exitState).to.equal("success")
        await page.evaluate(async() => {
            await forTrue(() =>  window.terminal7.activeG.panes().length == 1)
        })
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
        await page.evaluate(async() => {
            // after reload, need to set all globals
            window.sleep = (ms) => new Promise(r => setTimeout(r, ms))
            window.forTrue = f => new Promise(resolve => {
                const testnwait = () => {
                    if (f())
                        resolve()
                    else
                        setTimeout(testnwait, 50)
                }
                testnwait()
            })
            document.getElementById("greetings-modal").classList.add("hidden")
            window.terminal7.notify = console.log
            window.terminal7.conf.net.peerbook = "peerbook:17777"
            window.terminal7.conf.peerbook = { email: "joe@example.com", insecure: true }
        })
        console.log(">>> after browser reload")
        const gates2 = await page.evaluate(async() => {
            await window.terminal7.pbVerify()
            return Object.entries(window.terminal7.PBGates).length
        })
        expect(gates2).to.equal(1)
        console.log(">>> reconnecting")
        const panes4 = await page.evaluate(async() => {
            const [fp, gate] = Object.entries(window.terminal7.PBGates)[0]
            gate.connect()
            await forTrue(() => gate.session && gate.session.pc && gate.session.pc.connectionState == "connected")
            return document.querySelectorAll(".pane").length
        })
        expect(panes4).to.equal(1)
        console.log(">>> reconnected")
        await page.screenshot({ path: `/result/WTF.png` })
        const lines = await page.evaluate(async() => {
            const gate = Object.values(window.terminal7.PBGates)[0]
            await forTrue(() => gate.activeW && gate.activeW.activeP)
            gate.activeW.activeP.d.send("seq 10; sleep 1; seq 10 100\n")
            console.log(">>> disengage")
            await gate.disengage().then(() => window.terminal7.goHome())
            console.log(">>> connecting... again")
            await sleep(1100)
            gate.connect()
            console.log("3 forTrue")
            await forTrue(() => gate.activeW != null)
            return gate.activeW.activeP.t.buffer.active.length
        })
        await page.screenshot({ path: `/result/final.png` })
        expect(lines).to.be.at.least(100)
    })
})
