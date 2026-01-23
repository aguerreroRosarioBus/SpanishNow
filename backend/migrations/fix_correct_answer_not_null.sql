-- Fix correctAnswer to be NOT NULL for all question types
-- open_ended questions use correctAnswer for student self-correction

-- Make correctAnswer NOT NULL again
ALTER TABLE questions
MODIFY COLUMN correctAnswer VARCHAR(200) NOT NULL
COMMENT 'Correct answer for all question types. For open_ended, used for student self-correction.';

-- Verify changes
DESCRIBE questions;
