import { create } from 'zustand';

import type { AuthUser } from '../types';

import * as authService from '../services/authService';

import { AUTH_TOKEN_KEY } from '../services/authFetch';

import { initDb, closeDb } from '../db/dexie';

import { useCanvasStore } from './useCanvasStore';

import { useSessionStore } from './useSessionStore';

import { useAgentStore } from './useAgentStore';

import { useSyncStore } from './useSyncStore';



interface AuthState {

  user: AuthUser | null;

  token: string | null;

  isReady: boolean;

  isAuthenticated: boolean;

  isAdmin: boolean;



  login: (email: string, password: string) => Promise<void>;

  register: (email: string, password: string) => Promise<void>;

  logout: () => Promise<void>;

  hydrate: () => Promise<void>;

}



async function loadSettingsFromDb() {

  const { getDb } = await import('../db/dexie');

  const database = getDb();

  const provider = await database.settings.get('provider');

  const model = await database.settings.get('model');

  const apiKey = await database.settings.get('apiKey');

  const baseURL = await database.settings.get('baseURL');

  if (provider && apiKey) {

    useSessionStore.getState().setSettings(

      provider.value,

      model?.value || '',

      apiKey.value,

      baseURL?.value || '',

    );

  }

  const accent = await database.settings.get('accentColor');

  if (accent?.value) {

    document.documentElement.style.setProperty('--primary', accent.value);

  }

}



async function bootstrapUserWorkspace() {

  await useCanvasStore.getState().loadFromDB();

  await loadSettingsFromDb();

  await useSyncStore.getState().bootstrapSync();

}



function clearUserWorkspace() {

  useSyncStore.getState().reset();

  useCanvasStore.getState().resetCanvas();

  useSessionStore.getState().resetSession();

  useAgentStore.getState().reset();

}



export const useAuthStore = create<AuthState>((set, get) => ({

  user: null,

  token: sessionStorage.getItem(AUTH_TOKEN_KEY),

  isReady: false,

  isAuthenticated: false,

  isAdmin: false,



  login: async (email, password) => {

    const { token, user } = await authService.login(email, password);

    sessionStorage.setItem(AUTH_TOKEN_KEY, token);

    clearUserWorkspace();

    await initDb(user.id);

    set({ token, user, isAuthenticated: true, isAdmin: user.role === 'admin' });

    await bootstrapUserWorkspace();

  },



  register: async (email, password) => {

    const { token, user } = await authService.register(email, password);

    sessionStorage.setItem(AUTH_TOKEN_KEY, token);

    clearUserWorkspace();

    await initDb(user.id);

    set({ token, user, isAuthenticated: true, isAdmin: user.role === 'admin' });

    await bootstrapUserWorkspace();

  },



  logout: async () => {

    try {

      await useSyncStore.getState().syncNow({ force: true });

    } catch {

      // best-effort flush before logout

    }

    sessionStorage.removeItem(AUTH_TOKEN_KEY);

    clearUserWorkspace();

    await closeDb();

    set({ user: null, token: null, isAuthenticated: false, isAdmin: false });

  },



  hydrate: async () => {

    const token = get().token;

    if (!token) {

      set({ isReady: true, isAuthenticated: false, isAdmin: false });

      return;

    }



    try {

      const user = await authService.fetchMe();

      await initDb(user.id);

      set({ user, isAuthenticated: true, isAdmin: user.role === 'admin' });

      await bootstrapUserWorkspace();

    } catch {

      sessionStorage.removeItem(AUTH_TOKEN_KEY);

      set({ user: null, token: null, isAuthenticated: false, isAdmin: false });

    } finally {

      set({ isReady: true });

    }

  },

}));


