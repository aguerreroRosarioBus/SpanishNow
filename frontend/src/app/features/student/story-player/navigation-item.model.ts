import { Story, ActivityConfig } from '../../../core/models/course.model';

export type NavigationItemType = 'story' | 'activity';
export type ActivityType = 'questions' | 'flashcards' | 'matching' | 'listen_repeat';

export interface NavigationItem {
  id: string;
  type: NavigationItemType;
  title: string;
  order: number;
  completed: boolean;
  canAccess: boolean;

  // Story-specific fields
  story?: Story;

  // Activity-specific fields
  activityType?: ActivityType;
  unitId?: number;
  config?: ActivityConfig;
}
