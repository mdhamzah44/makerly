/**
 * Shared (client + server safe) password policy.
 * Minimum 8 characters, at least one uppercase letter, one number and one
 * special character. The same function runs on the server so the client-side
 * check can never be bypassed.
 */
export const PASSWORD_RULES = [
  { id: "len", label: "At least 8 characters", test: (v: string) => v.length >= 8 },
  { id: "upper", label: "One uppercase letter (A-Z)", test: (v: string) => /[A-Z]/.test(v) },
  { id: "number", label: "One number (0-9)", test: (v: string) => /[0-9]/.test(v) },
  {
    id: "special",
    label: "One special character (!@#$…)",
    test: (v: string) => /[^A-Za-z0-9]/.test(v),
  },
] as const;

export const PASSWORD_HINT =
  "Minimum 8 characters with at least 1 uppercase letter, 1 number and 1 special character.";

export function passwordProblems(password: string): string[] {
  const value = password ?? "";
  const problems: string[] = PASSWORD_RULES.filter((r) => !r.test(value)).map((r) =>
    String(r.label),
  );
  if (value.length > 200) problems.push("Must be 200 characters or fewer");
  return problems;
}

export function assertStrongPassword(password: string) {
  const problems = passwordProblems(password);
  if (problems.length)
    throw new Error(`Password is too weak — ${problems.join(", ").toLowerCase()}.`);
}

export function normalizeEmail(email: string) {
  return (email ?? "").trim().toLowerCase();
}

export function isValidEmail(email: string) {
  const value = normalizeEmail(email);
  return value.length <= 255 && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(value);
}
