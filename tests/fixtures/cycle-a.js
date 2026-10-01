// Architecture-test fixture: requires cycle-b, which requires this file back.
// Only ever loaded by the loader self-test in architecture.test.js — never shipped.
const { cycle_b } = require('./tests/fixtures/cycle-b');
module.exports = { cycle_b };
