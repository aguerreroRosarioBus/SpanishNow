-- Story-level navigation audit. Activities are reported within their story.
SELECT u.id AS unitId, u.title AS unitTitle, s.id AS storyId,
       s.title AS storyTitle, s.`order` AS storyOrder,
       ac.activityType, ac.`order` AS activityOrder, ac.isEnabled
FROM units u
JOIN stories s ON s.unitId = u.id
LEFT JOIN activity_configs ac ON ac.storyId = s.id
WHERE u.courseId = 1
ORDER BY u.`order`, s.`order`, ac.`order`;
