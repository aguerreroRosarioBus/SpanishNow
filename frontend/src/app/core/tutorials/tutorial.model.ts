export type TutorialRole = 'student' | 'teacher';
export type TutorialText = readonly [es: string, en: string];

export interface TutorialStep {
  id: string;
  target: string;
  title: TutorialText;
  description: TutorialText;
  role?: TutorialRole;
  /** Solo controles reversibles. La guía nunca ejecuta la acción por el usuario. */
  practice?: { event: 'click' | 'change' | 'toggle'; ready: string };
}

export interface TutorialDefinition {
  id: string;
  root: string;
  roles: readonly TutorialRole[];
  title: TutorialText;
  purpose: TutorialText;
  steps: readonly TutorialStep[];
}
