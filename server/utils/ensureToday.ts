// server/utils/ensureToday.ts
import { storage } from "../storage";
import { taskStatusEnum } from "@shared/schema";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Create today's tasks for all active templates that apply to `storeId`,
 * only if a task for that template doesn't already exist for today.
 * Idempotent and safe to call repeatedly.
 */
export async function ensureTasksForStoreToday(storeId: number): Promise<{ ensured: number }> {
  const today = ymd(new Date());
  let ensured = 0;

  // Pull active templates (no schema change—use your storage API)
  const allTemplates = await storage.getTaskTemplates();
  const activeTemplates = (allTemplates || []).filter((t: any) => t.isActive !== false);

  // Pull all tasks at this store once; keep only today's for quick lookups
  const storeTasks = await storage.getTasks({ storeId });
  const todays = (storeTasks || []).filter((t: any) => {
    const d = t.scheduledFor ?? t.dueAt;
    if (!d) return false;
    return ymd(new Date(d)) === today;
  });

  const hasTodayForTemplate = (templateId: number) =>
    todays.some((t: any) => Number(t.templateId) === Number(templateId));

  for (const tpl of activeTemplates) {
    // If your templates are store-specific, respect that; otherwise skip this check.
    if (tpl.storeId && Number(tpl.storeId) !== Number(storeId)) continue;

    if (!hasTodayForTemplate(tpl.id)) {
      await storage.createTask({
        templateId: tpl.id,
        title: tpl.title,
        description: tpl.description ?? null,
        storeId,
        assigneeType: tpl.assigneeId ? "specific_employee" : "store_wide",
        assigneeId: tpl.assigneeId ?? null,
        status: taskStatusEnum.PENDING,
        priority: tpl.priority ?? "normal",
        photoRequired: !!tpl.photoRequired || Number(tpl.photoCount ?? 0) > 0,
        photoCount: Number(tpl.photoCount ?? 0) || 1,
        scheduledFor: new Date(), // today
        notes: null,
      });
      ensured++;
    }
  }

  return { ensured };
}
