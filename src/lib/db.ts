import Dexie, { type Table } from 'dexie';

export interface MediaFile {
  id?: number;
  title: string;
  artist: string;
  album: string;
  duration: number;
  fileName: string;
  fileSize: number;
  type: 'audio' | 'video';
  lastPlayed?: Date;
  addedAt: Date;
  fileHandle?: FileSystemFileHandle; // For File System Access API
  blob?: Blob; // Fallback for standard file input
  thumbnail?: string; // Base64 thumbnail for videos
}

export class AppDatabase extends Dexie {
  mediaFiles!: Table<MediaFile>;

  constructor() {
    super('VibeSyncDB');
    this.version(1).stores({
      mediaFiles: '++id, title, artist, album, type, fileName'
    });
  }
}

export const dbLocal = new AppDatabase();
