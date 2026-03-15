export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatar?: string | null;
  createdAt: string;
}

export type AppRole = 'user' | 'vendor' | 'admin';
