-- Story-level sample configurations for stories 2 and 3.
-- Run only in an isolated seed database after these stories exist.
-- INSERT IGNORE preserves configurations edited by a teacher.
INSERT IGNORE INTO activity_configs
  (storyId, activityType, `order`, isEnabled, requiredStoryIds, createdAt, updatedAt)
VALUES
  (2, 'questions', 0, 1, JSON_ARRAY(), NOW(), NOW()),
  (2, 'flashcards', 1, 1, JSON_ARRAY(), NOW(), NOW()),
  (3, 'questions', 0, 1, JSON_ARRAY(), NOW(), NOW()),
  (3, 'matching', 1, 1, JSON_ARRAY(), NOW(), NOW());

SELECT ac.id, ac.storyId, s.title AS storyTitle, ac.activityType, ac.`order`,
       ac.isEnabled, ac.requiredStoryIds
FROM activity_configs ac
JOIN stories s ON s.id = ac.storyId
WHERE ac.storyId IN (2, 3)
ORDER BY ac.storyId, ac.`order`;
