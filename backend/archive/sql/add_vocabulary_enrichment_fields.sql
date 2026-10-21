-- Migration: Add enrichment fields to vocabulary table
-- Date: 2026-01-10
-- Description: Extends vocabulary with examples, part of speech, audio, and images for Phase 2

-- Add new columns to vocabulary table
ALTER TABLE vocabulary
ADD COLUMN example TEXT COMMENT 'Example sentence using the word',
ADD COLUMN partOfSpeech VARCHAR(50) COMMENT 'noun, verb, adjective, adverb, etc.',
ADD COLUMN audioUrl VARCHAR(500) COMMENT 'URL to pronunciation audio file',
ADD COLUMN imageUrl VARCHAR(500) COMMENT 'URL to visual representation image';

-- Create index for better query performance on partOfSpeech
CREATE INDEX idx_vocabulary_part_of_speech ON vocabulary(partOfSpeech);
