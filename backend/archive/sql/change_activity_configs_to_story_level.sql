-- Migration: Change activity_configs from unit-level to story-level
-- This migration changes activity configurations to be per-story instead of per-unit

-- Step 1: Drop existing activity_configs (they are unit-level, we need story-level)
DELETE FROM activity_configs;

-- Step 2: Drop indexes on unitId (no foreign key exists)
ALTER TABLE activity_configs DROP INDEX activity_configs_unit_id;
ALTER TABLE activity_configs DROP INDEX activity_configs_unit_id_order;

-- Step 3: Drop unitId column
ALTER TABLE activity_configs DROP COLUMN unitId;

-- Step 4: Add storyId column with foreign key
ALTER TABLE activity_configs
ADD COLUMN storyId INT NOT NULL AFTER id,
ADD CONSTRAINT fk_activity_configs_story
  FOREIGN KEY (storyId) REFERENCES stories(id) ON DELETE CASCADE;

-- Step 5: Create new indexes
CREATE INDEX idx_activity_configs_story ON activity_configs(storyId);
CREATE UNIQUE INDEX unique_story_activity ON activity_configs(storyId, activityType);

-- Step 6: Create default activity configs for all existing stories
-- For each story, create 4 activities (questions, flashcards, matching, listen_repeat)

-- Unit 1 stories
INSERT INTO activity_configs (storyId, activityType, isEnabled, `order`, requiredStoryIds, createdAt, updatedAt)
VALUES
-- Story 2 (El Primer Dia de Clase)
(2, 'questions', 1, 100, '[]', NOW(), NOW()),
(2, 'flashcards', 1, 200, '[]', NOW(), NOW()),
(2, 'matching', 1, 300, '[]', NOW(), NOW()),
(2, 'listen_repeat', 1, 400, '[]', NOW(), NOW()),

-- Story 3 (En el Cafe)
(3, 'questions', 1, 100, '[]', NOW(), NOW()),
(3, 'flashcards', 1, 200, '[]', NOW(), NOW()),
(3, 'matching', 1, 300, '[]', NOW(), NOW()),
(3, 'listen_repeat', 1, 400, '[]', NOW(), NOW()),

-- Story 1 (Maria en la Fiesta)
(1, 'questions', 1, 100, '[]', NOW(), NOW()),
(1, 'flashcards', 1, 200, '[]', NOW(), NOW()),
(1, 'matching', 1, 300, '[]', NOW(), NOW()),
(1, 'listen_repeat', 1, 400, '[]', NOW(), NOW()),

-- Unit 2 stories
-- Story 4 (La Familia de Carlos)
(4, 'questions', 1, 100, '[]', NOW(), NOW()),
(4, 'flashcards', 1, 200, '[]', NOW(), NOW()),
(4, 'matching', 1, 300, '[]', NOW(), NOW()),
(4, 'listen_repeat', 1, 400, '[]', NOW(), NOW()),

-- Story 5 (El Gato de Ana)
(5, 'questions', 1, 100, '[]', NOW(), NOW()),
(5, 'flashcards', 1, 200, '[]', NOW(), NOW()),
(5, 'matching', 1, 300, '[]', NOW(), NOW()),
(5, 'listen_repeat', 1, 400, '[]', NOW(), NOW()),

-- Story 6 (El Perro Doctor)
(6, 'questions', 1, 100, '[]', NOW(), NOW()),
(6, 'flashcards', 1, 200, '[]', NOW(), NOW()),
(6, 'matching', 1, 300, '[]', NOW(), NOW()),
(6, 'listen_repeat', 1, 400, '[]', NOW(), NOW()),

-- Unit 3 stories
-- Story 7 (En el Restaurante)
(7, 'questions', 1, 100, '[]', NOW(), NOW()),
(7, 'flashcards', 1, 200, '[]', NOW(), NOW()),
(7, 'matching', 1, 300, '[]', NOW(), NOW()),
(7, 'listen_repeat', 1, 400, '[]', NOW(), NOW()),

-- Story 8 (El Mercado de Frutas)
(8, 'questions', 1, 100, '[]', NOW(), NOW()),
(8, 'flashcards', 1, 200, '[]', NOW(), NOW()),
(8, 'matching', 1, 300, '[]', NOW(), NOW()),
(8, 'listen_repeat', 1, 400, '[]', NOW(), NOW()),

-- Story 9 (La Fiesta de Cumpleanos)
(9, 'questions', 1, 100, '[]', NOW(), NOW()),
(9, 'flashcards', 1, 200, '[]', NOW(), NOW()),
(9, 'matching', 1, 300, '[]', NOW(), NOW()),
(9, 'listen_repeat', 1, 400, '[]', NOW(), NOW());
