-- Migration: Add granular activity tracking to Progress table
-- Date: 2026-01-15
-- Description: Adds individual tracking fields for flashcards, questions, matching, and listen-repeat activities

-- Add new columns to progress table
ALTER TABLE progress
ADD COLUMN flashcardsViewed BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN questionsCompleted BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN matchingCompleted BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN listenRepeatCompleted BOOLEAN NOT NULL DEFAULT false;

-- Optionally update existing records where activitiesCompleted is true
-- to mark all granular activities as completed (backward compatibility)
UPDATE progress
SET
  flashcardsViewed = true,
  questionsCompleted = true,
  matchingCompleted = true,
  listenRepeatCompleted = true
WHERE activitiesCompleted = true;
