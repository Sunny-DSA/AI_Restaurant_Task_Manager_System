// server/scripts/seedAdmin.ts
import { AuthService } from "../services/authService";
import { roleEnum } from "@shared/schema";

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  try {
    const user = await AuthService.createUser(
      {
        email,
        firstName: "Admin",
        lastName: "User",
        role: roleEnum.ADMIN,    // or roleEnum.MASTER_ADMIN
        isActive: true,
      },
      password
    );
    console.log("✅ Admin created:", { id: user.id, email: user.email, role: user.role });
  } catch (err: any) {
    // If user exists, AuthService may throw — show a helpful note
    console.error("Seed failed:", err?.message || err);
    console.error("If the user already exists, change ADMIN_EMAIL or reset their password via your own method.");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
