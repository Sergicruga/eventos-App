const assert = require('assert');
const { resolveImageUrl } = require('./imageSource');

const cases = [
  { input: '/uploads/profile_123.jpg', expected: 'https://eventos-app-oy65.onrender.com/uploads/profile_123.jpg' },
  { input: 'uploads/events/photo.jpg', expected: 'https://eventos-app-oy65.onrender.com/uploads/events/photo.jpg' },
  { input: 'https://cdn.example.com/photo.jpg', expected: 'https://cdn.example.com/photo.jpg' },
  { input: null, expected: null },
];

for (const testCase of cases) {
  assert.strictEqual(resolveImageUrl(testCase.input), testCase.expected, `Expected ${testCase.input} to resolve to ${testCase.expected}`);
}

console.log('imageSource regression tests passed');
