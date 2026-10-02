/** Localized public platform setup; no renderer requests reach a remote server. */
async function main() {
  const data = await window.productPlatform.read();
  document.documentElement.lang = data.id;
  document.title = data.productName;
  document.body.dataset.brand = data.profile;
  document.getElementById('brand').textContent = data.productName;
  for (const [id, key] of Object.entries({ heading:'platformHeading',description:'platformDescription','website-label':'platformWebsite',advanced:'platformAdvanced','gateway-label':'platformGateway',save:'platformContinue',hint:'platformHint' })) document.getElementById(id).textContent = data.messages[key];
  const website = document.getElementById('website'), gateway = document.getElementById('gateway'), save = document.getElementById('save'), error = document.getElementById('error');
  website.value = data.platform?.websiteOrigin || '';
  gateway.value = data.platform?.gatewayOrigin !== data.platform?.websiteOrigin ? data.platform?.gatewayOrigin || '' : '';
  if (gateway.value && gateway.value !== website.value) document.querySelector('details').open = true;
  document.getElementById('platform-form').addEventListener('submit', async event => {
    event.preventDefault(); save.disabled = true; error.textContent = '';
    try {
      const result = await window.productPlatform.save({ websiteOrigin: website.value, gatewayOrigin: gateway.value });
      if (!result.ok) error.textContent = result.message;
    } catch { error.textContent = data.messages.platformSaveFailed; }
    finally { save.disabled = false; }
  });
}
void main();
