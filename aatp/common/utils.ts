import { Client } from 'ssh2'
let checkedC = 0
export async function reloadPage(page) {
    console.log("-- Reloading Page --")
    await page.reload({ waitUntil: "commit" })
    await page.evaluate(() => {
        window.terminal7.notify = (msg: string) => console.log("NOTIFY: " + msg)
        // window.terminal7.iceServers = []
    })
    await sleep(1000)
    checkedC = 0
}
export function sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms))
}
export async function connectFirstGate(page, gateName?) {
    let btn
    const btns = page.locator('[data-test="gateButton"]')
    if (!gateName)
        btn = btns.first()
    else
        btn = btns.filter({ hasText: gateName }).first()
    await btn.dispatchEvent('pointerdown')
    await sleep(50)
    await btn.dispatchEvent('pointerup')
    // await expect(page.locator('.pane')).toBeVisible()
}
export async function getTWRBuffer(page) {
    console.log("getting twr buffer")
    let ret = await page.evaluate(() => {
        const t = window.terminal7.map.t0
        const b = t.buffer.active
        let ret = ""
        for (let i = 0; i < b.length; i++) {
            const line = b.getLine(i).translateToString()
            ret += line
        }
        return ret.trimEnd()
    })
    console.log("--> b4 trimming:", ret)
    ret = ret.substring(checkedC)
    checkedC = ret.length
    console.log("TWR", ret)
    return ret
}
export function webexecReset(uid: string) {
    return new Promise((resolve, reject) => {
        const conn = new Client()
        conn.on('ready', () => {
            console.log('Client :: ready')
            conn.shell((err, stream) => {
                if (err) {
                    console.log("Error on SSH connect", err)
                    reject(err)
                    return
                }
                stream.on('close', () => {
                    console.log('Stream :: close')
                    conn.end()
                    resolve()
                }).on('data', (data) => {
                    console.log('OUTPUT: ' + data)
                })
                stream.end(`webexec stop
rm -rf "$HOME/.config/webexec"
PEERBOOK_UID=${uid} PEERBOOK_HOST=peerbook:17777 PEERBOOK_NAME=webexec webexec init
echo "insecure = true\n" >> "$HOME/.config/webexec/webexec.conf"
webexec start
exit\n`)
            })
        }).connect({
            host: 'webexec',
            port: 22,
            username: 'runner',
            password: 'webexec'
        })
    })
}
// getLines returns an array of lines from the active pane
// it accepts two optional arguments, start and end, which are
// the line numbers to start and end at. If start is not provided,
// it defulat to -1 (the line before the cursor). If end is not
// provided, it defaults to -1 (the line before the cursor).
export async function getLines(page, start = -1, end = -1): Array<string> {
    return await page.evaluate(({ start, end }) => {
        const buffer = window.terminal7.activeG.activeW.activeP.t.buffer.active
        const ret: Array<string> = []
        const b = buffer.cursorY + buffer.viewportY
        for (let i = b + start; i <= b + end; i++) {
            const line = buffer.getLine(i).translateToString()
            ret.push(line)
        }
        return ret
    }, { start, end })
}
