-- Complete verification of course structure

-- Course Info
SELECT '=== COURSE INFO ===' as info;
SELECT id, title, description FROM courses WHERE id = 1;

-- Units
SELECT '=== UNITS ===' as info;
SELECT id, courseId, title, `order` FROM units WHERE courseId = 1 ORDER BY `order`;

-- Stories per unit
SELECT '=== STORIES PER UNIT ===' as info;
SELECT u.id as unitId, u.title as unitTitle, s.id as storyId, s.title as storyTitle, s.`order` as storyOrder
FROM units u
LEFT JOIN stories s ON u.id = s.unitId
WHERE u.courseId = 1
ORDER BY u.`order`, s.`order`;

-- Activity Configs per unit
SELECT '=== ACTIVITY CONFIGS PER UNIT ===' as info;
SELECT
    u.id as unitId,
    u.title as unitTitle,
    ac.activityType,
    ac.`order` as actOrder,
    ac.requiredStoryIds
FROM units u
LEFT JOIN activity_configs ac ON u.id = ac.unitId
WHERE u.courseId = 1
ORDER BY u.`order`, ac.`order`;

-- Navigation order for Unit 1
SELECT '=== UNIT 1 NAVIGATION ===' as info;
SELECT 'Story' as type, id, title as name, `order` FROM stories WHERE unitId = 1
UNION ALL
SELECT 'Activity' as type, id, activityType as name, `order` FROM activity_configs WHERE unitId = 1
ORDER BY `order`;

-- Navigation order for Unit 2
SELECT '=== UNIT 2 NAVIGATION ===' as info;
SELECT 'Story' as type, id, title as name, `order` FROM stories WHERE unitId = 2
UNION ALL
SELECT 'Activity' as type, id, activityType as name, `order` FROM activity_configs WHERE unitId = 2
ORDER BY `order`;

-- Navigation order for Unit 3
SELECT '=== UNIT 3 NAVIGATION ===' as info;
SELECT 'Story' as type, id, title as name, `order` FROM stories WHERE unitId = 3
UNION ALL
SELECT 'Activity' as type, id, activityType as name, `order` FROM activity_configs WHERE unitId = 3
ORDER BY `order`;

-- Enrollment info
SELECT '=== ENROLLMENT ===' as info;
SELECT id, studentId, courseId FROM enrollments WHERE studentId = 2;
