-- Fix all story assignments and orders

-- Unit 1 stories (IDs 1, 2, 3)
UPDATE stories SET unitId = 1, `order` = 100 WHERE id = 1;
UPDATE stories SET unitId = 1, `order` = 300 WHERE id = 2;
UPDATE stories SET unitId = 1, `order` = 500 WHERE id = 3;

-- Unit 2 stories (IDs 4, 5, 6)
UPDATE stories SET unitId = 2, `order` = 100 WHERE id = 4;
UPDATE stories SET unitId = 2, `order` = 300 WHERE id = 5;
UPDATE stories SET unitId = 2, `order` = 500 WHERE id = 6;

-- Unit 3 stories (IDs 7, 8, 9)
UPDATE stories SET unitId = 3, `order` = 100 WHERE id = 7;
UPDATE stories SET unitId = 3, `order` = 300 WHERE id = 8;
UPDATE stories SET unitId = 3, `order` = 500 WHERE id = 9;

-- Fix unit orders
UPDATE units SET `order` = 0 WHERE id = 1;
UPDATE units SET `order` = 1 WHERE id = 2;
UPDATE units SET `order` = 2 WHERE id = 3;

-- Verify final structure
SELECT
    u.id as unitId,
    u.title as unitTitle,
    s.id as storyId,
    s.title as storyTitle,
    s.`order` as storyOrder
FROM units u
LEFT JOIN stories s ON u.id = s.unitId
WHERE u.courseId = 1
ORDER BY u.`order`, s.`order`;
