-- ==============================================
-- SPANISHNOW: Complete TPRS Activities System
-- Migration: All Phases (1-4)
-- Date: 2026-01-10
-- ==============================================

-- ============================================
-- FASE 1: Preguntas de Comprensión
-- ============================================

-- Create question_responses table
CREATE TABLE IF NOT EXISTS question_responses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  progressId INT NOT NULL,
  questionId INT NOT NULL,
  studentAnswer VARCHAR(200) NOT NULL,
  isCorrect BOOLEAN NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_question_responses_progress
    FOREIGN KEY (progressId)
    REFERENCES progress(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_question_responses_question
    FOREIGN KEY (questionId)
    REFERENCES questions(id)
    ON DELETE CASCADE,

  CONSTRAINT unique_progress_question
    UNIQUE (progressId, questionId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add activitiesCompleted column to progress table
-- Check and add column only if it doesn't exist
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'progress'
               AND COLUMN_NAME = 'activitiesCompleted');

SET @sqlstmt := IF(@exist > 0,
                   'SELECT ''Column activitiesCompleted already exists'' AS Status',
                   'ALTER TABLE progress ADD COLUMN activitiesCompleted BOOLEAN NOT NULL DEFAULT FALSE');

PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create indexes for better query performance
-- Index on progressId
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
               WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'question_responses'
               AND INDEX_NAME = 'idx_question_responses_progress');
SET @sqlstmt := IF(@exist > 0, 'SELECT ''Index idx_question_responses_progress already exists''',
                   'CREATE INDEX idx_question_responses_progress ON question_responses(progressId)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index on questionId
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
               WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'question_responses'
               AND INDEX_NAME = 'idx_question_responses_question');
SET @sqlstmt := IF(@exist > 0, 'SELECT ''Index idx_question_responses_question already exists''',
                   'CREATE INDEX idx_question_responses_question ON question_responses(questionId)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- FASE 2: Vocabulario Enriquecido
-- ============================================

-- Add enrichment fields to vocabulary table
-- Check and add example column
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'vocabulary'
               AND COLUMN_NAME = 'example');
SET @sqlstmt := IF(@exist > 0, 'SELECT ''Column example already exists''',
                   'ALTER TABLE vocabulary ADD COLUMN example TEXT COMMENT ''Example sentence using the word''');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Check and add partOfSpeech column
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'vocabulary'
               AND COLUMN_NAME = 'partOfSpeech');
SET @sqlstmt := IF(@exist > 0, 'SELECT ''Column partOfSpeech already exists''',
                   'ALTER TABLE vocabulary ADD COLUMN partOfSpeech VARCHAR(50) COMMENT ''noun, verb, adjective, adverb, etc.''');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Check and add audioUrl column
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'vocabulary'
               AND COLUMN_NAME = 'audioUrl');
SET @sqlstmt := IF(@exist > 0, 'SELECT ''Column audioUrl already exists''',
                   'ALTER TABLE vocabulary ADD COLUMN audioUrl VARCHAR(500) COMMENT ''URL to pronunciation audio file''');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Check and add imageUrl column
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'vocabulary'
               AND COLUMN_NAME = 'imageUrl');
SET @sqlstmt := IF(@exist > 0, 'SELECT ''Column imageUrl already exists''',
                   'ALTER TABLE vocabulary ADD COLUMN imageUrl VARCHAR(500) COMMENT ''URL to visual representation image''');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create index for better query performance on partOfSpeech
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
               WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'vocabulary'
               AND INDEX_NAME = 'idx_vocabulary_part_of_speech');
SET @sqlstmt := IF(@exist > 0, 'SELECT ''Index idx_vocabulary_part_of_speech already exists''',
                   'CREATE INDEX idx_vocabulary_part_of_speech ON vocabulary(partOfSpeech)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- FASE 4: Listen & Repeat
-- ============================================

-- Create repetition_activities table
CREATE TABLE IF NOT EXISTS repetition_activities (
  id INT PRIMARY KEY AUTO_INCREMENT,
  storyId INT NOT NULL,
  phrase TEXT NOT NULL COMMENT 'Spanish phrase to repeat',
  audioUrl VARCHAR(500) COMMENT 'URL to model pronunciation audio',
  `order` INT NOT NULL DEFAULT 0 COMMENT 'Display order within the story',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_repetition_activities_story
    FOREIGN KEY (storyId)
    REFERENCES stories(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create indexes for better query performance
-- Index on storyId
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
               WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'repetition_activities'
               AND INDEX_NAME = 'idx_repetition_activities_story');
SET @sqlstmt := IF(@exist > 0, 'SELECT ''Index idx_repetition_activities_story already exists''',
                   'CREATE INDEX idx_repetition_activities_story ON repetition_activities(storyId)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index on order
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
               WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'repetition_activities'
               AND INDEX_NAME = 'idx_repetition_activities_order');
SET @sqlstmt := IF(@exist > 0, 'SELECT ''Index idx_repetition_activities_order already exists''',
                   'CREATE INDEX idx_repetition_activities_order ON repetition_activities(`order`)');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- Summary of Changes
-- ============================================
--
-- Tables Created:
-- 1. question_responses - Tracks student answers to comprehension questions
-- 2. repetition_activities - Listen & repeat phrases for pronunciation practice
--
-- Tables Modified:
-- 1. progress - Added activitiesCompleted flag
-- 2. vocabulary - Added example, partOfSpeech, audioUrl, imageUrl fields
--
-- Indexes Created:
-- - question_responses (progressId, questionId)
-- - vocabulary (partOfSpeech)
-- - repetition_activities (storyId, order)
--
-- ============================================
-- Features Enabled:
-- ============================================
--
-- FASE 1: Comprehension Questions
-- - Yes/No questions
-- - Multiple choice questions
-- - Automatic validation
-- - Progress tracking with activitiesCompleted flag
-- - Retry incorrect answers
-- - Mandatory completion before advancing
--
-- FASE 2: Enhanced Vocabulary
-- - Example sentences
-- - Grammatical classification (part of speech)
-- - Audio pronunciation
-- - Visual images
--
-- FASE 3: Interactive Vocabulary Activities
-- - Flashcards (frontend only, no DB changes)
-- - Matching game (frontend only, no DB changes)
--
-- FASE 4: Listen & Repeat
-- - Model audio playback
-- - Voice recording
-- - Self-evaluation
-- - Pronunciation practice
--
-- ============================================

SELECT 'TPRS Activities System Migration Completed Successfully!' as Status;
