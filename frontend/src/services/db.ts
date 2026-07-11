import { openDB, type IDBPDatabase } from "idb";
import type { SessionRecord, Route, RouteDraft } from "../types";

const DB_NAME = "velosync";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          if (!db.objectStoreNames.contains("sessions")) {
            const sessionsStore = db.createObjectStore("sessions", { keyPath: "id" });
            sessionsStore.createIndex("date", "date");
          }
          if (!db.objectStoreNames.contains("routes")) {
            db.createObjectStore("routes", { keyPath: "id" });
          }
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains("route_drafts")) {
            db.createObjectStore("route_drafts", { keyPath: "id" });
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function saveSession(record: SessionRecord): Promise<void> {
  const db = await getDb();
  await db.put("sessions", record);
}

export async function getAllSessions(): Promise<SessionRecord[]> {
  const db = await getDb();
  return db.getAllFromIndex("sessions", "date");
}

export async function saveRoute(route: Route): Promise<void> {
  const db = await getDb();
  await db.put("routes", route);
}

export async function getAllRoutes(): Promise<Route[]> {
  const db = await getDb();
  return db.getAll("routes");
}

export async function deleteRoute(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("routes", id);
}

export async function saveRouteDraft(draft: RouteDraft): Promise<void> {
  const db = await getDb();
  await db.put("route_drafts", draft);
}

export async function getAllRouteDrafts(): Promise<RouteDraft[]> {
  const db = await getDb();
  return db.getAll("route_drafts");
}

export async function deleteRouteDraft(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("route_drafts", id);
}

export async function clearAllSessions(): Promise<void> {
  const db = await getDb();
  await db.clear("sessions");
}
