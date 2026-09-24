/* Deal Recon V3 communications: local/shared workspace records; no outbound provider calls. */
(function () {
  'use strict';
  const el = id => document.getElementById(id);
  const read = key => get(key);
  const save = (key, rows) => set(key, rows);
  const id = () => Date.now() + Math.random();
  const today = () => new Date().toISOString().slice(0, 10);
  const dayAfter = days => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const chosen = () => read('leads').find(row => String(row.id) === el('cmLead').value);
  const campaign = () => read('commCampaigns').find(row => String(row.id) === el('cmCampaign').value);
  const number = value => Math.max(0, Number(value) || 0);
  const message = text => { el('cmLetterStatus').textContent = text; };
  let activeLetterKey = '';
  let letterDirty = false;
  let saveTimer = null;
  const letterKey = () => {
    const lead = chosen();
    return lead ? String(lead.id) + ':' + el('cmTemplate').value : '';
  };
  function saveActiveLetter() {
    if (!activeLetterKey || !letterDirty) return;
    const rows = read('commLetters');
    let draft = rows.find(row => row.key === activeLetterKey);
    if (!draft) { draft = {key: activeLetterKey}; rows.push(draft); }
    draft.text = el('cmLetter').value;
    draft.updatedAt = new Date().toISOString();
    save('commLetters', rows);
    letterDirty = false;
  }
  window.cmLetterChanged = function () {
    letterDirty = true;
    message('Editing draft…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveActiveLetter(); message('Draft saved.'); }, 600);
  };
  window.cmSaveLetter = function () {
    clearTimeout(saveTimer);
    if (!letterKey()) return message('Select a lead before saving a letter.');
    if (!el('cmLetter').value.trim()) return message('Enter letter text before saving.');
    if (activeLetterKey !== letterKey()) window.cmLoadLetter();
    letterDirty = true;
    saveActiveLetter();
    message('Draft saved for this lead and letter type.');
  };
  window.cmLoadLetter = function () {
    clearTimeout(saveTimer);
    saveActiveLetter();
    activeLetterKey = letterKey();
    const lead = chosen();
    if (!lead) { el('cmLetter').value = ''; return message('Select a lead to write a letter.'); }
    const draft = read('commLetters').find(row => row.key === activeLetterKey);
    el('cmLetter').value = draft ? draft.text : letter(lead);
    message(draft ? 'Saved draft loaded. You can edit it any time.' : 'Starter letter loaded. Edit and save it.');
  };
  function requireLead() {
    const lead = chosen();
    if (!lead) message('Select a lead first.');
    return lead;
  }
  function record(kind, lead, details) {
    const rows = read('commActivity');
    rows.unshift({id: id(), kind, leadId: lead.id, campaignId: campaign()?.id || null,
      date: new Date().toISOString(), ...details});
    save('commActivity', rows);
    window.cmRefresh();
  }
  function queue(lead, task, days) {
    const rows = read('commFollowups');
    rows.unshift({id: id(), leadId: lead.id, campaignId: campaign()?.id || null,
      task, due: dayAfter(days), done: false});
    save('commFollowups', rows);
  }
  function suppressed(lead) {
    return /do not call/i.test(String(lead.dnc || ''));
  }
  window.cmLogCall = function () {
    const lead = requireLead();
    if (!lead) return;
    const outcome = el('cmOutcome').value;
    if (!lead.phone && outcome !== 'Do Not Call') return message('This lead has no saved phone number.');
    if (suppressed(lead) && outcome !== 'Do Not Call')
      return message('This lead is marked Do Not Call. No call attempt was recorded.');
    record('call', lead, {outcome, notes: el('cmCallNotes').value.trim(), cost: 0});
    if (outcome === 'Do Not Call') {
      const leads = read('leads');
      const stored = leads.find(row => String(row.id) === String(lead.id));
      if (stored) stored.dnc = 'Do Not Call';
      save('leads', leads);
    } else if (outcome !== 'Appointment') queue(lead, 'Review call outcome and follow up', 3);
    window.cmRefresh();
    message('Call outcome saved. This app did not dial the number.');
  };
  const templates = {
    absentee: 'I work with South Jersey owners who are considering their options for a property they own. If you would like to discuss a sale or review current market value, I would be glad to help.',
    landlord: 'If managing your rental has become more work than you want, I can help you compare keeping it, selling it as-is, and listing it for sale.',
    multifamily: 'I work with investors seeking South Jersey multifamily property. If you would consider selling, I can share a market review and discuss your timing.',
    general: 'If you are considering a change with your property, I can help you review your options and current market value.'
  };
  function letter(lead) {
    const address = String(lead.mailingAddress || '').trim();
    if (!address) return 'A verified mailing address is required before drafting a letter.';
    const name = String(lead.name || 'Property Owner').trim();
    const property = String(lead.prop || 'your property').trim();
    const body = templates[el('cmTemplate').value] || templates.general;
    return `${name}\n${address}\n\nDear ${name},\n\nRegarding ${property}: ${body}\n\nThere is no obligation to respond. If you prefer no further letters from me, please let me know.\n\nSincerely,\nKen LePosa II\nThe Ken LePosa Real Estate Group of Coldwell Banker Realty\nkensellssouthjersey.com\n\n[Review brokerage address, contact details, and required disclosures before mailing.]`;
  }
  window.cmOptOutMail = function () {
    const lead = requireLead();
    if (!lead) return;
    const leads = read('leads');
    const stored = leads.find(row => String(row.id) === String(lead.id));
    if (stored) stored.mailOptOut = true;
    save('leads', leads);
    message('Mail opt-out saved for this lead.');
  };
  window.cmOpenLead = function (leadId) {
    window.cmRefresh();
    el('cmLead').value = String(leadId);
    go('comms');
    window.cmLoadLetter();
  };
  window.cmOpenOwner = function (ownerId) {
    const owner = read('owners').find(row => String(row.id) === String(ownerId));
    if (!owner) return;
    const leads = read('leads');
    const normalize = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    let lead = leads.find(row =>
      (owner.parcelId && String(row.parcelId || '') === String(owner.parcelId)) ||
      (owner.prop && normalize(row.prop) === normalize(owner.prop)));
    if (!lead) {
      lead = {id: id(), dealId: owner.dealId || null, parcelId: owner.parcelId || '',
        name: owner.name || '', prop: owner.prop || '', mailingAddress: owner.mail || '',
        phone: '', email: '', type: owner.type || 'Other', source: 'Owner Recon',
        status: 'New', dnc: 'Unknown'};
      leads.unshift(lead);
      save('leads', leads);
      if (typeof renderAll === 'function') renderAll();
    }
    window.cmOpenLead(lead.id);
  };
  let aiLetterKey = '';
  let aiSourceText = '';
  window.cmEnhanceLetter = function () {
    const lead = requireLead();
    if (!lead) return;
    if (window.aiMode || window.aiDealMode) return message('Another AI request is in progress.');
    const draft = el('cmLetter').value.trim();
    if (!draft) return message('Write or load a letter first.');
    if (!window.DealReconAI || typeof window.DealReconAI.ask !== 'function')
      return message('The app AI connection is unavailable. Your draft is safe.');
    if (!window.confirm('AI may incur provider usage charges and will receive this letter text. Send it for a suggestion?'))
      return message('AI request canceled. Your draft is unchanged.');
    clearTimeout(saveTimer);
    saveActiveLetter();
    aiLetterKey = letterKey();
    aiSourceText = draft;
    el('cmAiSuggestion').value = '';
    message('Asking AI for a letter suggestion…');
    window.aiMode = 'letter';
    const prompt = 'Rewrite the following South Jersey real estate owner letter to be clear, concise, personal, and professional. Return only the complete revised letter as plain text. Preserve the addressee, property address, signature, brokerage identity, opt-out language, and all provided facts. Do not invent offers, prices, buyer commitments, legal claims, or urgency. Leave any disclosure review placeholder in place. The agent will review before sending.\n\nLETTER:\n' + draft;
    try { window.DealReconAI.ask(prompt); }
    catch (error) { window.aiMode = null; window.cmAIError(error.message); }
  };
  window.cmAIResult = function (text) {
    if (aiLetterKey !== letterKey()) return message('AI suggestion arrived for another lead. Reopen that lead to request a new suggestion.');
    el('cmAiSuggestion').value = String(text || '').trim();
    message(el('cmAiSuggestion').value ? 'Review the suggestion, then choose Use AI suggestion if you like it.' : 'AI returned no suggestion. Your draft is unchanged.');
  };
  window.cmAIError = function () {
    message('AI could not improve this letter right now. Your draft is unchanged.');
  };
  window.cmApplySuggestion = function () {
    if (!aiLetterKey || aiLetterKey !== letterKey()) return message('This suggestion belongs to another lead or letter type.');
    const suggested = el('cmAiSuggestion').value.trim();
    if (!suggested) return message('There is no AI suggestion to use.');
    if (el('cmLetter').value.trim() !== aiSourceText &&
        !window.confirm('You edited the draft after requesting AI. Replace your newer edits with this suggestion?'))
      return message('Your newer draft was kept.');
    el('cmLetter').value = suggested;
    window.cmLetterChanged();
    window.cmSaveLetter();
    message('AI suggestion applied and saved. Review before mailing.');
  };
  window.cmDraftMail = function () { window.cmLoadLetter(); };
  window.cmLogMail = function () {
    const lead = requireLead();
    if (!lead) return;
    if (lead.mailOptOut) return message('This lead opted out of mail. No mailing recorded.');
    if (!lead.mailingAddress) return message('A verified mailing address is required.');
    if (activeLetterKey !== letterKey()) window.cmLoadLetter();
    clearTimeout(saveTimer);
    saveActiveLetter();
    const draft = el('cmLetter').value.trim();
    if (!draft) return message('Write and save a letter before logging a mailing.');
    if (!window.confirm('Confirm this letter was physically mailed? This records the event and cost only.')) return;
    record('mail', lead, {template: el('cmTemplate').value, letterText: draft, cost: number(el('cmMailCost').value)});
    message('Mailing recorded with the exact letter text. No mail was sent by the app.');
    queue(lead, 'Review response to mailed letter', 14);
    window.cmRefresh();
  };
  window.cmAddCampaign = function () {
    const name = el('cmName').value.trim();
    if (!name) return message('Enter a campaign name.');
    const rows = read('commCampaigns');
    rows.unshift({id: id(), name, budget: number(el('cmBudget').value), active: true, created: today()});
    save('commCampaigns', rows);
    el('cmName').value = '';
    window.cmRefresh();
  };
  window.cmToggleCampaign = function (campaignId) {
    const rows = read('commCampaigns');
    const item = rows.find(row => String(row.id) === String(campaignId));
    if (item) item.active = !item.active;
    save('commCampaigns', rows);
    window.cmRefresh();
  };
  window.cmAddFollowup = function () {
    const lead = requireLead();
    if (!lead) return;
    const task = el('cmTask').value.trim();
    const due = el('cmDue').value;
    if (!task || !due) return message('Enter a task and due date.');
    const rows = read('commFollowups');
    rows.unshift({id: id(), leadId: lead.id, campaignId: campaign()?.id || null,
      task, due, done: false});
    save('commFollowups', rows);
    el('cmTask').value = '';
    window.cmRefresh();
  };
  window.cmCompleteFollowup = function (taskId) {
    const rows = read('commFollowups');
    const item = rows.find(row => String(row.id) === String(taskId));
    if (item) { item.done = true; item.completedAt = new Date().toISOString(); }
    save('commFollowups', rows);
    window.cmRefresh();
  };
  window.cmLogConversion = function () {
    const lead = requireLead();
    if (!lead) return;
    record('conversion', lead, {outcome: el('cmConversion').value,
      revenue: number(el('cmRevenue').value), cost: 0});
    message('Conversion recorded. Revenue is attributed to the selected campaign.');
  };
  window.cmRefresh = function () {
    const leads = read('leads');
    const campaigns = read('commCampaigns');
    const oldLead = el('cmLead').value;
    const oldCampaign = el('cmCampaign').value;
    el('cmLead').innerHTML = '<option value="">Select a lead</option>' + leads.map(row =>
      `<option value="${esc(row.id)}">${esc(row.name || 'Owner')} — ${esc(row.prop || 'No property')}</option>`).join('');
    el('cmLead').value = oldLead;
    el('cmCampaign').innerHTML = '<option value="">Unassigned</option>' + campaigns.filter(row => row.active).map(row =>
      `<option value="${esc(row.id)}">${esc(row.name)}</option>`).join('');
    el('cmCampaign').value = oldCampaign;
    el('cmCampaignList').innerHTML = campaigns.map(row =>
      `<div class="item"><b>${esc(row.name)}</b> • ${row.active ? 'Active' : 'Paused'} • Budget ${money(number(row.budget))} <button class="btn alt" onclick="cmToggleCampaign(${Number(row.id)})">${row.active ? 'Pause' : 'Resume'}</button></div>`).join('') || '<p class="sub">No campaigns yet.</p>';
    const leadName = leadId => leads.find(row => String(row.id) === String(leadId))?.name || 'Deleted lead';
    const tasks = read('commFollowups').filter(row => !row.done).sort((a, b) => String(a.due).localeCompare(String(b.due)));
    el('cmFollowups').innerHTML = tasks.map(row =>
      `<div class="item"><b>${esc(row.due)}</b> • ${esc(leadName(row.leadId))}<p>${esc(row.task)}</p><button class="btn alt" onclick="cmCompleteFollowup(${Number(row.id)})">Complete</button></div>`).join('') || '<p class="sub">No open follow-ups.</p>';
    const activity = read('commActivity');
    const selected = campaign()?.id || null;
    const scoped = selected ? activity.filter(row => String(row.campaignId) === String(selected)) : activity;
    const cost = scoped.reduce((sum, row) => sum + number(row.cost), 0);
    const revenue = scoped.reduce((sum, row) => sum + number(row.revenue), 0);
    const responses = new Set(scoped.filter(row => row.kind === 'conversion' && row.outcome === 'Response').map(row => row.leadId)).size;
    const clients = new Set(scoped.filter(row => row.kind === 'conversion' && row.outcome === 'Client').map(row => row.leadId)).size;
    const outreach = scoped.filter(row => row.kind === 'call' || row.kind === 'mail').length;
    const reached = new Set(scoped.filter(row => row.kind === 'call' || row.kind === 'mail').map(row => row.leadId)).size;
    const roi = cost ? ((revenue - cost) / cost * 100).toFixed(1) + '%' : 'N/A (no cost logged)';
    el('cmMetrics').innerHTML = `<div class="metrics"><div class="metric"><small>Outreach logged</small><strong>${outreach}</strong></div><div class="metric"><small>Responses</small><strong>${responses}</strong></div><div class="metric"><small>Clients</small><strong>${clients}</strong></div><div class="metric"><small>Cost / revenue</small><strong>${money(cost)} / ${money(revenue)}</strong></div></div><p>Client conversion: ${reached ? (clients / reached * 100).toFixed(1) + '%' : 'N/A'} of ${reached} leads reached • ROI: ${roi}</p>`;
    el('cmActivity').innerHTML = scoped.slice(0, 30).map(row =>
      `<div class="item">${esc(row.date?.slice(0, 10) || '')} • ${esc(row.kind)} • ${esc(leadName(row.leadId))} • ${esc(row.outcome || row.template || '')}</div>`).join('');
  };
  window.cmRefresh();
})();
