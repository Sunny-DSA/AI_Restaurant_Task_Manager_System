// scripts/verify-seed.ts
import { db } from "../db"; // ✅ match your real db.ts path
import { users, stores } from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Verifying seed records...");

  // ===============================
  // Verify store
  // ===============================
  const storeRows = await db
    .select()
    .from(stores)
    .where(eq(stores.name, "Main Store"))
    .limit(1);

  const store = storeRows[0];
  if (!store) {
    console.warn("⚠️ Default store is missing!");
  } else {
    console.log("✅ Default store exists:", store.name);
  }

  // ===============================
  // Verify admin
  // ===============================
  const adminRows = await db
    .select()
    .from(users)
    .where(eq(users.email, "admin@company.com"))
    .limit(1);

  const admin = adminRows[0];
  if (!admin) {
    console.warn("⚠️ Default admin is missing!");
  } else {
    console.log("✅ Default admin exists:", admin.email);
  }

  console.log("Verification finished.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  });
