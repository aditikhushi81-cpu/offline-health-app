// Server-side vitals rules. Same hard limits as frontend/src/vitalsValidation.js.
// Returns an object of errors. Empty object = valid.

function numOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function validateVitals({ bloodPressure, temperature, pulse, weight }) {
  const errors = {};

  const bpText = String(bloodPressure ?? "").trim();
  if (bpText !== "") {
    const m = /^(\d{2,3})\/(\d{2,3})$/.exec(bpText);
    if (!m) errors.bloodPressure = "Blood pressure should look like 120/80.";
    else if (Number(m[1]) <= Number(m[2])) {
      errors.bloodPressure = "Systolic must be higher than diastolic.";
    }
  }

  const temp = numOrNull(temperature);
  if (Number.isNaN(temp) || (temp !== null && (temp < 30 || temp > 45))) {
    errors.temperature = "Temperature must be between 30 and 45 C.";
  }

  const p = numOrNull(pulse);
  if (Number.isNaN(p) || (p !== null && (!Number.isInteger(p) || p < 20 || p > 250))) {
    errors.pulse = "Pulse must be a whole number between 20 and 250.";
  }

  const w = numOrNull(weight);
  if (Number.isNaN(w) || (w !== null && (w < 1 || w > 400))) {
    errors.weight = "Weight must be between 1 and 400 kg.";
  }

  if (
    Object.keys(errors).length === 0 &&
    bpText === "" && temp === null && p === null && w === null
  ) {
    errors.general = "At least one measurement is required.";
  }

  return errors;
}

module.exports = { validateVitals, numOrNull };