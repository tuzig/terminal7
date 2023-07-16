import { Client } from 'ssh2'
let checkedC = 0
export async function reloadPage(page) {
    console.log("-- Reloading Page --")
    await page.reload({waitUntil: "commit"})
    await page.evaluate(() => {
        window.terminal7.notify = (msg: string) => console.log("NOTIFY: "+msg)
        // window.terminal7.iceServers = []
    })
    await sleep(1000)
}
export function sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms)) 
}
export async function connectFirstGate (page) {
    const btns = page.locator('#gates button')
    await btns.first().dispatchEvent('pointerdown')
    await sleep(50)
    await btns.first().dispatchEvent('pointerup')
    // await expect(page.locator('.pane')).toBeVisible()
}
export async function getTWRBuffer(page) {
    console.log("getting twr buffer")
    let ret =  await page.evaluate(() => {
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

