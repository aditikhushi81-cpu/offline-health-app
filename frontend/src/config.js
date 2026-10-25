// Backend address. In production it comes from the VITE_API_URL setting;
// on your computer it falls back to localhost.
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";