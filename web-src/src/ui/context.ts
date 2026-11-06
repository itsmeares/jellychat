import { createContext, useContext } from "react";
import type { PrefsStore } from "../core/prefs";
import type { RoomStore } from "../core/room";

export type Services = { room: RoomStore; prefs: PrefsStore };

export const ServicesContext = createContext<Services | null>(null);

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("JellyChat services missing");
  return services;
}
