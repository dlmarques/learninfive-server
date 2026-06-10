export interface AuthenticatedUser {
  userId: string;
  token: string;
}

export interface RequestWithUser {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}
