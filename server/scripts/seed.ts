// server/seed.ts
import "dotenv/config";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import {
  users as usersTable,
  stores as storesTable,
  taskLists as taskListsTable,
  taskTemplates as taskTemplatesTable,
  roleEnum,
} from "@shared/schema";

/** Utility: build a values object using only columns that exist on the table object */
function pickExistingColumns<T extends object>(
  table: any,
  values: Record<string, unknown>
) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (k in table) out[k] = v;
  }
  return out as T;
}

async function ensureAdmin() {
  // Try to find any admin/master_admin
  const existing = await db
    .select()
    .from(usersTable)
    .where(
      sql`${usersTable.role} = ${roleEnum.ADMIN} OR ${usersTable.role} = ${roleEnum.MASTER_ADMIN}`
    )
    .limit(1);

  if (existing.length) return existing[0];

  // Try to create a minimal admin (schema-flexible)
  // Only include fields your current schema supports
  const insertVals = pickExistingColumns(usersTable, {
    email: "admin@seed.local",
    firstName: "Seed",
    lastName: "Admin",
    role: roleEnum.ADMIN,
    isActive: true,
    // If your schema supports PIN / password columns, add them here:
    // pin: "1234",
    // pinHash: "...",
  });

  try {
    const [row] = await db.insert(usersTable).values(insertVals).returning();
    return row;
  } catch (e) {
    console.warn("Could not create admin user automatically:", e);
    // Fall back to an arbitrary user if one exists
    const anyUser = await db.select().from(usersTable).limit(1);
    if (anyUser.length) return anyUser[0];
    throw new Error(
      "No users found and failed to create an admin. Please create one manually, then re-run seed."
    );
  }
}

async function ensureStore(name: string, address: string, extras?: Partial<Record<string, unknown>>) {
  const found = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.name as any, name as any))
    .limit(1);

  if (found.length) return found[0];

  const insertVals = pickExistingColumns(storesTable, {
    name,
    address,
    phone: extras?.phone ?? null,
    timezone: extras?.timezone ?? "UTC",
    latitude: extras?.latitude ?? null,
    longitude: extras?.longitude ?? null,
    geofenceRadius: extras?.geofenceRadius ?? 100,
    isActive: true,
    // qrCode, createdAt/updatedAt usually default
  });

  const [row] = await db.insert(storesTable).values(insertVals).returning();
  return row;
}

async function ensureTaskList(
  name: string,
  createdById: number,
  description?: string | null
) {
  const found = await db
    .select()
    .from(taskListsTable)
    .where(eq(taskListsTable.name as any, name as any))
    .limit(1);

  if (found.length) return found[0];

  const insertVals = pickExistingColumns(taskListsTable, {
    name,
    description: description ?? null,
    createdBy: createdById,
    assigneeType: "store_wide",
    assigneeId: null,
    recurrenceType: "none",
    recurrencePattern: null,
    isActive: true,
  });

  const [row] = await db.insert(taskListsTable).values(insertVals).returning();
  return row;
}

async function ensureTemplate(
  listId: number,
  title: string,
  createdById: number,
  opts?: { photoRequired?: boolean; photoCount?: number; assigneeId?: number | null; priority?: string }
) {
  // If the schema doesn't have listId, skip creating templates (prevents runtime errors)
  if (!("listId" in taskTemplatesTable)) {
    console.warn("taskTemplates.listId column not found in schema; skipping template creation.");
    return null;
  }

  // Avoid duplicates by (listId, title)
  const dupCheck = await db
    .select()
    .from(taskTemplatesTable)
    .where(
      sql`${taskTemplatesTable.listId} = ${listId} AND ${taskTemplatesTable.title} = ${title}`
    )
    .limit(1);

  if (dupCheck.length) return dupCheck[0];

  const insertVals = pickExistingColumns(taskTemplatesTable, {
    listId,
    title,
    description: null,
    createdBy: createdById,
    assigneeType: opts?.assigneeId ? "specific_employee" : "store_wide",
    assigneeId: opts?.assigneeId ?? null,
    photoRequired: !!opts?.photoRequired || (opts?.photoCount ?? 0) > 0,
    photoCount: opts?.photoCount ?? 1,
    priority: opts?.priority ?? "normal",
    isActive: true,
  });

  const [row] = await db.insert(taskTemplatesTable).values(insertVals).returning();
  return row;
}

async function main() {
  console.log("Seeding…");

  const admin = await ensureAdmin();
  console.log("Admin user:", { id: (admin as any).id, role: (admin as any).role });

  const storeA = await ensureStore("Sanpeggio's Pizza_Homewood", "803 Green Springs Hwy, Homewood, AL 35209", {
    timezone: "UTC",
    geofenceRadius: 100,
  });
  const storeB = await ensureStore("Sanpeggio's Pizza_Valleydale", "2657 Valleydale Rd, Hoover, AL 35244", {
    timezone: "UTC",
    geofenceRadius: 100,
  });
  console.log("Stores:", [storeA?.name, storeB?.name].filter(Boolean).join(", "));

  const list = await ensureTaskList("Opening Checklist", (admin as any).id, "Seeded list");
  console.log("Task list:", list?.name);

  // Only create templates when listId is supported by your schema
  if ("id" in list && "listId" in taskTemplatesTable) {
    const listId = (list as any).id as number;
    await ensureTemplate(listId, "Prep Stations", (admin as any).id, { photoRequired: true, photoCount: 1 });
    await ensureTemplate(listId, "Walk the Line", (admin as any).id, { photoRequired: true, photoCount: 2 });
    await ensureTemplate(listId, "Open Registers", (admin as any).id, { photoRequired: false, photoCount: 0 });
  }

  console.log("Seed complete ✅");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
