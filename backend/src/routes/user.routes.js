const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth.middleware');
const { User, Course } = require('../models');
const { sequelize } = require('../config/database');

// Get all teachers with their course count
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

    res.json(teachers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
