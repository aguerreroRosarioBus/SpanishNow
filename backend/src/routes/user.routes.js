const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth.middleware');
const { User, Course } = require('../models');
const sequelize = require('../config/database');
const { hasPermission } = require('../config/permissions');

// Get all teachers with their course count. The email is private: only the teacher themself or someone with
// permission to manage users sees it (A-07); everyone else (students, other teachers) gets name and course count.
router.get('/teachers', authMiddleware, async (req, res) => {
  try {
    const teachers = await User.findAll({
      where: { role: 'teacher' },
      attributes: [
        'id',
        'name',
        'email',
        [sequelize.fn('COUNT', sequelize.col('courses.id')), 'coursesCount']
      ],
      include: [
        {
          model: Course,
          as: 'courses',
          attributes: []
        }
      ],
      group: ['User.id'],
      order: [['name', 'ASC']]
    });

    const canSeeEmails = hasPermission(req.user, 'users.manage');
    res.json(teachers.map(teacher => {
      const { email, ...visible } = teacher.get({ plain: true });
      return canSeeEmails || teacher.id === req.user.id ? { ...visible, email } : visible;
    }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
