import { Router } from "express";
import authRoutes from "./auth";
import usersRoutes from "./users";
import storesRoutes from "./stores";
import tasksRoutes from "./tasks";
import taskListsRoutes from "./taskLists";
import adminRoutes from "./admin";
import photosRoutes from "./photos";
// import uploadsRoutes from "./uploads";

const router = Router();

// NOTE: no prefixes here; the files use absolute paths already.
router.use(authRoutes);
router.use(usersRoutes);
router.use(storesRoutes);
router.use(tasksRoutes);
router.use(taskListsRoutes);
router.use(adminRoutes);
router.use(photosRoutes);
// router.use(uploadsRoutes);

export default router;
