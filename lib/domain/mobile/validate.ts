/** Name validation per BUSINESS_RULES §9: 1-60 characters, trimmed. (Uniqueness is the caller's job.) */
export const NAME_MAX = 60;

export class MobileRowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MobileRowError";
  }
}

export function validateName(raw: string, what = "name"): string {
  const name = raw.trim();
  // Count code points so an emoji or astral character is one character.
  const length = [...name].length;
  if (length < 1) throw new MobileRowError(`${what} is required`);
  if (length > NAME_MAX) throw new MobileRowError(`${what} must be at most ${NAME_MAX} characters`);
  return name;
}
