/** Unauthenticated welcome UI; privileged actions belong to the context-isolated account bridge. */
async function main() {
  const account = window.dshDesktop?.account ?? window.workbenchBrowserAccount;
  const {id,messages,configurePlatform} = await account.locale();
  document.documentElement.lang = id;
  document.title = messages.accountProduct;
  for (const [id,key] of [['brand','accountBrand'],['subtitle','accountSubtitle'],['headline','accountHeadline'],['description','accountDescription'],['login','accountLogin'],['cancel','accountCancel'],['status','accountReady'],['footer','accountFooter']]) document.getElementById(id).textContent = messages[key];
  const login = document.querySelector('#login');
  const cancel = document.querySelector('#cancel');
  const status = document.querySelector('#status');
  const error = document.querySelector('#error');
  if (configurePlatform) {
    const settings = document.createElement('button');
    settings.type = 'button'; settings.textContent = messages.platformSettings;
    settings.addEventListener('click', async () => { try { await account.platform(); } catch { error.textContent = messages.platformSaveFailed; } });
    status.insertAdjacentElement('afterend', settings);
  }
  error.textContent = new URLSearchParams(location.search).get('message') || '';
  for (const [id, key] of [['cowork','accountCowork'],['cowork-description','accountCoworkDescription'],['code','accountCode'],['code-description','accountCodeDescription']]) document.getElementById(id).textContent = messages[key];
  cancel.addEventListener('click', async () => {
    try { await account.cancel(); }
    catch (failure) { error.textContent = failure.message; }
  });
  login.addEventListener('click', async () => {
    login.disabled = true; cancel.hidden = false; error.textContent = '';
    login.textContent = messages.accountWaiting; status.textContent = messages.accountBrowserOpened;
    try { await account.login(); }
    catch (failure) { error.textContent = failure.message.replace(/^Error invoking remote method '[^']+': Error: /, ''); }
    finally { login.disabled = false; login.textContent = messages.accountLogin; cancel.hidden = true; status.textContent = messages.accountReady; }
  });
  if (account.complete) {
    login.disabled = true; cancel.hidden = false; status.textContent = messages.accountPreparing;
    try { await account.complete(); }
    catch (failure) { error.textContent = failure.message; login.disabled = false; cancel.hidden = true; status.textContent = messages.accountReady; }
  }
  if (new URLSearchParams(location.search).has('signed-out')) status.textContent = messages.accountSignedOut;
}
void main();
