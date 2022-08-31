/*! Terminal 7 Form Tests
 *  This file contains the code that tests terminal 7 - a webrtc based
 *  touchable terminal multiplexer.
 *
 *  Copyright: (c) 2020 Benny A. Daon - benny@tuzig.com
 *  License: GPLv3
 */
import { vi, describe, beforeAll, afterEach, it, expect, beforeEach } from 'vitest'
import { Terminal7Mock, sleep } from './infra'
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
    it("can process a simple form", async () => {
        const f = new Form([{ prompt:"name" }])
        word = "yossi"
        setTimeout(writeChar, 10)
        const results = await f.start(t)
        expect(results.length).to.equal(1)
        expect(results[0]).to.equal("yossi")
    })
    it("can process a form with a default", async () => {
        const f = new Form([{ prompt:"name", default:"yossi" }])
        setTimeout(() => t.pressKey("Enter"), 10)
        const results = await f.start(t)
        expect(results.length).to.equal(1)
        expect(results[0]).to.equal("yossi")
    })
    it("can process a form with a validator", async () => {
        const f = new Form([{ prompt:"name", validator: (v) => v.length > 3 ? "" : "FAIL" }])
        word = "yossi"
        setTimeout(writeChar, 10)
        const results = await f.start(t)
        expect(results.length).to.equal(1)
        word = "abc"
        setTimeout(writeChar, 10)
        f.start(t)
        await sleep(100)
        expect(t.out.endsWith("FAIL\n  name: ")).toBeTruthy()
    })
    it("can process a form with a list of values", async () => {
        const f = new Form([{ prompt:"name", values:["one", "two"] }])
        word = "three"
        setTimeout(writeChar, 10)
        f.start(t)
        await sleep(100)
        expect(t.out.endsWith("  name [one/two]: three\n  name must be one of: one, two\n  name [one/two]: ")).toBeTruthy()
        word = "one"
        setTimeout(writeChar, 10)
        const results = await f.start(t)
        expect(results.length).to.equal(1)
        expect(results[0]).to.equal("one")
    })
    it("can process a form with a list of values and a default", async () => {
        const f = new Form([{ prompt:"name", values:["one", "two"], default:"one" }])
        word = "one"
        setTimeout(() => t.pressKey("Enter"), 10)
        const results = await f.start(t)
        expect(results.length).to.equal(1)
        expect(results[0]).to.equal("one")
    })
    it("can open choose fields form", async () => {
        const f = new Form([{ prompt:"name", default:"one" }, { prompt:"number", default:"1" }])
        setTimeout(() => t.pressKey("Enter"), 10)
        const results = await f.chooseFields(t)
        expect(JSON.stringify(t.out)).toMatch(/\[ \] name: one\\n {2}\[ \] number: 1\S*$/)
        expect(results).toEqual([false, false])
    })
    it("can select fields", async () => {
        const f = new Form([{ prompt:"name", default:"one" }, { prompt:"number", default:"1" }])
        setTimeout(() => t.pressKey(" "), 10)
        setTimeout(() => t.pressKey("ArrowDown"), 10)
        setTimeout(() => t.pressKey(" "), 10)
        setTimeout(() => t.pressKey("Enter"), 10)
        const results = await f.chooseFields(t)
        expect(results).toEqual([true, true])
    })
    it("can only edit chosen fields", async () => {
        const f = new Form([{ prompt:"name", default:"one" }, { prompt:"number", default:"1" }])
        setTimeout(() => t.pressKey(" "), 10)
        setTimeout(() => t.pressKey("Enter"), 10)
        const results = await f.chooseFields(t)
        expect(results).toEqual([true, false])
        f.start(t)
        expect(t.out.endsWith("name [one]: ")).toBeTruthy()
    })
})
