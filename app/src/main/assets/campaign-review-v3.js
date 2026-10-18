(function (root) {
  'use strict';
  const ENDPOINT = 'https://deal-recon-campaigns-v3.dealrecon.workers.dev';
  class CampaignReviewClient {
    constructor(auth, fetcher) { this.auth = auth; this.fetcher = fetcher; }
    async request(action, body = {}) {
      if (!['status', 'submit', 'approve', 'cancel', 'pause'].includes(action)) throw Error('Review action unavailable');
      const user = this.auth()?.currentUser;
      if (!user) throw Error('Sign in before checking campaign reviews.');
      const token = await user.getIdToken();
      const response = await this.fetcher(ENDPOINT + '/' + action, {
        method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token},
        body: JSON.stringify(body)});
      let data;
      try { data = await response.json(); } catch { throw Error('Campaign service returned an unreadable response.'); }
      if (!response.ok || !data.ok) throw Error(data.error || 'Campaign review unavailable.');
      if (data.liveExecutionEnabled !== false) throw Error('Unexpected campaign service configuration.');
      return data.result;
    }
  }
  root.CampaignReviewClient = CampaignReviewClient;
  if (typeof module !== 'undefined') module.exports = {CampaignReviewClient};
  if (!root.document) return;
  const el = id => document.getElementById(id);
  const client = new CampaignReviewClient(() => typeof drAuth === 'undefined' ? null : drAuth,
    (...args) => fetch(...args));
  let busy = false;
  const status = text => {el('crStatus').textContent = text;};
  const dollars = cents => '$' + (cents / 100).toFixed(2);
  async function act(operation) {
    if (busy) return;
    busy = true;
    const buttons = Array.from(document.querySelectorAll('[data-campaign-review]'), button => [button, button.disabled]);
    buttons.forEach(([button]) => {button.disabled = true;});
    try {await operation();}
    catch (error) {el('crReviews').replaceChildren(); el('crBudget').textContent = 'Server budget unavailable. Check reviews before approving.'; status(error.message + ' No outreach was sent.');}
    finally {busy = false; buttons.forEach(([button, disabled]) => {button.disabled = disabled;});}
  }
  async function refresh() {
    const state = await client.request('status');
    status((state.paused ? 'Campaign approvals paused.' : 'Campaign approvals enabled.') + ' Live calling and mailing remain disabled.');
    const month = new Date().toISOString().slice(0, 7);
    const ledger = state.months.find(row => row.month === month) || {spentCents: 0, reservedCents: 0};
    el('crBudget').textContent = month + ': ' + dollars(ledger.spentCents) + ' spent • ' + dollars(ledger.reservedCents) + ' reserved • $45.00 combined limit';
    const container = el('crReviews'); container.replaceChildren();
    for (const row of state.campaigns) {
      const card = document.createElement('div'); card.className = 'item';
      const detail = document.createElement('p');
      detail.textContent = row.id + ' • ' + row.status + ' • ' + row.plan.month + ' • Maximum ' + dollars(row.plan.estimatedMaximumCents) +
        ' • ' + row.plan.postcardCount + ' postcards • ' + row.plan.callCount + ' AI calls'; card.append(detail);
      const content = document.createElement('p'); content.style.whiteSpace = 'pre-wrap';
      content.textContent = 'Postcard front:\n' + row.plan.content.postcardFront + '\n\nPostcard back:\n' + row.plan.content.postcardBack;
      card.append(content);
      for (const recipient of row.plan.recipients) {
        const destination = document.createElement('p');
        destination.textContent = recipient.channels.join(', ') + ' • ' + (recipient.mailingAddress || recipient.phone);
        card.append(destination);
      }
      for (const excluded of row.plan.excluded) {
        const warning = document.createElement('p'); warning.textContent = 'Excluded: ' + excluded.reasons.join('; '); card.append(warning);
      }
      if (row.status === 'awaiting-owner-review') {
        const approve = document.createElement('button'); approve.className = 'btn';
        approve.textContent = 'Approve this reviewed estimate'; approve.dataset.campaignReview = '';
        approve.disabled = state.paused;
        approve.onclick = () => act(async () => {
          await client.request('approve', {campaignId: row.id, fingerprint: row.plan.fingerprint}); await refresh();
        }); card.append(approve);
      }
      if (row.status !== 'canceled') {
        const cancel = document.createElement('button'); cancel.className = 'btn alt';
        cancel.textContent = 'Cancel campaign review'; cancel.dataset.campaignReview = '';
        cancel.onclick = () => act(async () => {await client.request('cancel', {campaignId: row.id}); await refresh();}); card.append(cancel);
      }
      container.append(card);
    }
  }
  root.crRefresh = () => act(refresh);
  root.crPause = paused => act(async () => {await client.request('pause', {paused}); await refresh();});
  root.crSubmitPostcard = () => act(async () => {
    const campaignId = el('cmCampaign').value;
    const lead = get('leads').find(row => String(row.id) === el('cmLead').value);
    if (!campaignId || !lead) throw Error('Select a campaign and lead above.');
    if (!el('crAddressReviewed').checked) throw Error('Review and confirm the mailing destination first.');
    const address = el('crAddress').value.trim(), front = el('crFront').value.trim(), back = el('crBack').value.trim();
    if (!address || !front || !back) throw Error('Enter the mailing address and both postcard sides.');
    if (lead.mailOptOut) throw Error('This lead is marked no mail.');
    await client.request('submit', {
      month: new Date().toISOString().slice(0, 7), campaignId: 'postcard:' + campaignId + ':' + lead.id,
      recipients: [{leadId: lead.id, mailingAddress: address, addressReviewed: true, mailOptOut: !!lead.mailOptOut, postcardRequested: true}],
      content: {postcardFront: front, postcardBack: back, callScript: 'AI calls disabled for this postcard review.', voiceId: 'disabled'}
    });
    el('crAddressReviewed').checked = false;
    await refresh();
  });
  root.crDestinationChanged = () => {el('crAddressReviewed').checked = false;};
})(typeof window !== 'undefined' ? window : globalThis);
