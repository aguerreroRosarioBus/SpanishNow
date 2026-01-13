-- ==============================================
-- SPANISHNOW: Configurable Sequential Activities System
-- Migration: Activity Configs & Granular Progress Tracking
-- Date: 2026-01-13
-- ==============================================

-- ============================================
-- PART 1: Create activity_configs Table
-- ============================================

CREATE TABLE IF NOT EXISTS activity_configs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  storyId INT NOT NULL,
  activityType ENUM('flashcards', 'questions', 'matching', 'listen_repeat') NOT NULL,
  isEnabled BOOLEAN DEFAULT TRUE,
  `order` INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_activity_configs_story
    FOREIGN KEY (storyId)
    REFERENCES stories(id)
    ON DELETE CASCADE,

  CONSTRAINT unique_story_activity
    UNIQUE (storyId, activityType),

  INDEX idx_activity_configs_story (storyId),
  INDEX idx_activity_configs_order (`order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PART 2: Extend progress Table
-- ============================================

-- Add granular activity tracking columns
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'progress'
               AND COLUMN_NAME = 'flashcardsViewed');
SET @sqlstmt := IF(@exist > 0, 'SELECT ''Column flashcardsViewed already exists''',
                   'ALTER TABLE progress ADD COLUMN flashcardsViewed BOOLEAN DEFAULT FALSE');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'progress'
               AND COLUMN_NAME = 'questionsCompleted');
SET @sqlstmt := IF(@exist > 0, 'SELECT ''Column questionsCompleted already exists''',
                   'ALTER TABLE progress ADD COLUMN questionsCompleted BOOLEAN DEFAULT FALSE');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'progress'
               AND COLUMN_NAME = 'matchingCompleted');
SET @sqlstmt := IF(@exist > 0, 'SELECT ''Column matchingCompleted already exists''',
                   'ALTER TABLE progress ADD COLUMN matchingCompleted BOOLEAN DEFAULT FALSE');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'progress'
               AND COLUMN_NAME = 'listenRepeatCompleted');
SET @sqlstmt := IF(@exist > 0, 'SELECT ''Column listenRepeatCompleted already exists''',
                   'ALTER TABLE progress ADD COLUMN listenRepeatCompleted BOOLEAN DEFAULT FALSE');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- PART 3: Create Default Configs for Existing Stories
-- ============================================

-- Insert default activity configurations for all existing stories
-- This ensures backward compatibility

INSERT IGNORE INTO activity_configs (storyId, activityType, isEnabled, `order`)
SELECT id, 'flashcards', TRUE, 0 FROM stories;

INSERT IGNORE INTO activity_configs (storyId, activityType, isEnabled, `order`)
SELECT id, 'questions', TRUE, 1 FROM stories;

INSERT IGNORE INTO activity_configs (storyId, activityType, isEnabled, `order`)
SELECT id, 'matching', TRUE, 2 FROM stories;

INSERT IGNORE INTO activity_configs (storyId, activityType, isEnabled, `order`)
SELECT id, 'listen_repeat', TRUE, 3 FROM stories;

-- ============================================
-- Summary
-- ============================================
--
-- Tables Created:
-- 1. activity_configs - Stores configuration for activities per story
--
-- Tables Modified:
-- 1. progress - Added granular tracking columns:
--    - flashcardsViewed
--    - questionsCompleted
--    - matchingCompleted
--    - listenRepeatCompleted
--
-- Backward Compatibility:
-- - Existing stories get default activity configs (all enabled, default order)
-- - activitiesCompleted column maintained for compatibility
--
-- Features Enabled:
-- - Teacher can configure which activities are enabled per story
-- - Teacher can reorder activities visually (drag & drop)
-- - Student experiences sequential activity flow
-- - Granular progress tracking per activity type
-- - Optional progression ("Continue to next activity?" dialog)
--
-- ============================================

SELECT 'Activity Config System Migration Completed Successfully!' as Status;
