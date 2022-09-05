/*! Terminal 7 Form Tests
 *  This file contains the code that tests terminal 7 - a webrtc based
 *  touchable terminal multiplexer.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { afterEach, vi, describe, it, expect, beforeEach } from 'vitest'
import { sleep } from './infra'
import { Form } from '../src/form'
import { Terminal } from '@tuzig/xterm'

vi.mock('@tuzig/xterm')

describe("form", () => {
    let word
    const t = new Terminal()
    // simulates a key press with the next char in the word
    function writeChar() {
        if (!word) {
            t.pressKey("Enter")
            return
        }
        const c = word[0]
        word = word.slice(1)
        t.pressKey(c)
        setTimeout(writeChar, 10)
    }
    beforeEach(() => {
        t.out = ""
    })
    it("can process a simple form", () => {
        const f = new Form([{ prompt:"name" }])
        word = "yossi"
        setTimeout(writeChar, 10)
        let results
        return f.start(t).then(results => {
            expect(results).toHaveLength(1)
            expect(results).toContain("yossi")
        }).catch(e => 
            assert.isNotOk(e,'Promise error'))
    })
    it("can process a form with a default", async () => {
        const f = new Form([{ prompt:"name", default:"yossi" }])
        setTimeout(() => t.pressKey("Enter"), 10)
        const results = await f.start(t)
        expect(results).toHaveLength(1)
        expect(results).toContain("yossi")
    })
    it("can process a form with a validator", async () => {
        const f = new Form([{ prompt:"name", validator: (v) => v.length > 3 ? "" : "FAIL" }])
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
        expect(t.out.endsWith("FAIL\n  name: ")).toBeTruthy()
        f.escape(t)
        await sleep(10)
        expect(failed).toBeTruthy()
    })
    it("can process a form with a list of values", async () => {
        const f = new Form([{ prompt:"name", values:["one", "two"] }])
        let finish = false
        word = "three"
        setTimeout(writeChar, 10)
        f.start(t).then(results => {
            expect(results).toHaveLength(1)
            expect(results).toContain("one")
            finish = true
        })
        await sleep(100)
        expect(t.out.endsWith("  name [one/two]: three\n  name must be one of: one, two\n  name [one/two]: ")).toBeTruthy()
        word = "one"
        setTimeout(writeChar, 10)
        await sleep(100)
        expect(finish).toBeTruthy()
    })
    it("can process a form with a list of values and a default", async () => {
        const f = new Form([{ prompt:"name", values:["one", "two"], default:"one" }])
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
        const f = new Form([{ prompt:"name", default:"one" }, { prompt:"number", default:"1" }])
        setTimeout(() => t.pressKey("Enter"), 10)
        let results
        try {
            results = await f.chooseFields(t)
        } catch(e) { expect(false).toBeTruthy() }
        expect(JSON.stringify(t.out)).toMatch(/\[ \] name: one\\n {2}\[ \] number: 1\S*$/)
        expect(results).toHaveLength(2)
        expect(results[0]).toBeFalsy()
        expect(results[1]).toBeFalsy()
    })
    it("can select fields", async () => {
        const f = new Form([{ prompt:"name", default:"one" }, { prompt:"number", default:"1" }])
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
        const f = new Form([{ prompt:"name", default:"one" }, { prompt:"number", default:"1" }])
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
