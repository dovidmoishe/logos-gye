import axios from "axios";

export const accountAPI = axios.create({
  baseURL: "/api/account",
  timeout: 15000,
});
export const emailAuthAPI = axios.create({
  baseURL: "/api/auth",
  timeout: 15000,
});
