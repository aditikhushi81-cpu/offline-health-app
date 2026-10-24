// Vitals plausibility rules. Pure functions, so they work offline.
// errors   = hard limits, saving is blocked
// warnings = unusual but possible values, the user must confirm

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

export function parseBP(bp) {
  const m = /^(\d{2,3})\/(\d{2,3})$/.exec(String(bp || "").trim());
  if (!m) return null;
  return { systolic: Number(m[1]), diastolic: Number(m[2]) };
}

export function validateVitals({ bloodPressure, temperature, pulse, weight }) {
  const errors = {};
  const warnings = [];

  // ---- Blood pressure ----
  const bpText = String(bloodPressure || "").trim();
  if (bpText !== "") {
    const bp = parseBP(bpText);
    if (!bp) {
      errors.bloodPressure = "Blood pressure should look like 120/80.";
    } else if (bp.systolic <= bp.diastolic) {
      errors.bloodPressure = "Systolic (first number) must be higher than diastolic (second number).";
    } else if (bp.systolic > 180 || bp.diastolic > 120) {
      warnings.push(`Blood pressure ${bp.systolic}/${bp.diastolic} is very high.`);
    }
  }

  // ---- Temperature ----
  const temp = toNumber(temperature);
  if (Number.isNaN(temp)) {
    errors.temperature = "Enter a valid number.";
  } else if (temp !== null) {
    if (temp < 30 || temp > 45) {
      errors.temperature = "Temperature must be between 30 and 45 °C.";
    } else if (temp > 40) {
      warnings.push(`Temperature ${temp} °C is very high.`);
    }
  }

  // ---- Pulse ----
  const p = toNumber(pulse);
  if (Number.isNaN(p)) {
    errors.pulse = "Enter a valid number.";
  } else if (p !== null) {
    if (!Number.isInteger(p)) {
      errors.pulse = "Pulse must be a whole number.";
    } else if (p < 20 || p > 250) {
      errors.pulse = "Pulse must be between 20 and 250 bpm.";
    } else if (p > 150) {
      warnings.push(`Pulse ${p} bpm is very high.`);
    } else if (p < 40) {
      warnings.push(`Pulse ${p} bpm is very low.`);
    }
  }

  // ---- Weight ----
  const w = toNumber(weight);
  if (Number.isNaN(w)) {
    errors.weight = "Enter a valid number.";
  } else if (w !== null && (w < 1 || w > 400)) {
    errors.weight = "Weight must be between 1 and 400 kg.";
  }

  const isEmpty =
    bpText === "" && temp === null && p === null && w === null;

  return { errors, warnings, isEmpty };
}