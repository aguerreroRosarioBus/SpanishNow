import { Injectable } from '@angular/core';
import { NavigationItem, ActivityType } from './navigation-item.model';
import { Unit, Progress, Enrollment, ActivityConfig } from '../../../core/models/course.model';

@Injectable()
export class NavigationService {

  buildNavigationItems(
    unit: Unit,
    progressRecords: Progress[],
    enrollment: Enrollment
  ): NavigationItem[] {
    const items: NavigationItem[] = [];

    // Safety check
    if (!unit) {
      return items;
    }

    // Create map of completed story IDs for quick lookup
    const completedStoryIds = new Set(
      (progressRecords || []).filter(p => p.completed).map(p => p.storyId)
    );

    // STEP 1: Add all stories
    if (unit.stories) {
      for (const story of unit.stories) {
        items.push({
          id: `story-${story.id}`,
          type: 'story',
          title: story.title,
          order: story.order,
          story: story,
          completed: completedStoryIds.has(story.id),
          canAccess: this.canAccessStory(story, unit.stories, completedStoryIds)
        });
      }
    }

    // STEP 2: Add all enabled activities from activityConfigs
    if (unit.activityConfigs && unit.activityConfigs.length > 0) {
      console.log('[NavigationService] Found activityConfigs:', unit.activityConfigs);
      const enabledConfigs = unit.activityConfigs.filter(ac => ac.isEnabled);

      for (const config of enabledConfigs) {
        items.push({
          id: `activity-${config.activityType}-unit-${unit.id}`,
          type: 'activity',
          title: this.getActivityTitle(config.activityType),
          order: config.order,
          activityType: config.activityType,
          unitId: unit.id,
          config: config,
          completed: this.isActivityCompleted(config.activityType, enrollment),
          canAccess: this.canAccessActivity(config, completedStoryIds)
        });
      }
    } else {
      console.log('[NavigationService] No activityConfigs found for unit:', unit.id);
    }

    // STEP 3: Sort by order field (mixes stories and activities)
    return items.sort((a, b) => a.order - b.order);
  }

  canAccessStory(story: any, allStories: any[], completedStoryIds: Set<number>): boolean {
    // Sort stories by order to find the actual first story
    const sortedStories = [...allStories].sort((a, b) => a.order - b.order);

    // First story (lowest order) is always accessible
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
    // If no requirements, always accessible
    if (!config.requiredStoryIds || config.requiredStoryIds.length === 0) {
      return true;
    }

    // Check that ALL required stories are completed
    return config.requiredStoryIds.every(storyId =>
      completedStoryIds.has(storyId)
    );
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
