-- Add 'open_ended' to answerType ENUM and make correctAnswer nullable

-- Step 1: Modify the ENUM to include 'open_ended'
ALTER TABLE questions
MODIFY COLUMN answerType ENUM('yes_no', 'choice', 'open_ended') NOT NULL DEFAULT 'yes_no';

-- Step 2: Make correctAnswer nullable (for open_ended questions)
ALTER TABLE questions
MODIFY COLUMN correctAnswer VARCHAR(200) NULL
COMMENT 'Correct answer for yes_no and choice questions. Optional for open_ended questions.';

-- Verify changes
DESCRIBE questions;
