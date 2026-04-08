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

export interface PlaylistLocal {
  id?: number;
  firestoreId?: string; // Link to firestore if synced
  name: string;
  description?: string;
  ownerId?: string;
  trackIds: number[]; // IDs of mediaFiles in this playlist
  createdAt: Date;
}

export class AppDatabase extends Dexie {
  mediaFiles!: Table<MediaFile>;
  playlists!: Table<PlaylistLocal>;

  constructor() {
    super('VibeSyncDB');
    this.version(2).stores({
      mediaFiles: '++id, title, artist, album, type, fileName',
      playlists: '++id, firestoreId, name, ownerId'
    });
  }
}

export const dbLocal = new AppDatabase();
