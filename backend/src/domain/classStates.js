// State machines of the contract (CONTRATO.md §3). Services check transitions here; nothing else hardcodes them.

const freeze = map => Object.freeze(Object.fromEntries(Object.entries(map).map(([k, v]) => [k, Object.freeze(v)])));

const OFFER_TRANSITIONS = freeze({
  draft: ['sent', 'cancelled'],
  sent: ['checkout_pending', 'paid', 'expired', 'cancelled', 'replaced'],
  // Back to sent when the pending checkout fails; cancelling/replacing requires closing the checkout first (PACK-11).
  checkout_pending: ['paid', 'sent', 'expired', 'cancelled', 'replaced'],
  paid: [], expired: [], cancelled: [], replaced: []
});

const ORDER_TRANSITIONS = freeze({
  pending: ['paid', 'failed', 'paid_needs_review', 'refunded'],
  paid: ['partially_refunded', 'refunded'],
  partially_refunded: ['partially_refunded', 'refunded'],
  // A late or mismatched payment: credited after review, or refunded (PACK-17).
  paid_needs_review: ['paid', 'refunded'],
  // A payment can still arrive after Hotmart reported a cancelled attempt: never ignored, always reviewed.
  failed: ['paid_needs_review'],
  refunded: []
});

const PURCHASE_TRANSITIONS = freeze({
  active: ['paused', 'exhausted', 'expired', 'cancelled'],
  paused: ['active', 'expired', 'cancelled'],
  exhausted: ['active', 'expired', 'cancelled'],
  expired: ['active', 'cancelled'],
  cancelled: []
});

const SESSION_TRANSITIONS = freeze({
  draft: ['proposed', 'forming', 'cancelled'],
  forming: ['proposed', 'cancelled', 'expired'],
  proposed: ['confirmed', 'declined', 'expired', 'cancelled', 'proposed'],
  confirmed: ['completed', 'cancelled', 'student_no_show', 'teacher_no_show'],
  completed: ['student_no_show', 'teacher_no_show'],
  student_no_show: ['completed'], teacher_no_show: ['completed'],
  declined: [], expired: [], cancelled: []
});

const PROPOSAL_TRANSITIONS = freeze({
  pending: ['accepted', 'declined', 'expired', 'superseded', 'withdrawn'],
  accepted: [], declined: [], expired: [], superseded: [], withdrawn: []
});

const MACHINES = { offer: OFFER_TRANSITIONS, order: ORDER_TRANSITIONS, purchase: PURCHASE_TRANSITIONS, session: SESSION_TRANSITIONS, proposal: PROPOSAL_TRANSITIONS };

const canTransition = (machine, from, to) => Boolean(MACHINES[machine] && MACHINES[machine][from] && MACHINES[machine][from].includes(to));

module.exports = { OFFER_TRANSITIONS, ORDER_TRANSITIONS, PURCHASE_TRANSITIONS, SESSION_TRANSITIONS, PROPOSAL_TRANSITIONS, canTransition };
