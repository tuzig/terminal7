/*! Terminal 7 Form Tests
 *  This file contains the code that tests terminal 7 - a webrtc based
 *  touchable terminal multiplexer.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { afterEach, vi, describe, it, expect, beforeEach,beforeAll } from 'vitest'
import { sleep, resizeObs } from './infra'
import { Form } from '../src/form'
import { T7Map } from '../src/map'
import { IDisposable } from 'xterm'


describe("form", () => {
    let word
    let map
    let t
    let f: Form
    let keyListener: IDisposable
    // simulates a key press with the next char in the word
    function writeChar() {
        const c = word[0] || "Enter"
        t.pressKey(c)
        if (word) {
            word = word.slice(1)
            setTimeout(writeChar, 10)
        }
    }
        
    beforeAll(() => {
        window.ResizeObserver = resizeObs
    })
    beforeEach(() => {
        map = new T7Map()
        map.open()
        t = map.t0
        t.out = ""
        keyListener = t.onKey(ev => f.onKey(ev.domEvent.key))
        f = null
    })
    afterEach(() => keyListener.dispose())
    it("can process a simple form", async () => {
        f = new Form([{ prompt:"name" }])
        word = "yossi"
        setTimeout(writeChar, 10)
        const results = await f.start(t)
        expect(results).toHaveLength(1)
        expect(results).toContain("yossi")
    })
    it("can process a form with a default", async () => {
        f = new Form([{ prompt:"name", default:"yossi" }])
        setTimeout(() => t.pressKey("Enter"), 10)
        const results = await f.start(t)
        expect(results).toHaveLength(1)
        expect(results).toContain("yossi")
    })
    it("can process a form with a validator", async () => {
        f = new Form([{ prompt:"name", validator: (v) => v.length > 3 ? "" : "FAIL" }])
        let failed = false
        word = "yossi"
        setTimeout(writeChar, 10)
        let results
        try {
            results = await f.start(t)
        } catch(e) { expect(false).toBeTruthy() }
        expect(results).toHaveLength(1)
        word = "abc"
        setTimeout(writeChar, 10)
        f.start(t).catch(() => failed=true)
        await sleep(100)
        expect(t.out.endsWith("FAIL\nname: ")).toBeTruthy()
        f.reject(new Error("test"))
        await sleep(10)
        expect(failed).toBeTruthy()
    })
    it("can process a form with a list of values", async () => {
        f = new Form([{ prompt:"name", values:["one", "two"] }])
        let finish = false
        word = "three"
        setTimeout(writeChar, 10)
        f.start(t).then(results => {
            expect(results).toHaveLength(1)
            expect(results).toContain("one")
            finish = true
        })
        await sleep(100)
        expect(t.out.endsWith("name [one/two]: three\nValue must be one of: one, two\nname [one/two]: "),
               `unexpected TWR output ${t.uot}`).toBeTruthy()
        word = "one"
        setTimeout(writeChar, 10)
        await sleep(100)
        expect(finish).toBeTruthy()
    })
    it("can process a form with a list of values and a default", async () => {
        f = new Form([{ prompt:"name", values:["one", "two"], default:"one" }])
        word = "one"
        setTimeout(() => t.pressKey("Enter"), 10)
        let results
        try {
            results = await f.start(t)
        } catch(e) { expect(false).toBeTruthy() }
        expect(results).toHaveLength(1)
        expect(results[0]).toEqual("one")
    })
    it("can open choose fields form", async () => {
        f = new Form([{ prompt:"name", default:"one" }, { prompt:"number", default:"1" }])
        setTimeout(() => t.pressKey("Enter"), 10)
        let results
        try {
            results = await f.chooseFields(t)
        } catch(e) { expect(false).toBeTruthy() }
        expect(JSON.stringify(t.out)).toMatch(/\[ \] name: one\\n\[ \] number: 1\S*$/)
        expect(results).toHaveLength(2)
        expect(results[0]).toBeFalsy()
        expect(results[1]).toBeFalsy()
    })
    it("can select fields", async () => {
        f = new Form([{ prompt:"name", default:"one" }, { prompt:"number", default:"1" }])
        setTimeout(() => t.pressKey(" "), 10)
        setTimeout(() => t.pressKey("ArrowDown"), 10)
        setTimeout(() => t.pressKey(" "), 10)
        setTimeout(() => t.pressKey("Enter"), 10)
        let results
        try {
            results = await f.chooseFields(t, "")
        } catch(e) { expect(false).toBeTruthy() }
        expect(results).toHaveLength(2)
        expect(results[0]).toBeTruthy()
        expect(results[1]).toBeTruthy()
    })
    it("can only edit chosen fields", async () => {
        f = new Form([{ prompt:"name", default:"one" }, { prompt:"number", default:"1" }])
        setTimeout(() => t.pressKey(" "), 10)
        setTimeout(() => t.pressKey("Enter"), 20)
        let results
        try {
            results = await f.chooseFields(t, "")
        } catch(e) { console.log(e)}
        console.log("results", results)
        expect(results).toHaveLength(2)
        expect(results[0]).toEqual(true)
        expect(results[1]).toEqual(false)
        f.start(t).then().catch()
        expect(t.out.endsWith("name [one]: ")).toBeTruthy()
        setTimeout(() => t.pressKey("Enter"), 10)
    })
})
