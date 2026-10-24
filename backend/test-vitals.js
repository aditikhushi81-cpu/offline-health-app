const { validateVitals } = require("./vitalsValidation");

const cases = [
  ["valid", { bloodPressure: "120/80", temperature: 36.8, pulse: 72, weight: 60 }],
  ["valid strings", { bloodPressure: "120/80", temperature: "36.8", pulse: "72", weight: "60" }],
  ["bp reversed", { bloodPressure: "80/120" }],
  ["bp equal", { bloodPressure: "120/120" }],
  ["pulse 300", { pulse: 300 }],
  ["temp 50", { temperature: 50 }],
  ["weight 500", { weight: 500 }],
  ["empty", {}],
  ["high but allowed", { bloodPressure: "190/100", temperature: 41, pulse: 160 }],
];

for (const [label, data] of cases) {
  console.log(label, "->", JSON.stringify(validateVitals(data)));
}