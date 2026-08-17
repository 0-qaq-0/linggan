export interface UserWorkspace {
  revision: number;
  updatedAt: number;
  cards: Array<Record<string, unknown>>;
  versions: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
}

export interface WorkspaceMeta {
  revision: number;
  updatedAt: number;
}

export const EMPTY_WORKSPACE: UserWorkspace = {
  revision: 0,
  updatedAt: 0,
  cards: [],
  versions: [],
  settings: {},
};
