// Private chat (CONTRATO.md §9.2). Mounted at /api/conversations; `teachers` at /api/teachers and `moderation` at
// /api/admin. Creating conversations and sending messages need FEATURE_CHAT=1; reading what already exists, marking
// read, blocking and reporting do not, so turning the module off never hides a history (§11).
// "Sign in as" sessions get 403: impersonating someone never opens their private messages (CHAT-02).
const express = require('express');
const { authMiddleware, requirePermission } = require('../middlewares/auth.middleware');
const { requireFeature } = require('../config/features');
const chat = require('../services/chatService');
const { sendRateLimited } = require('../services/rateLimit');

function handle(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (sendRateLimited(res, error)) return;
      next(error); // ChatError carries statusCode, code and params for the common error middleware
    }
  };
}

const noImpersonation = (req, res, next) => (req.impersonatedBy
  ? res.status(403).json({ error: 'Los mensajes privados no están disponibles al ingresar como otra persona', code: 'forbidden', params: { reason: 'impersonation' } })
  : next());

const conversations = express.Router();
conversations.use(authMiddleware, noImpersonation);

conversations.get('/', handle(async (req, res) => {
  res.json(await chat.listConversations(req.user, { cursor: req.query.cursor, limit: req.query.limit }));
}));

conversations.get('/unread', handle(async (req, res) => {
  res.json(await chat.unreadSummary(req.user));
}));

conversations.post('/', requireFeature('chat'), handle(async (req, res) => {
  const { teacherId, context } = req.body || {};
  const { conversation, created } = await chat.startConversation(req.user, { teacherId, context }, { ip: req.ip });
  res.status(created ? 201 : 200).json(conversation);
}));

conversations.get('/:id', handle(async (req, res) => {
  res.json(await chat.getConversation(req.user, req.params.id));
}));

conversations.get('/:id/messages', handle(async (req, res) => {
  const { beforeSeq, afterSeq, limit } = req.query;
  res.json(await chat.listMessages(req.user, req.params.id, { beforeSeq, afterSeq, limit }));
}));

conversations.post('/:id/messages', requireFeature('chat'), handle(async (req, res) => {
  const { clientMessageId, body, context } = req.body || {};
  const { message, created } = await chat.sendMessage(req.user, req.params.id, { clientMessageId, body, context }, { ip: req.ip });
  res.status(created ? 201 : 200).json(message);
}));

conversations.post('/:id/read', handle(async (req, res) => {
  res.json(await chat.markRead(req.user, req.params.id, (req.body || {}).seq));
}));

conversations.post('/:id/block', handle(async (req, res) => {
  res.json(await chat.setBlocked(req.user, req.params.id, true));
}));

conversations.delete('/:id/block', handle(async (req, res) => {
  res.json(await chat.setBlocked(req.user, req.params.id, false));
}));

conversations.post('/:id/report', handle(async (req, res) => {
  res.json(await chat.report(req.user, req.params.id, (req.body || {}).reason));
}));

const teachers = express.Router();
teachers.get('/available', authMiddleware, requireFeature('chat'), handle(async (req, res) => {
  res.json(await chat.listAvailableTeachers());
}));

// chat.moderate: reported conversations only (requirePermission also refuses "sign in as" sessions).
const moderation = express.Router();
moderation.use('/chat', authMiddleware, requirePermission('chat.moderate'));
moderation.use('/messages', authMiddleware, requirePermission('chat.moderate'));

moderation.get('/chat/reports', handle(async (req, res) => {
  res.json(await chat.listReports());
}));

moderation.get('/chat/reports/:conversationId/messages', handle(async (req, res) => {
  const { beforeSeq, limit } = req.query;
  res.json(await chat.readReportedMessages(req.user, req.params.conversationId, { beforeSeq, limit }));
}));

moderation.post('/messages/:id/hide', handle(async (req, res) => {
  res.json(await chat.hideMessage(req.user, req.params.id, (req.body || {}).reason));
}));

module.exports = { conversations, teachers, moderation };
