import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { locateDeepmerge, hardenDeepmerge } from './harden-build-dependency.mjs'

const require = createRequire(import.meta.url)
const entry = locateDeepmerge()
assert(entry, 'Build dependency must be installed for this check')
const merge = require(entry)
const hostile = JSON.parse('{"__proto__":{"inheritedFlag":true},"safe":1}')
for (const result of [merge(Object.create(null), hostile), merge(hostile, {}), merge({}, { nested: hostile }).nested]) {
  assert.equal(Object.getPrototypeOf(result), Object.prototype)
  assert.equal(result.inheritedFlag, undefined)
  assert.equal(Object.hasOwn(result, '__proto__'), false)
}
assert.equal({}.inheritedFlag, undefined)
assert.deepEqual(merge({ nested: { a: 1 }, items: [1] }, { nested: { b: 2 }, items: [2] }), { nested: { a: 1, b: 2 }, items: [1, 2] })
assert.deepEqual(merge({ items: [1] }, { items: [2] }, { arrayMerge: (_target, source) => source }), { items: [2] })
const symbol = Symbol('config')
assert.equal(merge({}, { [symbol]: 'kept' })[symbol], 'kept')
hardenDeepmerge()
console.log('Build dependency: prototype attacks blocked; nested objects, arrays and symbols preserved.')
