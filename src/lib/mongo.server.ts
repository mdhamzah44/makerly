import { MongoClient, type Db } from "mongodb";

let clientPromise: Promise<MongoClient> | null = null;

export function getDb(): Promise<Db> {
  const uri = process.env["MONGODB_URI"] || "mongodb+srv://Vercel-Admin-atlas-cerulean-field:MEHjg4W4q1OnFpsO@atlas-cerulean-field.tlglglb.mongodb.net/?retryWrites=true&w=majority";
  const dbName = process.env["MONGODB_DB"] || "areebadesigncoNewest";
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!clientPromise) {
    clientPromise = new MongoClient(uri, {
      serverSelectionTimeoutMS: 15000,
      maxPoolSize: 5,
    }).connect();
  }
  return clientPromise.then((c) => c.db(dbName));
}

/** Recursively convert ObjectId / Date values into JSON-safe primitives. */
export function plain<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => {
      if (
        v &&
        typeof v === "object" &&
        typeof (v as { toHexString?: () => string }).toHexString === "function"
      ) {
        return (v as { toHexString: () => string }).toHexString();
      }
      return v;
    }),
  ) as T;
}

export function newId() {
  return [...crypto.getRandomValues(new Uint8Array(12))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}