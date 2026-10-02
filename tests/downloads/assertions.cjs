'use strict';
const assert = require('node:assert/strict');
const { ids, storageKey, secrets } = require('./fixtures.cjs');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^wzdl1_[A-Za-z0-9_-]{43}$/;
function timestamp(value) { assert.equal(typeof value, 'string'); assert.match(value, /^\d{4}-\d\d-\d\dT/); const ms = Date.parse(value); assert.ok(Number.isFinite(ms), 'valid ISO timestamp'); return ms; }
function headers(response) {
    assert.match(response.headers.get('cache-control') || '', /\bprivate\b/);
    assert.match(response.headers.get('cache-control') || '', /\bno-store\b/);
    for (const word of ['noindex', 'nofollow', 'noarchive'])
        assert.ok((response.headers.get('x-robots-tag') || '').includes(word));
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.notEqual(response.headers.get('access-control-allow-origin'), '*');
}
function noPrivate(value, { allowToken = false, extra = [] } = {}) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    for (const secret of [storageKey, ...secrets, ...extra])
        assert.ok(!text.includes(secret), `private sentinel disclosed: ${secret}`);
    assert.ok(!/"(?:storage_key|storage_backend|token_hash|principal_key|network_hash|user_id|client_id|password_hash|stack|sql|cookie)"\s*:/.test(text), 'private field disclosed');
    assert.ok(!/https?:[^\s"<>]*(?:X-Amz-|signature=|sig=)/i.test(text), 'signed delivery URL disclosed');
    if (!allowToken) {
        assert.ok(!TOKEN.test(text));
        assert.ok(!/wzdl1_[A-Za-z0-9_-]{43}/.test(text), 'application token disclosed');
        assert.ok(!/"token"\s*:/.test(text));
    }
}
async function json(response) { headers(response); assert.match(response.headers.get('content-type') || '', /application\/json/i); return response.json(); }
async function error(response, status, code) {
    assert.equal(response.status, status);
    assert.equal(response.headers.get('location'), null);
    const data = await json(response);
    noPrivate(data);
    assert.deepEqual(Object.keys(data).sort(), ['error', 'server_time', 'trace_id']);
    assert.equal(data.error.code, code);
    assert.equal(typeof data.error.message, 'string');
    assert.ok(data.error.message.length > 0);
    assert.deepEqual(Object.keys(data.error).sort(), ['code', 'message', 'retry_after_seconds', 'retry_at']);
    timestamp(data.server_time);
    assert.equal(typeof data.trace_id, 'string');
    assert.ok(data.trace_id.length > 0);
    return data;
}
async function admitted(response, status = 201) {
    assert.equal(response.status, status);
    const data = await json(response);
    noPrivate(data);
    assert.match(data.request_id, UUID);
    assert.deepEqual(Object.keys(data).sort(), ['request_id', 'state', 'server_time', 'ready_at', 'next_download_at', 'request_expires_at', 'wait_seconds', 'status_url', 'can_issue_token'].sort());
    assert.equal(data.state, 'pending');
    assert.equal(timestamp(data.ready_at) - timestamp(data.server_time), 20000);
    assert.equal(timestamp(data.next_download_at), timestamp(data.ready_at));
    assert.equal(timestamp(data.request_expires_at) - timestamp(data.ready_at), 300000);
    assert.equal(data.wait_seconds, 20);
    assert.equal(data.status_url, `/api/downloads/requests/${data.request_id}`);
    assert.equal(response.headers.get('location'), data.status_url);
    return data;
}
async function issued(response, request) {
    assert.equal(response.status, 200);
    const data = await json(response);
    noPrivate(data, { allowToken: true });
    assert.deepEqual(Object.keys(data).sort(), ['token', 'token_expires_at', 'server_time', 'redeem_url'].sort());
    assert.match(data.token, TOKEN);
    const encoded = data.token.slice(6), decoded = Buffer.from(encoded, 'base64url');
    assert.equal(decoded.length, 32);
    assert.equal(decoded.toString('base64url'), encoded, 'canonical base64url');
    assert.ok(timestamp(data.server_time) >= timestamp(request.ready_at));
    assert.equal(timestamp(data.token_expires_at), Math.min(timestamp(data.server_time) + 60000, timestamp(request.request_expires_at)));
    assert.equal(data.redeem_url, '/api/downloads/redeem');
    return data;
}
function retry(response, data, deadline) {
    const raw = response.headers.get('retry-after');
    assert.match(raw || '', /^[1-9]\d*$/);
    const seconds = Number(raw);
    assert.equal(data.error.retry_after_seconds, seconds);
    const now = timestamp(data.server_time), at = timestamp(data.error.retry_at);
    assert.equal(seconds, Math.max(1, Math.ceil((at - now) / 1000)));
    if (deadline !== undefined)
        assert.equal(at, deadline);
}
async function redeemed(response) {
    assert.equal(response.status, 303);
    headers(response);
    const url = new URL(response.headers.get('location'));
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'delivery.example.test');
    assert.equal(url.port, '');
    assert.equal(url.pathname, `/${storageKey}`);
    assert.equal(url.searchParams.get('X-Amz-Signature'), 'QA_SIGNATURE_SENTINEL');
    assert.equal(await response.text(), '', 'no binary or JSON body');
    return url;
}
module.exports = { UUID, TOKEN, timestamp, headers, noPrivate, json, error, admitted, issued, retry, redeemed };
