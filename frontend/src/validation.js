// Shared validation rules. Pure functions, so they work offline.
// Each function returns an error message string, or "" if the value is OK.

export function validateName(name) {
  const value = (name || "").trim();
  if (value.length < 2) return "Name must be at least 2 characters.";
  // Letters (any language) and combining marks, separated by single spaces.
  if (!/^[\p{L}\p{M}]+(?: [\p{L}\p{M}]+)*$/u.test(value)) {
    return "Name can contain only letters and spaces.";
  }
  return "";
}

export function validatePhone(phone) {
  const value = (phone || "").trim();
  if (value === "") return ""; // phone is optional
  if (!/^[6-9]\d{9}$/.test(value)) {
    return "Enter a valid 10-digit Indian mobile number (starts with 6-9).";
  }
  return "";
}

export function validateDob(dob) {
  if (!dob) return "Date of birth is required.";

  const parts = String(dob).split("-");
  if (parts.length !== 3) return "Enter a valid date of birth.";
  const [y, m, d] = parts.map(Number);

  const date = new Date(y, m - 1, d);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return "Enter a valid date of birth.";
  }

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (date > todayStart) return "Date of birth cannot be in the future.";

  let age = todayStart.getFullYear() - y;
  const hadBirthday =
    todayStart.getMonth() > m - 1 ||
    (todayStart.getMonth() === m - 1 && todayStart.getDate() >= d);
  if (!hadBirthday) age -= 1;

  if (age > 120) return "Age cannot be more than 120 years.";
  return "";
}

// Checks all fields at once. Returns an object like { name: "...", phone: "..." }
// containing only the fields that have errors. Empty object = all valid.
export function validatePatient({ name, dob, phone }) {
  const errors = {};
  const nameError = validateName(name);
  const dobError = validateDob(dob);
  const phoneError = validatePhone(phone);
  if (nameError) errors.name = nameError;
  if (dobError) errors.dob = dobError;
  if (phoneError) errors.phone = phoneError;
  return errors;
}