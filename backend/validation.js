// Server-side validation. Same rules as frontend/src/validation.js.
// Each function returns an error message string, or "" if the value is OK.

function validateName(name) {
  const value = String(name ?? "").trim();
  if (value.length < 2) return "Name must be at least 2 characters.";
  if (!/^[\p{L}\p{M}]+(?: [\p{L}\p{M}]+)*$/u.test(value)) {
    return "Name can contain only letters and spaces.";
  }
  return "";
}

function validatePhone(phone) {
  const value = String(phone ?? "").trim();
  if (value === "") return ""; // optional
  if (!/^[6-9]\d{9}$/.test(value)) {
    return "Enter a valid 10-digit Indian mobile number (starts with 6-9).";
  }
  return "";
}

function validateDob(dob) {
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

  // The server may run in a different time zone than India (e.g. UTC),
  // so we allow a 1-day tolerance before calling a date "in the future".
  const now = new Date();
  const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (date > limit) return "Date of birth cannot be in the future.";

  let age = now.getFullYear() - y;
  const hadBirthday =
    now.getMonth() > m - 1 || (now.getMonth() === m - 1 && now.getDate() >= d);
  if (!hadBirthday) age -= 1;
  if (age > 120) return "Age cannot be more than 120 years.";
  return "";
}

function validateGender(gender) {
  if (!["female", "male", "other"].includes(gender)) {
    return "Gender must be female, male or other.";
  }
  return "";
}

// Validate one editable field by its key (used for edits).
function validateField(key, value) {
  if (key === "name") return validateName(value);
  if (key === "dob") return validateDob(value);
  if (key === "phone") return validatePhone(value);
  if (key === "gender") return validateGender(value);
  return "";
}

// Validate name, dob and phone together (used for new patients).
function validatePatient({ name, dob, phone }) {
  const errors = {};
  const nameError = validateName(name);
  const dobError = validateDob(dob);
  const phoneError = validatePhone(phone);
  if (nameError) errors.name = nameError;
  if (dobError) errors.dob = dobError;
  if (phoneError) errors.phone = phoneError;
  return errors;
}

module.exports = {
  validateName,
  validatePhone,
  validateDob,
  validateGender,
  validateField,
  validatePatient,
};