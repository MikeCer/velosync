import { openDB, type IDBPDatabase } from "idb";
import type { SessionRecord, Route } from "../types";

const DB_NAME = "velosync";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("sessions")) {
          const sessionsStore = db.createObjectStore("sessions", { keyPath: "id" });
          sessionsStore.createIndex("date", "date");
        }
        if (!db.objectStoreNames.contains("routes")) {
          db.createObjectStore("routes", { keyPath: "id" });
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

export async function clearAllSessions(): Promise<void> {
  const db = await getDb();
  await db.clear("sessions");
}
