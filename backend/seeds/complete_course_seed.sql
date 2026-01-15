-- Complete Course Seed for Testing Navigation System
-- Creates a comprehensive course with 3 units, each with stories and activities

-- ==============================================
-- COURSE: Spanish A1 - Complete Edition
-- ==============================================

-- Ensure we have a teacher user (ID 1)
INSERT IGNORE INTO users (id, name, email, password, role, createdAt, updatedAt) VALUES
(1, 'Profesor Demo', 'teacher@demo.com', '$2b$10$abcdefghijklmnopqrstuvwxyz', 'teacher', NOW(), NOW());

-- Ensure we have a student user (ID 2)
INSERT IGNORE INTO users (id, name, email, password, role, createdAt, updatedAt) VALUES
(2, 'Estudiante Demo', 'student@demo.com', '$2b$10$abcdefghijklmnopqrstuvwxyz', 'student', NOW(), NOW());

-- Create course if it doesn't exist (or update if exists)
INSERT INTO courses (id, title, description, level, teacherId, imageUrl, createdAt, updatedAt) VALUES
(1, 'Español A1 - Completo', 'Curso completo con unidades, historias y actividades para probar el sistema de navegación', 'A1', 1, NULL, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  description = VALUES(description),
  updatedAt = NOW();

-- ==============================================
-- UNIT 1: Saludos y Presentaciones
-- ==============================================

INSERT INTO units (id, courseId, title, description, `order`, createdAt, updatedAt) VALUES
(1, 1, 'Unidad 1: Saludos y Presentaciones', 'Aprende a saludar y presentarte en español', 0, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  description = VALUES(description),
  updatedAt = NOW();

-- Unit 1 Stories
INSERT INTO stories (id, unitId, title, text, audioSlowUrl, audioNormalUrl, `order`, createdAt, updatedAt) VALUES
(1, 1, 'María en la Fiesta',
'María va a una fiesta. En la fiesta hay muchas personas. María ve a Juan. María dice: "Hola, ¿cómo te llamas?". Juan responde: "Me llamo Juan, ¿y tú?". María dice: "Yo me llamo María, mucho gusto". Juan y María son amigos ahora.',
NULL, NULL, 100, NOW(), NOW()),

(2, 1, 'El Primer Día de Clase',
'Hoy es el primer día de clase. La profesora se llama Ana. Ana dice: "Buenos días, yo soy la profesora Ana". Los estudiantes dicen: "Buenos días, profesora". Un estudiante se llama Pedro. Pedro dice: "Hola, me llamo Pedro, soy de México".',
NULL, NULL, 300, NOW(), NOW()),

(3, 1, 'En el Café',
'Luis entra en un café. El camarero dice: "Buenas tardes, ¿qué desea?". Luis responde: "Buenas tardes, un café por favor". El camarero pregunta: "¿Cómo se llama usted?". Luis dice: "Me llamo Luis". El camarero sonríe.',
NULL, NULL, 500, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  text = VALUES(text),
  `order` = VALUES(`order`),
  updatedAt = NOW();

-- Unit 1 Questions
INSERT INTO questions (id, storyId, questionText, answerType, options, correctAnswer, createdAt, updatedAt) VALUES
(1, 1, '¿Dónde está María?', 'choice', '["En una fiesta", "En casa", "En la escuela"]', 'En una fiesta', NOW(), NOW()),
(2, 1, '¿Cómo se llama el amigo de María?', 'choice', '["Pedro", "Juan", "Luis"]', 'Juan', NOW(), NOW()),
(3, 2, '¿Cómo se llama la profesora?', 'choice', '["María", "Ana", "Laura"]', 'Ana', NOW(), NOW()),
(4, 2, '¿De dónde es Pedro?', 'choice', '["España", "Argentina", "México"]', 'México', NOW(), NOW()),
(5, 3, '¿Qué pide Luis?', 'choice', '["Un té", "Un café", "Una soda"]', 'Un café', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  questionText = VALUES(questionText),
  options = VALUES(options),
  correctAnswer = VALUES(correctAnswer),
  updatedAt = NOW();

-- Unit 1 Vocabulary
INSERT INTO vocabulary (id, unitId, word, translation, example, partOfSpeech, createdAt, updatedAt) VALUES
(1, 1, 'Hola', 'Hello', 'Hola, ¿cómo estás?', 'interjection', NOW(), NOW()),
(2, 1, 'Me llamo', 'My name is', 'Me llamo María', 'phrase', NOW(), NOW()),
(3, 1, 'Mucho gusto', 'Nice to meet you', 'Mucho gusto, Juan', 'phrase', NOW(), NOW()),
(4, 1, 'Buenos días', 'Good morning', 'Buenos días, profesora', 'phrase', NOW(), NOW()),
(5, 1, 'Buenas tardes', 'Good afternoon', 'Buenas tardes, señor', 'phrase', NOW(), NOW()),
(6, 1, 'Gracias', 'Thank you', 'Gracias por el café', 'interjection', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  word = VALUES(word),
  translation = VALUES(translation),
  updatedAt = NOW();

-- Unit 1 Activity Configs
DELETE FROM activity_configs WHERE unitId = 1;
INSERT INTO activity_configs (unitId, activityType, `order`, isEnabled, requiredStoryIds, createdAt, updatedAt) VALUES
(1, 'questions', 200, 1, JSON_ARRAY(1), NOW(), NOW()),
(1, 'flashcards', 400, 1, JSON_ARRAY(1, 2), NOW(), NOW()),
(1, 'matching', 600, 1, JSON_ARRAY(), NOW(), NOW()),
(1, 'listen_repeat', 700, 1, JSON_ARRAY(1, 2, 3), NOW(), NOW());

-- ==============================================
-- UNIT 2: La Familia y Los Animales
-- ==============================================

INSERT INTO units (id, courseId, title, description, `order`, createdAt, updatedAt) VALUES
(2, 1, 'Unidad 2: La Familia y Los Animales', 'Aprende sobre la familia y los animales', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  description = VALUES(description),
  updatedAt = NOW();

-- Unit 2 Stories
INSERT INTO stories (id, unitId, title, text, audioSlowUrl, audioNormalUrl, `order`, createdAt, updatedAt) VALUES
(4, 2, 'La Familia de Carlos',
'Carlos tiene una familia grande. Su padre se llama Roberto y su madre se llama Elena. Carlos tiene dos hermanos: una hermana que se llama Laura y un hermano que se llama Miguel. Laura tiene diez años y Miguel tiene cinco años. La familia de Carlos es muy feliz.',
NULL, NULL, 100, NOW(), NOW()),

(5, 2, 'El Gato de Ana',
'Ana tiene un gato. El gato se llama Michi. Michi es blanco y negro. Michi come pescado y duerme mucho. Ana ama a Michi. Michi es el mejor amigo de Ana. Cada día, Ana y Michi juegan juntos.',
NULL, NULL, 300, NOW(), NOW()),

(6, 2, 'El Perro Doctor',
'Hay un perro que se llama Toby. Toby no es un perro normal, Toby es médico. Toby tiene una clínica veterinaria. Toby ayuda a muchos animales: gatos, pájaros, conejos. Los animales aman al Doctor Toby. Toby es un héroe.',
NULL, NULL, 500, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  text = VALUES(text),
  `order` = VALUES(`order`),
  updatedAt = NOW();

-- Unit 2 Questions
INSERT INTO questions (id, storyId, questionText, answerType, options, correctAnswer, createdAt, updatedAt) VALUES
(6, 4, '¿Cómo se llama el padre de Carlos?', 'choice', '["Miguel", "Roberto", "Carlos"]', 'Roberto', NOW(), NOW()),
(7, 4, '¿Cuántos hermanos tiene Carlos?', 'choice', '["Uno", "Dos", "Tres"]', 'Dos', NOW(), NOW()),
(8, 5, '¿Cómo se llama el gato?', 'choice', '["Toby", "Michi", "Felix"]', 'Michi', NOW(), NOW()),
(9, 5, '¿De qué color es el gato?', 'choice', '["Blanco y negro", "Naranja", "Gris"]', 'Blanco y negro', NOW(), NOW()),
(10, 6, '¿Qué es Toby?', 'choice', '["Un profesor", "Un médico", "Un estudiante"]', 'Un médico', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  questionText = VALUES(questionText),
  options = VALUES(options),
  correctAnswer = VALUES(correctAnswer),
  updatedAt = NOW();

-- Unit 2 Vocabulary
INSERT INTO vocabulary (id, unitId, word, translation, example, partOfSpeech, createdAt, updatedAt) VALUES
(7, 2, 'Familia', 'Family', 'Mi familia es grande', 'noun', NOW(), NOW()),
(8, 2, 'Padre', 'Father', 'Mi padre se llama Juan', 'noun', NOW(), NOW()),
(9, 2, 'Madre', 'Mother', 'Mi madre es profesora', 'noun', NOW(), NOW()),
(10, 2, 'Hermano', 'Brother', 'Tengo un hermano', 'noun', NOW(), NOW()),
(11, 2, 'Hermana', 'Sister', 'Mi hermana tiene ocho años', 'noun', NOW(), NOW()),
(12, 2, 'Gato', 'Cat', 'El gato es blanco', 'noun', NOW(), NOW()),
(13, 2, 'Perro', 'Dog', 'El perro es grande', 'noun', NOW(), NOW()),
(14, 2, 'Animal', 'Animal', 'Los animales son importantes', 'noun', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  word = VALUES(word),
  translation = VALUES(translation),
  updatedAt = NOW();

-- Unit 2 Activity Configs
DELETE FROM activity_configs WHERE unitId = 2;
INSERT INTO activity_configs (unitId, activityType, `order`, isEnabled, requiredStoryIds, createdAt, updatedAt) VALUES
(2, 'questions', 200, 1, JSON_ARRAY(4), NOW(), NOW()),
(2, 'matching', 400, 1, JSON_ARRAY(), NOW(), NOW()),
(2, 'flashcards', 600, 1, JSON_ARRAY(4, 5, 6), NOW(), NOW()),
(2, 'listen_repeat', 700, 1, JSON_ARRAY(4, 5, 6), NOW(), NOW());

-- ==============================================
-- UNIT 3: Comida y Números
-- ==============================================

INSERT INTO units (id, courseId, title, description, `order`, createdAt, updatedAt) VALUES
(3, 1, 'Unidad 3: Comida y Números', 'Aprende sobre la comida y los números', 2, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  description = VALUES(description),
  updatedAt = NOW();

-- Unit 3 Stories
INSERT INTO stories (id, unitId, title, text, audioSlowUrl, audioNormalUrl, `order`, createdAt, updatedAt) VALUES
(7, 3, 'En el Restaurante',
'Pedro va al restaurante. El camarero pregunta: "¿Qué desea comer?". Pedro dice: "Quiero pizza y ensalada, por favor". El camarero pregunta: "¿Y para beber?". Pedro responde: "Agua, por favor". La comida está deliciosa. Pedro está muy feliz.',
NULL, NULL, 100, NOW(), NOW()),

(8, 3, 'El Mercado de Frutas',
'María va al mercado. En el mercado hay muchas frutas: manzanas, naranjas, plátanos, fresas. María compra cinco manzanas y tres naranjas. Las manzanas cuestan dos euros. Las naranjas cuestan un euro. María paga tres euros en total.',
NULL, NULL, 300, NOW(), NOW()),

(9, 3, 'La Fiesta de Cumpleaños',
'Hoy es el cumpleaños de Luis. Luis tiene veinte años. Hay una fiesta grande. En la fiesta hay un pastel enorme con veinte velas. También hay pizza, refrescos y helado. Luis invita a quince amigos. Todos cantan "Feliz Cumpleaños". Luis está muy contento.',
NULL, NULL, 500, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  text = VALUES(text),
  `order` = VALUES(`order`),
  updatedAt = NOW();

-- Unit 3 Questions
INSERT INTO questions (id, storyId, questionText, answerType, options, correctAnswer, createdAt, updatedAt) VALUES
(11, 7, '¿Qué quiere comer Pedro?', 'choice', '["Pasta", "Pizza y ensalada", "Hamburguesa"]', 'Pizza y ensalada', NOW(), NOW()),
(12, 7, '¿Qué quiere beber Pedro?', 'choice', '["Café", "Agua", "Jugo"]', 'Agua', NOW(), NOW()),
(13, 8, '¿Cuántas manzanas compra María?', 'choice', '["Tres", "Cinco", "Diez"]', 'Cinco', NOW(), NOW()),
(14, 8, '¿Cuánto cuestan las manzanas?', 'choice', '["Un euro", "Dos euros", "Tres euros"]', 'Dos euros', NOW(), NOW()),
(15, 9, '¿Cuántos años tiene Luis?', 'choice', '["Quince", "Dieciocho", "Veinte"]', 'Veinte', NOW(), NOW()),
(16, 9, '¿Cuántos amigos invita Luis?', 'choice', '["Diez", "Quince", "Veinte"]', 'Quince', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  questionText = VALUES(questionText),
  options = VALUES(options),
  correctAnswer = VALUES(correctAnswer),
  updatedAt = NOW();

-- Unit 3 Vocabulary
INSERT INTO vocabulary (id, unitId, word, translation, example, partOfSpeech, createdAt, updatedAt) VALUES
(15, 3, 'Comida', 'Food', 'La comida está deliciosa', 'noun', NOW(), NOW()),
(16, 3, 'Pizza', 'Pizza', 'Quiero una pizza', 'noun', NOW(), NOW()),
(17, 3, 'Agua', 'Water', 'Bebo agua', 'noun', NOW(), NOW()),
(18, 3, 'Fruta', 'Fruit', 'La fruta es saludable', 'noun', NOW(), NOW()),
(19, 3, 'Manzana', 'Apple', 'La manzana es roja', 'noun', NOW(), NOW()),
(20, 3, 'Naranja', 'Orange', 'La naranja es dulce', 'noun', NOW(), NOW()),
(21, 3, 'Uno', 'One', 'Tengo un gato', 'number', NOW(), NOW()),
(22, 3, 'Dos', 'Two', 'Dos manzanas', 'number', NOW(), NOW()),
(23, 3, 'Tres', 'Three', 'Tres naranjas', 'number', NOW(), NOW()),
(24, 3, 'Cinco', 'Five', 'Cinco euros', 'number', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  word = VALUES(word),
  translation = VALUES(translation),
  updatedAt = NOW();

-- Unit 3 Activity Configs
DELETE FROM activity_configs WHERE unitId = 3;
INSERT INTO activity_configs (unitId, activityType, `order`, isEnabled, requiredStoryIds, createdAt, updatedAt) VALUES
(3, 'matching', 200, 1, JSON_ARRAY(), NOW(), NOW()),
(3, 'questions', 400, 1, JSON_ARRAY(7, 8), NOW(), NOW()),
(3, 'flashcards', 600, 1, JSON_ARRAY(7, 8, 9), NOW(), NOW()),
(3, 'listen_repeat', 700, 1, JSON_ARRAY(7, 8, 9), NOW(), NOW());

-- ==============================================
-- ENROLLMENT
-- ==============================================

-- Create enrollment for student
INSERT INTO enrollments (id, studentId, courseId, questionsCompleted, flashcardsCompleted, matchingCompleted, listenRepeatCompleted, createdAt, updatedAt) VALUES
(1, 2, 1, 0, 0, 0, 0, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  updatedAt = NOW();

-- ==============================================
-- VERIFICATION QUERY
-- ==============================================

-- Show the complete navigation for each unit
SELECT
    'UNIT 1' as info,
    CONCAT('Order ', LPAD(`order`, 3, '0')) as position,
    'Story' as type,
    title as name,
    NULL as requires
FROM stories
WHERE unitId = 1
UNION ALL
SELECT
    'UNIT 1' as info,
    CONCAT('Order ', LPAD(`order`, 3, '0')) as position,
    'Activity' as type,
    activityType as name,
    IF(JSON_LENGTH(requiredStoryIds) > 0,
       CONCAT('Stories: ', CAST(requiredStoryIds AS CHAR)),
       'No requirements') as requires
FROM activity_configs
WHERE unitId = 1

UNION ALL

SELECT
    'UNIT 2' as info,
    CONCAT('Order ', LPAD(`order`, 3, '0')) as position,
    'Story' as type,
    title as name,
    NULL as requires
FROM stories
WHERE unitId = 2
UNION ALL
SELECT
    'UNIT 2' as info,
    CONCAT('Order ', LPAD(`order`, 3, '0')) as position,
    'Activity' as type,
    activityType as name,
    IF(JSON_LENGTH(requiredStoryIds) > 0,
       CONCAT('Stories: ', CAST(requiredStoryIds AS CHAR)),
       'No requirements') as requires
FROM activity_configs
WHERE unitId = 2

UNION ALL

SELECT
    'UNIT 3' as info,
    CONCAT('Order ', LPAD(`order`, 3, '0')) as position,
    'Story' as type,
    title as name,
    NULL as requires
FROM stories
WHERE unitId = 3
UNION ALL
SELECT
    'UNIT 3' as info,
    CONCAT('Order ', LPAD(`order`, 3, '0')) as position,
    'Activity' as type,
    activityType as name,
    IF(JSON_LENGTH(requiredStoryIds) > 0,
       CONCAT('Stories: ', CAST(requiredStoryIds AS CHAR)),
       'No requirements') as requires
FROM activity_configs
WHERE unitId = 3

ORDER BY info, position;
