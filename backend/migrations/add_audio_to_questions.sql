-- Add audioUrl field to questions table
ALTER TABLE questions
ADD COLUMN audioUrl VARCHAR(500) NULL
COMMENT 'URL for question audio file';

-- Verify the column was added
DESCRIBE questions;
