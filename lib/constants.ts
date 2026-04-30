export const INQUIRY_TYPES = [
  {
    value: "Certificate of Enrollment",
    label: "Certificate of Enrollment",
    prefix: "COE",
  },
  {
    value: "Certificate of Registration",
    label: "Certificate of Registration",
    prefix: "COR",
  },
  { value: "TOR", label: "TOR", prefix: "TOR" },
  { value: "Study Load", label: "Study Load", prefix: "SL" },
  { value: "Tuition Fee", label: "Tuition Fee", prefix: "TF" },
  { value: "Other Inquiry", label: "Other Inquiry", prefix: "OI" },
] as const;

export const DEPARTMENTS = [
  "Baccalaureate-College",
  "Senior HighSchool",
] as const;

export const DEGREE_PROGRAMS = [
  "Bachelor of Science in Psychology",
  "Bachelor of Science in Accounting Information System (BSAIS)",
  "Bachelor of Science in Information System (BSIS)",
  "Bachelor of Science in Office Administration (BSOAd)",
  "Bachelor of Science in Tourism Management (BSTM)",
  "Bachelor of Science in Criminology (BSCrim)",
  "Bachelor of Science in Civil Engineering (BSCE)",
  "Bachelor of Science in Computer Engineering (BSCpE)",
  "Bachelor of Science in Electrical Engineering (BSEE)",
  "Bachelor of Science in Mechanical Engineering (BSME)",
  "Bachelor of Science in Nursing (BSN)",
  "Bachelor of Elementary Education (BEEd)",
  "Bachelor of Physical Education (BPEd)",
  "Bachelor of Secondary Education (BSEd)",
  "Bachelor of Special Needs Education",
  "Diploma in Professional Education",
] as const;



export const TERMS_SCHOOL_YEAR = [
  "1st Sem AY 2024-2025",
  "2nd Sem AY 2024-2025",
  "Summer AY 2024-2025",
  "1st Sem AY 2025-2026",
  "2nd Sem AY 2025-2026",
] as const;

export const MINUTES_PER_SLOT = 3;
