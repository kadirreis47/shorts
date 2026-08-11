// Test-facing compatibility module. The sandboxed preload entry itself must not
// require this sibling module; see preload.cjs.
module.exports = require('./preload.cjs');
