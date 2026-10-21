import { Story } from '../../../core/models/course.model';

/** Ítem del menú lateral: una historia de la unidad actual. */
export interface NavigationItem {
  id: string;
  title: string;
  order: number;
  completed: boolean;
  /** Única regla de acceso: la usan el menú lateral y las flechas. */
  canAccess: boolean;
  story: Story;
}
