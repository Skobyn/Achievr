export interface Auth {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateUserInfo: (userInfo: Partial<User>) => Promise<void>;
  debugForceLogin?: () => Promise<any>; // Add the debug function (optional)
} 