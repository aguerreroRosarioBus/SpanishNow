-- Fix question content to match their stories

-- Story 1: Maria en la Fiesta
UPDATE questions SET questionText = '¿Donde esta Maria?' WHERE id = 1;
UPDATE questions SET
    questionText = '¿Como se llama el amigo de Maria?',
    options = '["Pedro", "Juan", "Luis"]',
    correctAnswer = 'Juan'
WHERE id = 2;

-- Story 2: El Primer Dia de Clase
UPDATE questions SET
    questionText = '¿Como se llama la profesora?',
    options = '["Maria", "Ana", "Laura"]',
    correctAnswer = 'Ana'
WHERE id = 3;

UPDATE questions SET
    questionText = '¿De donde es Pedro?',
    options = '["Espana", "Argentina", "Mexico"]',
    correctAnswer = 'Mexico'
WHERE id = 4;

-- Story 3: En el Cafe
UPDATE questions SET
    questionText = '¿Que pide Luis?',
    options = '["Un te", "Un cafe", "Una soda"]',
    correctAnswer = 'Un cafe'
WHERE id = 5;

-- Add missing question for Story 1
INSERT INTO questions (storyId, questionText, answerType, options, correctAnswer, createdAt, updatedAt) VALUES
(1, '¿Maria y Juan son amigos?', 'yes_no', NULL, 'Si', NOW(), NOW())
ON DUPLICATE KEY UPDATE questionText = VALUES(questionText);

-- Verify
SELECT q.id, s.title as story, q.questionText
FROM questions q
JOIN stories s ON q.storyId = s.id
WHERE s.unitId = 1
ORDER BY s.id, q.id;
