import axios from "axios";
import { create } from "zustand";
export type Partner = {
  id: string;
  email: string;
  status: "Pending" | "Connected" | "Declined" | "Revoked" | "Expired";
  expiresAt: number;
};
export type Action = "accept" | "decline" | "revoke";
const api = axios.create({ baseURL: "/api", timeout: 10000 });
type State = {
  partners: Partner[];
  busy: boolean;
  ready: boolean;
  error: string;
  load: () => Promise<boolean>;
  invite: (email: string) => Promise<boolean>;
  change: (id: string, action: Action) => Promise<boolean>;
  clear: () => Promise<boolean>;
};
export const useWorkspace = create<State>((set, get) => {
  async function request(call: () => Promise<{ data: Partner[] }>) {
    if (get().busy) return false;
    set({ busy: true, error: "" });
    try {
      const { data } = await call();
      set({ partners: data, ready: true });
      return true;
    } catch (error) {
      set({
        error:
          axios.isAxiosError(error) &&
          typeof error.response?.data?.message === "string"
            ? error.response.data.message
            : "Could not reach the workspace. Please retry.",
      });
      return false;
    } finally {
      set({ busy: false });
    }
  }
  return {
    partners: [],
    busy: false,
    ready: false,
    error: "",
    load: () => request(() => api.get("/partners")),
    invite: (email) => request(() => api.post("/partners", { email })),
    change: (id, action) =>
      request(() => api.patch("/partners/" + id, { action })),
    clear: () => request(() => api.delete("/partners")),
  };
});
