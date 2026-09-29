import { Injectable } from '@angular/core';
import { NavigationItem, ActivityType } from './navigation-item.model';
import { Unit, Progress, Enrollment, ActivityConfig, Story } from '../../../core/models/course.model';

@Injectable()
export class NavigationService {

  buildNavigationItems(
    unit: Unit,
    progressRecords: Progress[],
    enrollment: Enrollment,
    lessonCompletedStoryIds: ReadonlySet<number> = new Set()
  ): NavigationItem[] {
    const items: NavigationItem[] = [];

    // Safety check
    if (!unit) {
      return items;
    }

    // Create map of completed story IDs for quick lookup
    const completedStoryIds = new Set<number>([
      ...(progressRecords || []).filter(p => p.completed).map(p => p.storyId),
      ...lessonCompletedStoryIds
    ]);

    // For each story, add: Story + its activities (based on activityConfigs)
    if (unit.stories) {
      const sortedStories = [...unit.stories].sort((a, b) => a.order - b.order);

      for (const story of sortedStories) {
        // Add the story itself
        items.push({
          id: `story-${story.id}`,
          type: 'story',
          title: story.title,
          order: story.order,
          story: story,
          completed: completedStoryIds.has(story.id),
          canAccess: this.canAccessStory(story, sortedStories, completedStoryIds)
        });

        // Add activities for this story (if it has activityConfigs)
        if (story.activityConfigs && story.activityConfigs.length > 0) {
          const enabledConfigs = story.activityConfigs.filter(ac => ac.isEnabled);
          const sortedConfigs = [...enabledConfigs].sort((a, b) => a.order - b.order);

          for (const config of sortedConfigs) {
            items.push({
              id: `activity-${config.activityType}-story-${story.id}`,
              type: 'activity',
              title: this.getActivityTitle(config.activityType),
              order: story.order + (config.order / 1000), // Insert between stories
              activityType: config.activityType,
              storyId: story.id,
              unitId: unit.id,
              config: config,
              completed: this.isActivityCompleted(config.activityType, enrollment),
              canAccess: this.canAccessActivity(config, completedStoryIds)
            });
          }
        }
      }
    }

    // Sort by order field (stories and activities mixed)
    return items.sort((a, b) => a.order - b.order);
  }

  canAccessStory(story: Story, sortedStories: Story[], completedStoryIds: Set<number>): boolean {
    // First story is always accessible
    if (sortedStories.length === 0 || story.id === sortedStories[0].id) {
      return true;
    }

    // Find the previous story in sequence (by order)
    const currentIndex = sortedStories.findIndex(s => s.id === story.id);
    if (currentIndex <= 0) {
      return true; // If not found or is first, allow access
    }

    const previousStory = sortedStories[currentIndex - 1];

    // Check if previous story is completed
    return completedStoryIds.has(previousStory.id);
  }

  canAccessActivity(config: ActivityConfig, completedStoryIds: Set<number>): boolean {
    // Activity is accessible if its parent story is completed
    // (requiredStoryIds is deprecated with per-story activities)
    return completedStoryIds.has(config.storyId);
  }

  isActivityCompleted(activityType: string, enrollment: Enrollment): boolean {
    const completionField: { [key: string]: keyof Enrollment } = {
      'questions': 'questionsCompleted',
      'flashcards': 'flashcardsCompleted',
      'matching': 'matchingCompleted',
      'listen_repeat': 'listenRepeatCompleted'
    };

    const field = completionField[activityType];
    return enrollment[field] === true;
  }

  getActivityTitle(activityType: string): string {
    const titles: { [key: string]: string } = {
      'questions': 'Preguntas de comprensión',
      'flashcards': 'Tarjetas de vocabulario',
      'matching': 'Emparejar vocabulario',
      'listen_repeat': 'Escuchar y repetir'
    };
    return titles[activityType] || activityType;
  }

  getActivityIcon(activityType: string): string {
    const icons: { [key: string]: string } = {
      'questions': '🎯',
      'flashcards': '🃏',
      'matching': '🔗',
      'listen_repeat': '🎧'
    };
    return icons[activityType] || '📝';
  }
}
