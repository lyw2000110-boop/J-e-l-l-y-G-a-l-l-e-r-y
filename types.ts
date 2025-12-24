export interface ImageItem {
  id: string;
  name: string;
  data: string; // Base64 string
  tags: string[];
  note: string;
  timestamp: number;
}

export interface NoteItem {
  id: string;
  content: string;
  timestamp: number;
}

export interface Folder {
  id: string;
  name: string;
  images: ImageItem[];
  notes?: NoteItem[]; // Optional collection of standalone notes
  createdAt: number;
}

export interface AppState {
  folders: Folder[];
  activeFolderId: string | null;
}