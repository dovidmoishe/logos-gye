import axios from "axios";
import { createClient } from "@supabase/supabase-js";

const local = process.env.NEXT_PUBLIC_LOCAL_EMAIL_TEST === "true";
export const logosAuth = createClient(
  local
    ? typeof window === "undefined"
      ? "http://localhost"
      : window.location.origin
    : process.env.NEXT_PUBLIC_SUPABASE_URL ||
        "https://gazplkkplxiavofhvupb.supabase.co",
  local
    ? "logos-local"
    : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        "sb_publishable_1DAJK7QWBhBtEEDDe5DVGw_tXQMrdJ9",
).auth;
export const accountAPI = axios.create({
  baseURL: "/api/account",
  timeout: 15000,
});
accountAPI.interceptors.request.use(async (config) => {
  const { data, error } = await logosAuth.getSession();
  if (error) throw error;
  if (data.session)
    config.headers.set("Authorization", "Bearer " + data.session.access_token);
  return config;
});
