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
  var j = (this.head + i) % this.capacity
  return this.list[j]
}

CyclicArray.prototype.push = function () {
  for (var i = 0; i < arguments.length; i++) {
    this.list[this.tail] = arguments[i]
    this.tail = (this.tail + 1) % this.capacity
    this.length++
    if (this.length > this.capacity) this.length = this.capacity
    if (this.length === this.capacity && this.tail > this.head) this.head = this.tail
  }
}

CyclicArray.prototype.pop = function () {
  if (!this.length) return
  var tail = (this.tail - 1 + this.capacity) % this.capacity
  var item = this.list[tail]
  this.tail = tail
  this.length--
  return item
}

CyclicArray.prototype.shift = function () {
  if (!this.length) return
  var item = this.list[this.head]
  this.head = (this.head + 1) % this.capacity
  this.length--
  return item
}

CyclicArray.prototype.forEach = function (fn, context) {
  for (var i = 0; i < this.length; i++) {
    var j = (this.head + i) % this.capacity
    fn.call(context, this.list[j], i, this)
  }
}
