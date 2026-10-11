import {buildPilotPlan, MONTHLY_LIMIT_CENTS} from './pilot-plan.mjs';

// Storage must provide a serializable transaction with async get/put.
// actorUid must come from a verified server authentication token, never request JSON.
export class CampaignControl {
  constructor(storage, ownerUid, quotedRates) {
    if (!storage?.transaction || !ownerUid) throw new Error('Transactional storage and server-configured owner required');
    this.storage = storage;
    this.ownerUid = ownerUid;
    this.quotedRates = structuredClone(quotedRates);
  }
  async change(actorUid, operation) {
    if (actorUid !== this.ownerUid) throw new Error('Owner authorization required');
    return this.storage.transaction(async tx => {
      const state = await tx.get('campaign-control') || {paused: true, campaigns: [], months: []};
      const result = operation(state);
      await tx.put('campaign-control', state);
      return structuredClone(result);
    });
  }
  submit(actorUid, input) {
    if (!this.quotedRates) throw new Error('Provider pricing is not configured; campaign submission is disabled');
    // Server computes costs; callers cannot override ledger balances or approval state.
    const plan = buildPilotPlan({...structuredClone(input), rates: this.quotedRates, spentCents: 0, reservedCents: 0});
    if (!plan.recipients.length) throw new Error('No eligible recipients to review');
    if (!plan.withinBudget) throw new Error('Campaign exceeds monthly limit');
    return this.change(actorUid, state => {
      let row = state.campaigns.find(item => item.id === plan.campaignId);
      if (row?.status === 'approved') throw new Error('Cancel the existing approval before revising');
      if (!row) { row = {id: plan.campaignId}; state.campaigns.push(row); }
      Object.assign(row, {plan, status: 'awaiting-owner-review', approval: null});
      return row;
    });
  }
  approve(actorUid, campaignId, fingerprint) {
    return this.change(actorUid, state => {
      if (state.paused) throw new Error('Automation is paused');
      const row = state.campaigns.find(item => item.id === campaignId);
      if (!row || row.plan.fingerprint !== fingerprint) throw new Error('Review the current campaign snapshot');
      if (row.status === 'approved') return row; // Repeated approval cannot reserve twice.
      if (row.status !== 'awaiting-owner-review') throw new Error('Campaign is not awaiting review');
      let month = state.months.find(item => item.month === row.plan.month);
      if (!month) { month = {month: row.plan.month, spentCents: 0, reservedCents: 0}; state.months.push(month); }
      if (month.spentCents + month.reservedCents + row.plan.estimatedMaximumCents > MONTHLY_LIMIT_CENTS)
        throw new Error('Combined monthly budget is already committed');
      month.reservedCents += row.plan.estimatedMaximumCents;
      row.status = 'approved';
      row.approval = {ownerUid: actorUid, fingerprint, reservedCents: row.plan.estimatedMaximumCents};
      return row;
    });
  }
  cancel(actorUid, campaignId) {
    return this.change(actorUid, state => {
      const row = state.campaigns.find(item => item.id === campaignId);
      if (!row) throw new Error('Campaign unavailable');
      if (row.status === 'approved') {
        const month = state.months.find(item => item.month === row.plan.month);
        month.reservedCents -= row.approval.reservedCents;
      }
      row.status = 'canceled'; row.approval = null;
      return row;
    });
  }
  pause(actorUid, paused = true) {
    if (typeof paused !== 'boolean') throw new Error('Boolean pause state required');
    return this.change(actorUid, state => {state.paused = paused; return {paused, liveExecutionEnabled: false};});
  }
  status(actorUid) {
    return this.change(actorUid, state => ({...state, liveExecutionEnabled: false, monthlyLimitCents: MONTHLY_LIMIT_CENTS}));
  }
}
