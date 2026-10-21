-- Seed: Curso de ejemplo - Spanish Now
-- Charset: UTF-8

-- Insertar curso
INSERT INTO courses (id, teacherId, title, description, level, createdAt, updatedAt)
VALUES (1, 1, 'Espanol Basico A1', 'Curso introductorio de espanol para principiantes', 'A1', NOW(), NOW());

-- ===== UNIDAD 1: La Familia =====
INSERT INTO units (id, courseId, title, description, `order`, createdAt, updatedAt)
VALUES (1, 1, 'La Familia', 'Aprende vocabulario sobre la familia', 0, NOW(), NOW());

-- Historia 1.1: Mi Familia
INSERT INTO stories (id, unitId, title, text, `order`, createdAt, updatedAt)
VALUES (1, 1, 'Mi Familia', 'Hola, me llamo Maria. Tengo una familia grande. Mi padre se llama Carlos y mi madre se llama Ana. Tengo dos hermanos: Pedro y Sofia. Pedro tiene diez anos y Sofia tiene ocho anos. Tambien tengo un perro que se llama Max. Vivimos en una casa grande en la ciudad.', 0, NOW(), NOW());

-- Preguntas para Historia 1.1
INSERT INTO questions (id, storyId, questionText, answerType, correctAnswer, createdAt, updatedAt)
VALUES
(1, 1, 'Como se llama la narradora?', 'choice', 'Maria', NOW(), NOW()),
(2, 1, 'Cuantos hermanos tiene Maria?', 'choice', 'Dos', NOW(), NOW()),
(3, 1, 'Como se llama el perro?', 'choice', 'Max', NOW(), NOW());

-- Opciones para las preguntas
UPDATE questions SET options = '["Maria", "Ana", "Sofia", "Carlos"]' WHERE id = 1;
UPDATE questions SET options = '["Uno", "Dos", "Tres", "Cuatro"]' WHERE id = 2;
UPDATE questions SET options = '["Max", "Rex", "Bruno", "Toby"]' WHERE id = 3;

-- ActivityConfigs para Historia 1.1
INSERT INTO activity_configs (storyId, activityType, `order`, isEnabled, requiredStoryIds, createdAt, updatedAt)
VALUES
(1, 'questions', 100, 1, '[]', NOW(), NOW()),
(1, 'flashcards', 200, 1, '[]', NOW(), NOW()),
(1, 'matching', 300, 1, '[]', NOW(), NOW()),
(1, 'listen_repeat', 400, 1, '[]', NOW(), NOW());

-- Historia 1.2: En Casa
INSERT INTO stories (id, unitId, title, text, `order`, createdAt, updatedAt)
VALUES (2, 1, 'En Casa', 'Mi casa tiene tres dormitorios y dos banos. La cocina es muy grande. Mi dormitorio es azul y tengo muchos juguetes. Mi hermano Pedro tiene un dormitorio verde. Sofia comparte el dormitorio con nuestra abuela. El salon es el lugar favorito de mi familia porque vemos television juntos.', 1, NOW(), NOW());

-- Preguntas para Historia 1.2
INSERT INTO questions (id, storyId, questionText, answerType, correctAnswer, createdAt, updatedAt)
VALUES
(4, 2, 'Cuantos dormitorios tiene la casa?', 'choice', 'Tres', NOW(), NOW()),
(5, 2, 'De que color es el dormitorio de Maria?', 'choice', 'Azul', NOW(), NOW()),
(6, 2, 'Que hace la familia en el salon?', 'choice', 'Ver television', NOW(), NOW());

UPDATE questions SET options = '["Dos", "Tres", "Cuatro", "Cinco"]' WHERE id = 4;
UPDATE questions SET options = '["Rojo", "Azul", "Verde", "Amarillo"]' WHERE id = 5;
UPDATE questions SET options = '["Comer", "Ver television", "Dormir", "Estudiar"]' WHERE id = 6;

-- ActivityConfigs para Historia 1.2
INSERT INTO activity_configs (storyId, activityType, `order`, isEnabled, requiredStoryIds, createdAt, updatedAt)
VALUES
(2, 'questions', 100, 1, '[]', NOW(), NOW()),
(2, 'flashcards', 200, 1, '[]', NOW(), NOW()),
(2, 'matching', 300, 1, '[]', NOW(), NOW()),
(2, 'listen_repeat', 400, 1, '[]', NOW(), NOW());

-- ===== UNIDAD 2: La Escuela =====
INSERT INTO units (id, courseId, title, description, `order`, createdAt, updatedAt)
VALUES (2, 1, 'La Escuela', 'Vocabulario sobre la escuela y los estudios', 1, NOW(), NOW());

-- Historia 2.1: Mi Escuela
INSERT INTO stories (id, unitId, title, text, `order`, createdAt, updatedAt)
VALUES (3, 2, 'Mi Escuela', 'Voy a la escuela todos los dias. Mi escuela es grande y tiene muchos estudiantes. Mi profesor favorito es el senor Lopez. El ensena matematicas. Tambien me gusta la clase de arte. En el recreo juego al futbol con mis amigos. La biblioteca es mi lugar favorito para leer libros.', 0, NOW(), NOW());

-- Preguntas para Historia 2.1
INSERT INTO questions (id, storyId, questionText, answerType, correctAnswer, createdAt, updatedAt)
VALUES
(7, 3, 'Como se llama el profesor de matematicas?', 'choice', 'Senor Lopez', NOW(), NOW()),
(8, 3, 'Que juega Maria en el recreo?', 'choice', 'Futbol', NOW(), NOW()),
(9, 3, 'Cual es el lugar favorito de Maria en la escuela?', 'choice', 'La biblioteca', NOW(), NOW());

UPDATE questions SET options = '["Senor Lopez", "Senor Garcia", "Senor Martinez", "Senor Rodriguez"]' WHERE id = 7;
UPDATE questions SET options = '["Baloncesto", "Futbol", "Tenis", "Voleibol"]' WHERE id = 8;
UPDATE questions SET options = '["El gimnasio", "La cafeteria", "La biblioteca", "El patio"]' WHERE id = 9;

-- ActivityConfigs para Historia 2.1
INSERT INTO activity_configs (storyId, activityType, `order`, isEnabled, requiredStoryIds, createdAt, updatedAt)
VALUES
(3, 'questions', 100, 1, '[]', NOW(), NOW()),
(3, 'flashcards', 200, 1, '[]', NOW(), NOW()),
(3, 'matching', 300, 1, '[]', NOW(), NOW()),
(3, 'listen_repeat', 400, 1, '[]', NOW(), NOW());

-- Vocabulario para las unidades
INSERT INTO vocabulary (unitId, word, translation, example, createdAt, updatedAt)
VALUES
-- Unidad 1: La Familia
(1, 'familia', 'family', 'Mi familia es grande.', NOW(), NOW()),
(1, 'padre', 'father', 'Mi padre trabaja mucho.', NOW(), NOW()),
(1, 'madre', 'mother', 'Mi madre cocina bien.', NOW(), NOW()),
(1, 'hermano', 'brother', 'Mi hermano es alto.', NOW(), NOW()),
(1, 'hermana', 'sister', 'Mi hermana es pequeña.', NOW(), NOW()),
(1, 'casa', 'house', 'Vivo en una casa.', NOW(), NOW()),
(1, 'perro', 'dog', 'Tengo un perro.', NOW(), NOW()),
(1, 'dormitorio', 'bedroom', 'Mi dormitorio es azul.', NOW(), NOW()),
-- Unidad 2: La Escuela
(2, 'escuela', 'school', 'Voy a la escuela.', NOW(), NOW()),
(2, 'profesor', 'teacher', 'El profesor ensena bien.', NOW(), NOW()),
(2, 'estudiante', 'student', 'Soy un estudiante.', NOW(), NOW()),
(2, 'libro', 'book', 'Leo un libro.', NOW(), NOW()),
(2, 'clase', 'class', 'La clase es interesante.', NOW(), NOW()),
(2, 'recreo', 'recess', 'Juego en el recreo.', NOW(), NOW()),
(2, 'biblioteca', 'library', 'Estudio en la biblioteca.', NOW(), NOW()),
(2, 'amigo', 'friend', 'Tengo muchos amigos.', NOW(), NOW());

SELECT 'Curso de ejemplo creado exitosamente' as status;
