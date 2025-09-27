import { Router } from "express";
import authRoutes from "./auth";
import usersRoutes from "./users";
import storesRoutes from "./stores";
import tasksRoutes from "./tasks";
import taskListsRoutes from "./taskLists";
import adminRoutes from "./admin";
import photosRoutes from "./photos";
import checkinsRoutes from "./checkins"; // ✅ NEW: exposes /api/checkins/me
import analyticsRoutes from "./analytics";

const router = Router();

// NOTE: no prefixes here; each file uses absolute paths already.
router.use(authRoutes);
router.use(checkinsRoutes); // ← lightweight status endpoint used by the client
router.use(usersRoutes);
router.use(storesRoutes);
router.use(tasksRoutes);
router.use(taskListsRoutes);
router.use(adminRoutes);
router.use(photosRoutes);
router.use(analyticsRoutes);

export default router;
