export const STUDENT_ID_PATTERN = "[0-9]{6}-[0-9]{6}";
export const STUDENT_ID_ERROR =
  "Student ID must contain 6 digits, a hyphen, then 6 digits (e.g. 012345-004826).";

export function isValidStudentId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{6}-[0-9]{6}$/.test(value);
}
