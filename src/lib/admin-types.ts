export type AdminRole = "owner" | "admin" | "editor" | "support";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};