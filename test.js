const assert = require('assert');
const http = require('http');

const server = require('./server.js');

setTimeout(() => {
  http.get('http://localhost:8080/health', (res) => {
    assert.strictEqual(res.statusCode, 200);
    console.log('Test passed successfully!');
    process.exit(0);
  }).on('error', (err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
}, 1000);
