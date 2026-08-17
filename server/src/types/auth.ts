export type UserRole = 'user' | 'admin';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  disabled: boolean;
  createdAt: number;
}

export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  disabled: boolean;
  createdAt: number;
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}

export {};
