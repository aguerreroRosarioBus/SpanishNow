const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { slugify, uniqueSlug } = require('../utils/slug');

const Course = sequelize.define('Course', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  level: {
    type: DataTypes.ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2'),
    allowNull: false
  },
  teacherId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  imageUrl: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  // Public URL of the sales page. Generated from the title when missing (see hook below).
  slug: {
    type: DataTypes.STRING(160),
    allowNull: true,
    unique: true
  },
  // In cents. 0 = free.
  price: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'usd'
  },
  isPublished: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  salesDescription: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Welcome video: normalised embed URL (YouTube, Vimeo or Bunny), see utils/videoUrl.js.
  introVideoUrl: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  // Series: the course offered after this one (same teacher) and the coupon offered with it.
  nextCourseId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'courses', key: 'id' }
  },
  nextCourseCouponId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'coupons', key: 'id' }
  }
}, {
  timestamps: true,
  tableName: 'courses',
  hooks: {
    // A course always ends up with a slug once saved, so publishing never leaves a page without URL.
    beforeSave: async (course) => {
      if (course.slug || !course.title) return;
      const { Op } = require('sequelize');
      const base = slugify(course.title);
      course.slug = await uniqueSlug(base, async candidate => Boolean(await Course.findOne({
        where: { slug: candidate, ...(course.id ? { id: { [Op.ne]: course.id } } : {}) },
        attributes: ['id']
      })));
    }
  }
});

module.exports = Course;
