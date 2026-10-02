'use strict';
// Loaded only into the disposable Next test process. Fail before external I/O.
const net = require('node:net');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof first === 'object' && first ? first.host : typeof args[1] === 'string' ? args[1] : undefined;
  if (host !== '127.0.0.1' && host !== '::1') throw new Error('Admin QA forbids non-loopback network I/O');
  return connect.apply(this,args);
};
require('node:dgram').Socket.prototype.send = () => { throw new Error('Admin QA forbids UDP'); };
