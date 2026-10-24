const { validatePatient, validateGender } = require("./validation");

const cases = [
  ["valid", { name: "Asha Devi", dob: "1990-05-10", phone: "9876543210" }],
  ["bad name", { name: "asdf123", dob: "1990-05-10", phone: "" }],
  ["bad phone", { name: "Asha Devi", dob: "1990-05-10", phone: "1234567890" }],
  ["future dob", { name: "Asha Devi", dob: "2999-01-01", phone: "" }],
  ["too old", { name: "Asha Devi", dob: "1890-01-01", phone: "" }],
  ["fake date", { name: "Asha Devi", dob: "2020-02-31", phone: "" }],
];

for (const [label, data] of cases) {
  console.log(label, "->", JSON.stringify(validatePatient(data)));
}
console.log("gender 'xyz' ->", validateGender("xyz"));
console.log("gender 'male' ->", JSON.stringify(validateGender("male")));