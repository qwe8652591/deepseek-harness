/** Built Electron integration test for the local platform's real PKCE and encrypted credential flow. */
import { app } from 'electron';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DesktopAccount, readAccountConfig } from '../lib/types/workbench-account.js';

const [identityFile, credentialsFile, userData] = process.argv.slice(2);
if (!identityFile || !credentialsFile || !userData) throw new Error('Expected identity file, private test account file and isolated Electron user data');
app.setPath('userData', userData);
void app.whenReady().then(async () => {
let account;
try {
  const config = await readAccountConfig(identityFile);
  const origin = new URL(config.gatewayOrigin);
  assert.equal(origin.protocol, 'http:');
  assert.equal(origin.hostname, '127.0.0.1');
  const credentials = JSON.parse(await readFile(credentialsFile, 'utf8'));
  const openBrowser = async url => {
    assert.equal(new URL(url).origin, origin.origin);
    const form = await fetch(url, { redirect: 'manual' });
    const transaction = form.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const html = await form.text();
    const action = /<form[^>]+action="([^"]+)"/.exec(html)?.[1];
    const request = /<input[^>]+name="request"[^>]+value="([^"]+)"/.exec(html)?.[1];
    assert.ok(action && request);
    const destination = new URL(action, url);
    assert.equal(destination.origin, origin.origin);
    const submitted = await fetch(destination, { method: 'POST', redirect: 'manual',
      headers: { origin: origin.origin, cookie: transaction, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ request, username: credentials.username, password: credentials.password }) });
    assert.equal(submitted.status, 303);
    const callback = new URL(submitted.headers.get('location'));
    const expected = new URL(new URL(url).searchParams.get('redirect_uri'));
    assert.equal(callback.origin, expected.origin);
    assert.equal(callback.pathname, '/auth/callback');
    assert.equal(callback.searchParams.get('state'), new URL(url).searchParams.get('state'));
    assert.equal((await fetch(callback, { redirect: 'manual' })).status, 303);
    const browserSession = submitted.headers.getSetCookie().find(value => value.startsWith('cap_session='))?.split(';')[0];
    if (browserSession) await fetch(origin.origin + '/auth/logout', { method: 'POST', redirect: 'manual', headers: { origin: origin.origin, cookie: browserSession } });
  };
  account = new DesktopAccount(config, openBrowser);
  await account.login();
  const user = account.profile();
  assert.equal(user.name, credentials.username);
  assert.equal(await account.restore(), true);
  const relayFile = await account.startRelay();
  const relay = JSON.parse(await readFile(relayFile, 'utf8'));
  assert.equal((await fetch(relay.baseUrl + '/auth/me')).status, 401);
  const headers = { authorization: 'Bearer ' + relay.token };
  assert.equal((await fetch(relay.baseUrl + '/auth/me', { headers })).status, 200);
  assert.equal((await fetch(relay.baseUrl + '/api/me', { headers })).status, 200);
  await account.logout();
  assert.equal(await account.restore(), false);
  await account.dispose();
  // Leave a separately issued session for the real Desktop launch; browser sessions are untouched.
  account = new DesktopAccount(config, openBrowser);
  await account.login();
  await account.verify();
  console.log('PASS real platform PKCE login, OS-encrypted restore, relay authorization, capabilities, logout and fresh Desktop session');
  await account.dispose();
  app.exit(0);
} catch (error) {
  console.error(error);
  await account?.dispose();
  app.exit(1);
}
});
