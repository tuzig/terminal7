export default class CyclicArray {
    head = 0
    tail = 0
    list: unknown[]
    length = 0

    constructor(public capacity: number) {
        this.list = new Array(capacity)
    }

    get(i) {
        if (i >= this.length) return
        const j = (this.head + i) % this.capacity
        return this.list[j]
    }
    push(...args) {
        for (let i = 0; i < args.length; i++) {
            this.list[this.tail] = args[i]
            this.tail = (this.tail + 1) % this.capacity
            if (this.length == this.capacity)
                this.head = this.tail
            else
                this.length++
        }
    }
    pop() {
        if (!this.length) return
        const tail = (this.tail - 1 + this.capacity) % this.capacity
        const item = this.list[tail]
        this.tail = tail
        this.length--
        return item
    }
    shift() {
        if (!this.length) return
        const item = this.list[this.head]
        this.head = (this.head + 1) % this.capacity
        this.length--
        return item
    }
    forEach(fn, context) {
        for (let i = 0; i < this.length; i++) {
            const j = (this.head + i) % this.capacity
            fn.call(context, this.list[j], i, this)
        }
    }
}
