/** Read an entry that the scenario or fixture requires to exist. */
export function requireValue<T>(
  value: T | null | undefined,
  description: string,
): T {
  if (value == null) throw new Error(description + " 값이 없습니다.");
  return value;
}
