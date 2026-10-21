import { Story, Unit } from '../../../core/models/course.model';

export type NavigationItemKind = 'intro' | 'story' | 'quiz';

/** Ítem del menú lateral de la unidad actual: video de bienvenida, una historia o el quiz de la unidad. */
export interface NavigationItem {
  id: string;
  kind: NavigationItemKind;
  title: string;
  order: number;
  completed: boolean;
  /** Única regla de acceso: la usan el menú lateral y las flechas. */
  canAccess: boolean;
  /** Contenido por fechas: la unidad todavía no se liberó (distinto de «completa lo anterior»). */
  locked?: boolean;
  availableAt?: string | null;
  /** Solo en ítems de tipo `story`. */
  story: Story | null;
  /** Unidad a la que pertenece el ítem (el de bienvenida usa la primera). */
  unit: Unit | null;
}
