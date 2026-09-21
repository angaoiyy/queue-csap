export const PRIORITY_TYPES = [
  { value: "PWD", label: "PWD" },
  { value: "Pregnant", label: "Pregnant" },
  { value: "Senior Citizen", label: "Senior Citizen" },
] as const;

export const MINUTES_PER_SLOT = 3;

export const CLAIM_OR_REQUEST_OPTIONS = ["Claim", "Request"] as const;

// Shown in the landing page "Contact us" section. Placeholder values - replace
// with the real CSAP details.
export const CONTACT_INFO = {
  phone: "+63 XXX XXX XXXX",
  email: "info@your-school-domain.edu.ph",
  address: "Guinsay, Philippines",
} as const;

// Keep in sync with the CHECK constraints in migration 029_contact_messages.sql.
export const CONTACT_LIMITS = {
  name: 80,
  email: 254,
  phone: 30,
  message: 2000,
} as const;
