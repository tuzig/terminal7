export async function reloadPage(page) {
    await page.reload({waitUntil: "commit"})
    await sleep(500)
    await page.evaluate(() => {
        window.terminal7.notify = (msg: string) => console.log("NOTIFY: "+msg)
        window.terminal7.pbClose()
        window.terminal7.iceServers = []
        window.terminal7.pbConnect()
    })
}
export function sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms)) 
}
export async function connectFirstGate (page) {
    const btns = page.locator('#gates button')
    await btns.first().dispatchEvent('pointerdown')
    await sleep(50)
    await btns.first().dispatchEvent('pointerup')
}
