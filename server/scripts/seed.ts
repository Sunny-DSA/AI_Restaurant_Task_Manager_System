// scripts/seed.ts
import { db } from "../db";
import { users, stores, roleEnum } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Starting DB seeding...");

  // ===============================
  // Seed default store
  // ===============================
  const defaultStoreName = "Main Store";
  const storeRows = await db
    .select()
    .from(stores)
    .where(eq(stores.name, defaultStoreName))
    .limit(1);

  let store = storeRows[0];
  if (!store) {
    const inserted = await db
      .insert(stores)
      .values({
        name: defaultStoreName,
        address: "123 Main Street",
        // removed isActive, only include columns that exist in your schema
      })
      .returning();
    store = inserted[0];
    console.log("Inserted default store:", store);
  }

  // ===============================
  // Seed default admin
  // ===============================
  const adminEmail = "admin@company.com";
  const adminRows = await db
    .select()
    .from(users)
    .where(eq(users.email, adminEmail))
    .limit(1);

  let admin = adminRows[0];
  if (!admin) {
    const passwordHash = await bcrypt.hash("Admin@123", 10); // 🔑 default password
    const inserted = await db
      .insert(users)
      .values({
        email: adminEmail,
        firstName: "Admin",
        lastName: "User",
        role: roleEnum.ADMIN, // ✅ use directly
        passwordHash,
        isActive: true, // ✅ this likely exists on users table
      })
      .returning();
    admin = inserted[0];
    console.log("Inserted default admin:", admin);
  }

  console.log("Seeding completed.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
