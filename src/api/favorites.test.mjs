import assert from 'assert';
import { normalizeFavoriteEventId } from './favorites.js';

assert.strictEqual(normalizeFavoriteEventId('G5diZ12345'), 'G5diZ12345');
assert.strictEqual(normalizeFavoriteEventId(42), '42');
assert.strictEqual(normalizeFavoriteEventId(' 55 '), '55');
assert.strictEqual(normalizeFavoriteEventId(null), null);

console.log('favorites regression tests passed');
