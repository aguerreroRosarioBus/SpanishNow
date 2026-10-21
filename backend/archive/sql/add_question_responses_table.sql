-- Migration: Add question_responses table and update progress table
-- Date: 2026-01-10
-- Description: Implements activity tracking system for TPRS comprehension questions

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
ALTER TABLE progress
ADD COLUMN activitiesCompleted BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for better query performance
CREATE INDEX idx_question_responses_progress ON question_responses(progressId);
CREATE INDEX idx_question_responses_question ON question_responses(questionId);
