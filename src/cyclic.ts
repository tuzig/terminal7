export function CyclicArray(n) {
  if (!(this instanceof CyclicArray)) return new CyclicArray(n)

  this.head = 0
  this.tail = 0
  this.capacity = n
  this.list = new Array(n)
  this.length = 0
}

CyclicArray.prototype.get = function (i) {
  if (i >= this.length) return
  const j = (this.head + i) % this.capacity
  return this.list[j]
}

CyclicArray.prototype.push = function (...args) {
  for (let i = 0; i < args.length; i++) {
    this.list[this.tail] = args[i]
    this.tail = (this.tail + 1) % this.capacity
    if (this.length == this.capacity)
      this.head = this.tail
    else
      this.length++
  }
}

CyclicArray.prototype.pop = function () {
  if (!this.length) return
  const tail = (this.tail - 1 + this.capacity) % this.capacity
  const item = this.list[tail]
  this.tail = tail
  this.length--
  return item
}

CyclicArray.prototype.shift = function () {
  if (!this.length) return
  const item = this.list[this.head]
  this.head = (this.head + 1) % this.capacity
  this.length--
  return item
}

CyclicArray.prototype.forEach = function (fn, context) {
  for (let i = 0; i < this.length; i++) {
    const j = (this.head + i) % this.capacity
    fn.call(context, this.list[j], i, this)
  }
}
