import {createHash} from 'node:crypto';

// Server-side review planner only. No provider clients or outbound requests.
export const MONTHLY_LIMIT_CENTS = 4500;
const cents = (value, name) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be nonnegative integer cents`);
  return value;
};
export function buildPilotPlan({month, campaignId, recipients, content, rates, spentCents = 0, reservedCents = 0}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Valid billing month required');
  if (typeof campaignId !== 'string' || !campaignId.trim() || !Array.isArray(recipients) || !recipients.length) throw new Error('Campaign and recipients required');
  if (!content?.postcardFront || !content?.postcardBack || !content?.callScript || !content?.voiceId)
    throw new Error('Complete postcard, script, and voice choice required');
  const prior = cents(spentCents, 'Spent') + cents(reservedCents, 'Reserved');
  const fixed = cents(rates.fixedMonthlyCents, 'Fixed monthly cost');
  const postcard = cents(rates.postcardAllInCents, 'Postcard all-in cost');
  const minute = cents(rates.callAllInMinuteCents, 'Call all-in minute cost');
  if (!postcard || !minute || !Number.isSafeInteger(rates.maxCallSeconds) || rates.maxCallSeconds < 1)
    throw new Error('Positive quoted rates and bounded call duration required');
  const seenPhones = new Set(), seenAddresses = new Set(), included = [], excluded = [];
  for (const recipient of recipients) {
    const row = {leadId: recipient.leadId, phone: '', mailingAddress: '', channels: []};
    const reasons = [];
    const phone = String(recipient.phone || '').replace(/[^\d+]/g, '');
    const address = String(recipient.mailingAddress || '').trim();
    const addressKey = address.toUpperCase().replace(/\s+/g, ' ');
    if (recipient.callRequested) {
      if (recipient.dnc || !recipient.callConsentReviewed || !recipient.callConsentEvidence)
        reasons.push('Call excluded: suppression or missing reviewed consent evidence');
      else if (!/^\+?\d{7,15}$/.test(phone) || seenPhones.has(phone)) reasons.push('Call excluded: invalid or duplicate number');
      else { seenPhones.add(phone); row.phone = phone; row.channels.push('ai-call'); }
    }
    if (recipient.postcardRequested) {
      if (recipient.mailOptOut || !recipient.addressReviewed || !address || seenAddresses.has(addressKey))
        reasons.push('Postcard excluded: opt-out, unreviewed address, or duplicate destination');
      else { seenAddresses.add(addressKey); row.mailingAddress = address; row.channels.push('postcard'); }
    }
    if (row.channels.length) included.push(row);
    if (reasons.length) excluded.push({leadId: recipient.leadId, reasons});
  }
  const callCount = included.filter(row => row.channels.includes('ai-call')).length;
  const postcardCount = included.filter(row => row.channels.includes('postcard')).length;
  const maximumCallCents = callCount * Math.ceil(minute * rates.maxCallSeconds / 60);
  const estimatedMaximumCents = fixed + postcardCount * postcard + maximumCallCents;
  if (![prior, minute * rates.maxCallSeconds, estimatedMaximumCents, prior + estimatedMaximumCents].every(Number.isSafeInteger))
    throw new Error('Cost calculation exceeds safe integer range');
  const review = {month, campaignId, recipients: included, excluded, content, rates,
    callCount, postcardCount, estimatedMaximumCents, spentCents, reservedCents,
    monthlyLimitCents: MONTHLY_LIMIT_CENTS};
  const fingerprint = createHash('sha256').update(JSON.stringify(review)).digest('hex');
  return {...review, fingerprint, status: 'awaiting-owner-review', liveExecutionEnabled: false,
    withinBudget: prior + estimatedMaximumCents <= MONTHLY_LIMIT_CENTS};
}
