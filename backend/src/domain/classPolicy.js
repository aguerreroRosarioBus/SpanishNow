// Versioned commercial rules (SPEC §4, CONTRATO.md §5). Initial values chosen under D09; stored in class_policy_versions.

const DEFAULT_POLICY_V1 = Object.freeze({
  validityHoursBySessions: { 1: 720, 4: 2160 },
  offerTtlHours: 168,
  proposalLeadHours: 24,
  proposalTtlHours: 24,
  proposalCutoffBeforeStartHours: 2,
  freeCancelHours: 24,
  arrivalToleranceMinutes: 10,
  maxPauseHours: 720,
  maxPauses: 1,
  renewalSuggestWhenUnitsLeft: 1,
  renewalSuggestHoursBeforeExpiry: 168,
  refundWindowHours: 336,
  remindersBeforeStartMinutes: [1440, 60],
  teacherBufferMinutes: 10,
  groupFormingMaxHours: 168,
  groupFormingCutoffBeforeStartHours: 2,
  chatLimits: { newConversationsPerDay: 5, messagesPerHourBeforeReply: 10, messagesPerHourPerConversation: 60, teacherMessagesPerHourPerConversation: 120 },
  chatMaxMessageLength: 2000
});

const INTEGER_KEYS = [
  'offerTtlHours', 'proposalLeadHours', 'proposalTtlHours', 'proposalCutoffBeforeStartHours', 'freeCancelHours',
  'arrivalToleranceMinutes', 'maxPauseHours', 'maxPauses', 'renewalSuggestWhenUnitsLeft', 'renewalSuggestHoursBeforeExpiry',
  'refundWindowHours', 'teacherBufferMinutes', 'groupFormingMaxHours', 'groupFormingCutoffBeforeStartHours', 'chatMaxMessageLength'
];
const CHAT_KEYS = ['newConversationsPerDay', 'messagesPerHourBeforeReply', 'messagesPerHourPerConversation', 'teacherMessagesPerHourPerConversation'];

const isCount = value => Number.isSafeInteger(value) && value >= 0;

/** Returns a list of problems (empty = valid). Unknown keys are problems too, so a typo never passes silently. */
function validatePolicy(rules) {
  const errors = [];
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return ['rules must be an object'];
  const known = new Set([...INTEGER_KEYS, 'validityHoursBySessions', 'remindersBeforeStartMinutes', 'chatLimits', 'refundMode']);
  if (rules.refundMode !== undefined && (rules.refundMode !== 'full_unused_then_review' || rules.refundWindowHours < 360)) errors.push('refundMode requires full_unused_then_review and at least 360 hours');
  for (const key of Object.keys(rules)) if (!known.has(key)) errors.push(`unknown key ${key}`);
  for (const key of INTEGER_KEYS) if (!isCount(rules[key])) errors.push(`${key} must be a non-negative integer`);
  const validity = rules.validityHoursBySessions;
  if (!validity || typeof validity !== 'object' || !Object.keys(validity).length) errors.push('validityHoursBySessions must map session counts to hours');
  else for (const [count, hours] of Object.entries(validity)) {
    if (!/^[1-9]\d*$/.test(count) || !Number.isSafeInteger(hours) || hours <= 0) errors.push(`validityHoursBySessions.${count} must be positive hours`);
  }
  const reminders = rules.remindersBeforeStartMinutes;
  if (!Array.isArray(reminders) || reminders.some(m => !Number.isSafeInteger(m) || m <= 0) || new Set(reminders).size !== (reminders || []).length) {
    errors.push('remindersBeforeStartMinutes must be distinct positive minutes');
  }
  const chat = rules.chatLimits;
  if (!chat || typeof chat !== 'object') errors.push('chatLimits is required');
  else for (const key of CHAT_KEYS) if (!Number.isSafeInteger(chat[key]) || chat[key] <= 0) errors.push(`chatLimits.${key} must be a positive integer`);
  if (isCount(rules.chatMaxMessageLength) && rules.chatMaxMessageLength === 0) errors.push('chatMaxMessageLength must be positive');
  return errors;
}

/** Validity of a package with `sessions` sessions, in hours; null when the policy has no rule for it. */
const validityHoursFor = (rules, sessions) => (rules.validityHoursBySessions && rules.validityHoursBySessions[sessions]) || null;

module.exports = { DEFAULT_POLICY_V1, validatePolicy, validityHoursFor };
