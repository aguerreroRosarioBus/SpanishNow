// Admin panel API: users, roles, permissions, suspension and test accounts (see docs/admin/SPEC.md).
const express = require('express');
const router = express.Router();
const { authMiddleware, requirePermission } = require('../middlewares/auth.middleware');
const { PERMISSIONS } = require('../config/permissions');
const admin = require('../services/adminUsers');

router.use(authMiddleware);

// Turns the service's AdminError into its status; anything else is a 500.
const handle = action => async (req, res) => {
  try {
    res.status(action.status || 200).json(await action(req));
  } catch (error) {
    if (error instanceof admin.AdminError) return res.status(error.statusCode).json({ error: error.message });
    console.error('Admin request failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
const created = action => Object.assign(action, { status: 201 });

const manageUsers = requirePermission('users.manage');
const manageTestUsers = requirePermission('test_users.manage');

router.get('/permissions', requirePermission('users.manage', 'test_users.manage'), handle(() => PERMISSIONS));

router.get('/users', requirePermission('users.manage', 'test_users.manage'), handle(req => admin.listUsers(req.user, req.query)));

router.patch('/users/:id', manageUsers, handle(req => admin.updateUser(req.user, admin.parseId(req.params.id), req.body || {})));

router.post('/test-users', manageTestUsers, handle(created(req => admin.createTestUsers(req.user, req.body || {}))));

router.post('/users/:id/impersonate', manageTestUsers, handle(req => admin.impersonate(req.user, admin.parseId(req.params.id))));

router.delete('/test-users/:id', manageTestUsers, handle(async req => ({ deleted: await admin.deleteTestUser(admin.parseId(req.params.id)) })));

router.delete('/test-users', manageTestUsers, handle(async () => ({ deleted: await admin.deleteAllTestUsers() })));

module.exports = router;
