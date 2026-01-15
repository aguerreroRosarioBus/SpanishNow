-- Update story orders to mix with activities
UPDATE stories SET `order` = 100 WHERE id = 2;
UPDATE stories SET `order` = 300 WHERE id = 3;

-- Show the final mixed navigation order
SELECT 'Story' as type, id, title as name, `order` FROM stories WHERE unitId = 2
UNION
SELECT 'Activity' as type, id, activityType as name, `order` FROM activity_configs WHERE unitId = 2
ORDER BY `order`;
