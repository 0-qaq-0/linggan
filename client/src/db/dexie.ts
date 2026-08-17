import Dexie, { type Table } from 'dexie';
import type { IdeaCard, CardVersion } from '../types';

export class LINGGANDatabase extends Dexie {
  cards!: Table<IdeaCard, string>;
  versions!: Table<CardVersion, string>;
  settings!: Table<{ key: string; value: any }, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      cards: 'id, parentId, createdAt',
      versions: 'id, cardId, parentVersionId, createdAt',
      settings: 'key',
    });
  }
}

/** Live binding — reassigned per user on login/logout. */
export let db: LINGGANDatabase | null = null;

export async function initDb(userId: string): Promise<LINGGANDatabase> {
  if (db?.isOpen()) {
    db.close();
  }
  db = new LINGGANDatabase(`LINGGAN_${userId}`);
  await db.open();
  return db;
}

export async function closeDb(): Promise<void> {
  if (db?.isOpen()) {
    db.close();
  }
  db = null;
}

export function getDb(): LINGGANDatabase {
  if (!db) {
    throw new Error('数据库未初始化，请先登录');
  }
  return db;
}
