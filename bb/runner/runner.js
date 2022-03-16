const puppeteer = require('puppeteer'),
      chai = require('chai'),
      expect = chai.expect,
      local = process.env.LOCALDEV !== undefined,
      url = local?"http://localhost:3000":"http://terminal7"

var browser, page, server

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
    })

    beforeEach(async function() {
        page = await browser.newPage()
        page.on('console', (msg) => console.log('console log:', msg.text()));
        const response = await page.goto(url)
        expect(response.ok()).to.be.true
    })

    afterEach(async function() {
        await page.close()
    })

    after(async function() {
        await browser.close()
    })
    it('renders', async() => {
        const response = await page.goto(url)
        expect(response.ok()).to.be.true
        await page.screenshot({ path: `/result/home.png` })
    })
    /*
    it('can generate certificate', async function() {
        const gateCount = await page.evaluate(async() => {
            let cert = await window.terminal7.
    })
    */
    it('registers with peerbook', async function() {
        const gateCount = await page.evaluate(async() => {
            window.terminal7.conf.net.peerbook = "peerbook:17777"
            window.terminal7.conf.peerbook = { email: "joe@example.com", insecure: true }
            console.log("b4 verify")
            await window.terminal7.pbVerify()
            return window.terminal7.PBGates.length  // window.terminal7.PBGates.length
        })
        expect(gateCount).to.equal(2)
    })
})
