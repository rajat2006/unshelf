import { createContext } from "react";
import type { ApplicationAuth } from "./types";

export const AuthContext = createContext<ApplicationAuth | null>(null);
