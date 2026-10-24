export type LiveStatus = 'draft' | 'live' | 'ended';
export type BoardTool = 'select' | 'pen' | 'line' | 'rect' | 'ellipse' | 'note' | 'text' | 'eraser';
export type BoardFormat = 'wide' | 'standard' | 'square' | 'portrait' | 'notebook';
export interface BoardPoint { x: number; y: number; }
export interface BoardElement {
  id: string;
  type: 'pen' | 'line' | 'rect' | 'ellipse' | 'note' | 'text' | 'image' | 'link';
  x: number; y: number; w: number; h: number; color: string; width: number;
  points?: BoardPoint[]; text?: string; url?: string; fontFamily?: string; fontSize?: number; textColor?: string; authorId: number; version: number;
}
export interface BoardPage { id: string; title: string; background: 'plain' | 'dots' | 'grid' | 'lines'; format?: BoardFormat; elements: BoardElement[]; }
export interface LiveBoard { pages: BoardPage[]; activePageId: string; }
export interface BoardOperation {
  id: string;
  type: 'put' | 'delete' | 'page-add' | 'page-delete' | 'page-active' | 'page-background' | 'page-clear' | 'page-format' | 'page-rename' | 'page-reorder';
  pageId: string; element?: BoardElement; elementId?: string; expectedVersion?: number;
  expectedRevision?: number; title?: string; background?: BoardPage['background']; format?: BoardFormat; index?: number;
}
export interface LiveClass {
  id: number; teacherId: number; courseId: number | null; title: string; status: LiveStatus;
  allowStudentEdit: boolean; revision: number; updatedAt: string; createdAt: string; isOwner: boolean;
  joinCode?: string; classroomCourseId?: string | null; classroomCourseName?: string | null;
  classroomAnnouncementId?: string | null; classroomAnnouncementUrl?: string | null; driveFileUrl?: string | null;
}
export interface LiveSnapshot extends LiveClass { board?: LiveBoard; unchanged?: boolean; participants: { id: number; name: string; isTeacher: boolean }[]; }
export interface GoogleStatus { configured: boolean; connected: boolean; email: string | null; }
export interface ClassroomCourse { id: string; name: string; section: string; url?: string; }
export interface DriveBoardFile { id: string; name: string; modifiedTime: string; webViewLink?: string; }
