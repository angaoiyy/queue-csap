export const STUDENT_ID_PATTERN = "[0-9]{4}-[0-9]{5}";
export const STUDENT_ID_ERROR =
  "Student ID must use the format YYYY-NNNNN (e.g. 2024-00123).";

export function isValidStudentId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{4}-[0-9]{5}$/.test(value);
}
