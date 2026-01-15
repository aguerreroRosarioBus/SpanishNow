-- Seed data for activity_configs table
-- This creates a sample configuration for Unit 2 (Primeros contactos)
-- which has 2 stories (IDs 2 and 3)

-- Clear existing configs for Unit 2 if any
DELETE FROM activity_configs WHERE unitId = 2;

-- Unit 2: Primeros contactos
-- Stories: 2 (El Robot que no sabe saludar), 3 (El Perro que es Doctor)

-- Scenario: Mixed ordering with configurable unlocking
-- Order 1: Story "El Robot que no sabe saludar" (order from stories table)
-- Order 2: Questions activity (requires story 2 completed)
-- Order 3: Story "El Perro que es Doctor" (order from stories table)
-- Order 4: Flashcards activity (requires both stories completed)
-- Order 5: Matching activity (no requirements - always accessible)
-- Order 6: Listen & Repeat activity (requires both stories completed)

INSERT INTO activity_configs (unitId, activityType, `order`, isEnabled, requiredStoryIds, createdAt, updatedAt) VALUES
-- Questions after first story
(2, 'questions', 200, 1, JSON_ARRAY(2), NOW(), NOW()),

-- Flashcards after both stories
(2, 'flashcards', 400, 1, JSON_ARRAY(2, 3), NOW(), NOW()),

-- Matching without requirements (always accessible for practice)
(2, 'matching', 500, 1, JSON_ARRAY(), NOW(), NOW()),

-- Listen & Repeat after both stories
(2, 'listen_repeat', 600, 1, JSON_ARRAY(2, 3), NOW(), NOW());

-- Note: Stories have order values like 1, 2, 3, etc. from the stories table
-- We're using 100, 200, 300, etc. for activity orders to leave room for insertion
-- The NavigationService will mix them based on order values when building the sidebar

-- To see the mixed navigation order:
-- Story 2 (order: 1) -> Questions (order: 200) -> Story 3 (order: 2) ->
-- Flashcards (order: 400) -> Matching (order: 500) -> Listen & Repeat (order: 600)

-- Verify the seed
SELECT
    ac.id,
    ac.unitId,
    u.title as unitTitle,
    ac.activityType,
    ac.`order`,
    ac.isEnabled,
    ac.requiredStoryIds
FROM activity_configs ac
JOIN units u ON ac.unitId = u.id
WHERE ac.unitId = 2
ORDER BY ac.`order`;
