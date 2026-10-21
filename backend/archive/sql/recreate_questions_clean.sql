-- Delete all existing questions and recreate with clean ASCII
DELETE FROM questions WHERE storyId IN (1, 2, 3);

-- Story 1: Maria en la Fiesta (id=1)
INSERT INTO questions (storyId, questionText, answerType, options, correctAnswer, createdAt, updatedAt) VALUES
(1, 'Donde esta Maria?', 'yes_no', NULL, 'En una fiesta', NOW(), NOW()),
(1, 'Como se llama el amigo de Maria?', 'choice', '["Pedro", "Juan", "Luis"]', 'Juan', NOW(), NOW()),
(1, 'Maria y Juan son amigos?', 'yes_no', NULL, 'Si', NOW(), NOW());

-- Story 2: El Primer Dia de Clase (id=2)
INSERT INTO questions (storyId, questionText, answerType, options, correctAnswer, createdAt, updatedAt) VALUES
(2, 'Como se llama la profesora?', 'choice', '["Maria", "Ana", "Laura"]', 'Ana', NOW(), NOW()),
(2, 'De donde es Pedro?', 'choice', '["Espana", "Argentina", "Mexico"]', 'Mexico', NOW(), NOW());

-- Story 3: En el Cafe (id=3)
INSERT INTO questions (storyId, questionText, answerType, options, correctAnswer, createdAt, updatedAt) VALUES
(3, 'Que pide Luis?', 'choice', '["Un te", "Un cafe", "Una soda"]', 'Un cafe', NOW(), NOW());

-- Verify
SELECT id, storyId, questionText, answerType, correctAnswer
FROM questions
WHERE storyId IN (1, 2, 3)
ORDER BY storyId, id;
