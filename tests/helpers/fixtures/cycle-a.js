// Architecture-test fixture: imports cycle-b, which imports this file back.
// Only ever loaded by the loader self-test in architecture.test.js — never shipped.
var cycle_b = imports['cycle-b'];
