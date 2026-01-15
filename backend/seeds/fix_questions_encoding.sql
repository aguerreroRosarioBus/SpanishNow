-- Fix question texts with clean ASCII encoding
-- Remove special characters (accents, tildes, inverted punctuation)

-- Story 1: Maria en la Fiesta
UPDATE questions SET questionText = 'Donde esta Maria?' WHERE id = 1;
UPDATE questions SET
    questionText = 'Como se llama el amigo de Maria?',
    options = '["Pedro", "Juan", "Luis"]',
    correctAnswer = 'Juan'
WHERE id = 2;

UPDATE questions SET
    questionText = 'Maria y Juan son amigos?',
    answerType = 'yes_no',
    correctAnswer = 'Si'
WHERE id = 6;

-- Story 2: El Primer Dia de Clase
UPDATE questions SET
    questionText = 'Como se llama la profesora?',
    options = '["Maria", "Ana", "Laura"]',
    correctAnswer = 'Ana'
WHERE id = 3;

UPDATE questions SET
    questionText = 'De donde es Pedro?',
    options = '["Espana", "Argentina", "Mexico"]',
    correctAnswer = 'Mexico'
WHERE id = 4;

-- Story 3: En el Cafe
UPDATE questions SET
    questionText = 'Que pide Luis?',
    options = '["Un te", "Un cafe", "Una soda"]',
    correctAnswer = 'Un cafe'
WHERE id = 5;

-- Verify the changes
SELECT id, questionText, answerType, correctAnswer
FROM questions
WHERE id IN (1,2,3,4,5,6)
ORDER BY id;
