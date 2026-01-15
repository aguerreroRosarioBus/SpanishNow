-- Verify navigation order for all units

SELECT
    CONCAT('Unit ', unitId) as Unit,
    'Story' as Type,
    id as ID,
    title as Name,
    `order` as OrderNum
FROM stories
WHERE courseId = 1
UNION ALL
SELECT
    CONCAT('Unit ', unitId) as Unit,
    'Activity' as Type,
    id as ID,
    activityType as Name,
    `order` as OrderNum
FROM activity_configs
WHERE unitId IN (SELECT id FROM units WHERE courseId = 1)
ORDER BY Unit, OrderNum;
