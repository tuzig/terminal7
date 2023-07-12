import { expect } from '@playwright/test'
let checkedC = 0
export async function reloadPage(page) {
    await page.reload({waitUntil: "commit"})
    await sleep(500)
    await page.evaluate(() => {
        window.terminal7.notify = (msg: string) => console.log("NOTIFY: "+msg)
        // window.terminal7.iceServers = []
    })
    await sleep(500)
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
