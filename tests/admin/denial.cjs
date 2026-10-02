'use strict';
const assert = require('node:assert/strict');
function deniedAdminHtml(status, html) {
  // Next can commit the public root shell before nested requireOwner notFound.
  // A 200 is accepted ONLY with the explicit not-found UI and no Admin content.
  assert.ok(status === 404 || status === 200, `Unexpected Admin denial status ${status}`);
  assert.ok(html.includes('الصفحة مو موجودة'), 'Admin denial must render not-found UI');
  assert.ok(!/OWNER CONSOLE|لوحة المالك|PRIVATE DRAFT SECRET|storage_key|storage_object_version/.test(html), 'Denied response contains Admin/private content');
}
module.exports = { deniedAdminHtml };
