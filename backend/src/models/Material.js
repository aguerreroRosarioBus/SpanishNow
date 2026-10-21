const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// A downloadable PDF of a course, optionally attached to one unit or one story (never both).
// fileUrl is the storage location (private/authenticated in Cloudinary): it is never sent to the client, see services/materialService.js.
const Material = sequelize.define('Material', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  courseId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'courses', key: 'id' } },
  unitId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'units', key: 'id' } },
  storyId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'stories', key: 'id' } },
  title: { type: DataTypes.STRING(200), allowNull: false },
  fileUrl: { type: DataTypes.STRING(500), allowNull: false },
  // Cloudinary public id (raw, authenticated); null for local fake uploads.
  providerPublicId: { type: DataTypes.STRING(300), allowNull: true },
  sizeBytes: { type: DataTypes.INTEGER, allowNull: false },
  order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, {
  timestamps: true,
  tableName: 'materials',
  validate: {
    onlyOneParent() {
      if (this.unitId != null && this.storyId != null) throw new Error('A material belongs to a unit or to a story, not both');
    }
  }
});

module.exports = Material;
