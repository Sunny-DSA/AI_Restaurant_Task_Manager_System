import AdminDashboard from "./AdminDashboard";
import EmployeeDashboard from "./EmployeeDashboard";
import { useAuth } from "@/hooks/useAuth";

export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;

  const role = String(user.role || "").toLowerCase();
  const isAdmin = role === "admin" || role === "master_admin";
  // Store managers share the employee view
  // (They’ll still see store-wide tasks via /tasks/my).
  return isAdmin ? <AdminDashboard /> : <EmployeeDashboard />;
}



// import { useEffect, useMemo, useState } from "react";
// import { Link } from "wouter";
// import { useQuery } from "@tanstack/react-query";
// import { useAuth } from "@/hooks/useAuth";
// import { storeApi, taskApi, analyticsApi, Store, Task } from "@/lib/api";
// import { hasPermission } from "@/lib/auth";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
// import TaskCard from "@/components/TaskCard";
// import QRScanner from "@/components/QRScanner";
// import {
//   Store as StoreIcon,
//   Users,
//   BarChart3,
//   CheckCircle2,
//   Clock3,
//   AlertTriangle,
//   ChevronRight,
//   Plus,
//   Settings,
//   QrCode,
// } from "lucide-react";

// /* ---------------- utilities ---------------- */
// const pct = (v?: number) => (Number.isFinite(v) ? Math.round(v!) : 0);
// const cls = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

// /* small inline skeleton (no dependency on a Skeleton component) */
// function LineSkeleton({ className = "" }: { className?: string }) {
//   return <div className={cls("animate-pulse bg-muted rounded", className)} />;
// }

// export default function Dashboard() {
//   const { user } = useAuth();
//   const isAdmin = user?.role === "master_admin" || user?.role === "admin";

//   /* ---------------- stores & selection ---------------- */
//   const { data: stores = [], isLoading: storesLoading } = useQuery({
//     queryKey: ["/api/stores"],
//     queryFn: storeApi.getStores,
//   });

//   // Default store choice
//   const defaultStoreId = useMemo(() => {
//     if (user?.storeId) return user.storeId;
//     if (stores.length) return stores[0].id;
//     return undefined;
//   }, [user?.storeId, stores]);

//   const [storeId, setStoreId] = useState<number | undefined>(defaultStoreId);

//   useEffect(() => {
//     setStoreId(defaultStoreId);
//   }, [defaultStoreId]);

//   const activeStore: Store | undefined =
//     (storeId && stores.find((s) => s.id === storeId)) || stores[0];

//   /* ---------------- analytics ---------------- */
//   const { data: taskStats, isLoading: statsLoading } = useQuery({
//     queryKey: ["/api/analytics/tasks", storeId],
//     queryFn: () => analyticsApi.getTaskStats(storeId),
//     enabled: !!storeId,
//     retry: 0,
//   });

//   const { data: userStats } = useQuery({
//     queryKey: ["/api/analytics/users", storeId],
//     queryFn: () => analyticsApi.getUserStats(storeId),
//     enabled: !!storeId,
//     retry: 0,
//   });

//   /* ---------------- tasks ---------------- */
//   // Admins see recent tasks for the selected store
//   const { data: recentTasks = [], isLoading: tasksLoading } = useQuery({
//     queryKey: ["/api/tasks", { storeId }],
//     queryFn: () => taskApi.getTasks({ storeId }),
//     enabled: !!storeId,
//     select: (all) =>
//       (all ?? [])
//         .slice()
//         .sort(
//           (a: Task, b: Task) =>
//             new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
//         )
//         .slice(0, 6),
//   });

//   // Staff view: my tasks today + available tasks
//   const { data: myTasks = [] } = useQuery({
//     queryKey: ["/api/tasks/my"],
//     queryFn: () => taskApi.getMyTasks(),
//     enabled: !isAdmin,
//   });

//   const { data: availableTasks = [] } = useQuery({
//     queryKey: ["/api/tasks/available", storeId],
//     queryFn: () => taskApi.getAvailableTasks(storeId),
//     enabled: !!storeId && !isAdmin,
//   });

//   const todayStr = new Date().toDateString();
//   const myToday = myTasks.filter((t) => {
//     const d = t.dueAt ? new Date(t.dueAt).toDateString() : todayStr;
//     return d === todayStr;
//   });
//   const myCompletedToday = myToday.filter((t) => t.status === "completed").length;

//   const loading = storesLoading || statsLoading || tasksLoading;

//   /* ---------------- render ---------------- */
//   return (
//     <div className="p-4 md:p-6 space-y-6">
//       {/* header row with store filter & quick admin actions */}
//       <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
//         <div>
//           <h2 className="text-2xl font-bold">
//             Welcome back{user?.firstName ? `, ${user.firstName}` : ""}!
//           </h2>
//           <p className="text-muted-foreground">
//             {isAdmin ? "System overview and analytics" : "Your day at a glance"}
//           </p>
//         </div>

//         <div className="flex items-center gap-2">
//           {/* Store selector – enabled mostly for admins */}
//           <Select
//             value={storeId ? String(storeId) : ""}
//             onValueChange={(v) => setStoreId(Number(v))}
//             disabled={!isAdmin || stores.length <= 1}
//           >
//             <SelectTrigger className="w-[240px]">
//               <SelectValue
//                 placeholder={storesLoading ? "Loading stores..." : "Select a store"}
//               />
//             </SelectTrigger>
//             <SelectContent>
//               {stores.map((s) => (
//                 <SelectItem key={s.id} value={String(s.id)}>
//                   {s.name}
//                 </SelectItem>
//               ))}
//             </SelectContent>
//           </Select>

//           {isAdmin && (
//             <>
//               <Link href="/stores">
//                 <Button variant="outline" className="hidden md:inline-flex">
//                   <StoreIcon className="w-4 h-4 mr-2" />
//                   Manage Stores
//                 </Button>
//               </Link>
//               <Link href="/users">
//                 <Button variant="outline" className="hidden md:inline-flex">
//                   <Users className="w-4 h-4 mr-2" />
//                   User Management
//                 </Button>
//               </Link>
//               <Link href="/reports">
//                 <Button variant="outline" className="hidden md:inline-flex">
//                   <BarChart3 className="w-4 h-4 mr-2" />
//                   System Analytics
//                 </Button>
//               </Link>
//             </>
//           )}
//         </div>
//       </div>

//       {/* KPI cards – role-aware content */}
//       <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
//         {isAdmin ? (
//           <>
//             <KpiCard
//               title="Completed Tasks"
//               value={taskStats?.completedTasks ?? 0}
//               icon={CheckCircle2}
//               tone="success"
//               loading={loading}
//             />
//             <KpiCard
//               title="Pending Tasks"
//               value={(taskStats?.totalTasks ?? 0) - (taskStats?.completedTasks ?? 0)}
//               icon={Clock3}
//               tone="info"
//               loading={loading}
//             />
//             <KpiCard
//               title="Overdue Tasks"
//               value={taskStats?.overdueTasks ?? 0}
//               icon={AlertTriangle}
//               tone="warn"
//               loading={loading}
//             />
//             <KpiCard
//               title="Completion Rate"
//               value={`${pct(taskStats?.completionRate)}%`}
//               icon={BarChart3}
//               tone="primary"
//               loading={loading}
//             />
//           </>
//         ) : (
//           <>
//             <KpiCard
//               title="My Tasks Today"
//               value={myToday.length}
//               icon={CheckCircle2}
//               tone="primary"
//               loading={storesLoading}
//               sub={`${myCompletedToday} completed · ${Math.max(0, myToday.length - myCompletedToday)} pending`}
//             />
//             <KpiCard
//               title="Available to Claim"
//               value={availableTasks.length}
//               icon={Users}
//               tone="info"
//               loading={storesLoading}
//               sub="Tasks open for pickup"
//             />
//             <KpiCard
//               title="Overdue (Mine)"
//               value={myTasks.filter((t) => t.status === "overdue").length}
//               icon={AlertTriangle}
//               tone="warn"
//               loading={storesLoading}
//             />
//             <KpiCard
//               title="Active Staff"
//               value={userStats?.checkedInUsers ?? 0}
//               icon={Users}
//               tone="success"
//               loading={statsLoading}
//               sub="Currently checked in"
//             />
//           </>
//         )}
//       </div>

//       {/* Main grid: recent tasks + quick actions (admin) OR my day + quick actions (staff) */}
//       <div className="grid gap-6 lg:grid-cols-3">
//         <Card className="lg:col-span-2">
//           <CardHeader className="flex-row items-center justify-between">
//             <CardTitle>{isAdmin ? "Recent Tasks" : "My Tasks Today"}</CardTitle>
//             <Link href={isAdmin ? "/tasks" : "/tasks"}>
//               <Button variant="ghost" size="sm" className="text-primary">
//                 View All <ChevronRight className="w-4 h-4 ml-1" />
//               </Button>
//             </Link>
//           </CardHeader>
//           <CardContent>
//             {isAdmin ? (
//               loading ? (
//                 <div className="space-y-3">
//                   {Array.from({ length: 5 }).map((_, i) => (
//                     <LineSkeleton key={i} className="h-12 w-full" />
//                   ))}
//                 </div>
//               ) : recentTasks.length === 0 ? (
//                 <EmptyState
//                   title="No recent activity"
//                   desc={
//                     activeStore
//                       ? `There’s no recent activity for ${activeStore.name} yet.`
//                       : "Nothing to show."
//                   }
//                   action={
//                     <Link href="/task-lists">
//                       <Button>
//                         <Plus className="w-4 h-4 mr-2" />
//                         Create Task List
//                       </Button>
//                     </Link>
//                   }
//                 />
//               ) : (
//                 <div className="space-y-2">
//                   {recentTasks.map((t) => (
//                     <div
//                       key={t.id}
//                       className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50"
//                     >
//                       <div className="min-w-0">
//                         <div className="flex items-center gap-2">
//                           <span className="font-medium truncate">{t.title}</span>
//                           <span
//                             className={cls(
//                               "text-xs px-2 py-0.5 rounded-full border",
//                               t.priority === "high" && "border-destructive text-destructive",
//                               t.priority === "medium" && "border-amber-500 text-amber-600",
//                               (!t.priority || t.priority === "low") &&
//                                 "border-muted-foreground/30 text-muted-foreground",
//                             )}
//                           >
//                             {String(t.priority || "normal").toUpperCase()}
//                           </span>
//                         </div>
//                         <div className="text-xs text-muted-foreground">
//                           {activeStore ? activeStore.name : `Store #${t.storeId}`} ·{" "}
//                           {new Date(t.updatedAt).toLocaleString()}
//                         </div>
//                       </div>
//                       <div className="text-sm">
//                         <span
//                           className={
//                             t.status === "completed"
//                               ? "text-emerald-600"
//                               : t.status === "in_progress"
//                               ? "text-primary"
//                               : t.status === "overdue"
//                               ? "text-destructive"
//                               : "text-muted-foreground"
//                           }
//                         >
//                           {t.status.replace("_", " ")}
//                         </span>
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//               )
//             ) : // staff view
//             myToday.length === 0 ? (
//               <EmptyState
//                 title="No tasks for today"
//                 desc="Ask your manager to assign a checklist or pick up an available task."
//                 action={
//                   availableTasks.length > 0 ? (
//                     <a href="#available">
//                       <Button variant="outline">See Available Tasks</Button>
//                     </a>
//                   ) : undefined
//                 }
//               />
//             ) : (
//               <div className="space-y-2">
//                 {myToday.slice(0, 6).map((t) => (
//                   <div
//                     key={t.id}
//                     className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50"
//                   >
//                     <div className="min-w-0">
//                       <div className="font-medium truncate">{t.title}</div>
//                       <div className="text-xs text-muted-foreground">
//                         {t.dueAt
//                           ? `Due ${new Date(t.dueAt).toLocaleTimeString([], {
//                               hour: "2-digit",
//                               minute: "2-digit",
//                             })}`
//                           : "No due time"}
//                       </div>
//                     </div>
//                     <div
//                       className={cls(
//                         "text-xs px-2 py-0.5 rounded-full border",
//                         t.status === "completed" && "border-emerald-600 text-emerald-700",
//                         t.status === "overdue" && "border-destructive text-destructive",
//                         t.status !== "completed" &&
//                           t.status !== "overdue" &&
//                           "border-muted-foreground/30 text-muted-foreground",
//                       )}
//                     >
//                       {t.status}
//                     </div>
//                   </div>
//                 ))}
//               </div>
//             )}
//           </CardContent>
//         </Card>

//         {/* Quick actions */}
//         <Card>
//           <CardHeader>
//             <CardTitle>Quick Actions</CardTitle>
//           </CardHeader>
//           <CardContent className="space-y-3">
//             {!isAdmin && (
//               <Link href="#">
//                 <Button className="w-full justify-start" variant="outline">
//                   <div className="w-9 h-9 bg-primary/10 rounded flex items-center justify-center mr-3">
//                     <QrCode className="w-5 h-5 text-primary" />
//                   </div>
//                   Scan QR to Check In
//                 </Button>
//               </Link>
//             )}

//             <Link href="/task-lists">
//               <Button className="w-full justify-start" variant="outline">
//                 <div className="w-9 h-9 bg-primary/10 rounded flex items-center justify-center mr-3">
//                   <Plus className="w-5 h-5 text-primary" />
//                 </div>
//                 Create New Task / Checklist
//               </Button>
//             </Link>
//             <Link href="/users">
//               <Button className="w-full justify-start" variant="outline">
//                 <div className="w-9 h-9 bg-primary/10 rounded flex items-center justify-center mr-3">
//                   <Users className="w-5 h-5 text-primary" />
//                 </div>
//                 Invite Team Member
//               </Button>
//             </Link>
//             <Link href="/stores">
//               <Button className="w-full justify-start" variant="outline">
//                 <div className="w-9 h-9 bg-primary/10 rounded flex items-center justify-center mr-3">
//                   <Settings className="w-5 h-5 text-primary" />
//                 </div>
//                 Store Settings
//               </Button>
//             </Link>

//             <div className="pt-3 border-t">
//               <div className="text-xs text-muted-foreground mb-2">Selected store</div>
//               <div className="flex items-center gap-3 rounded-md border p-3">
//                 <div className="w-9 h-9 rounded bg-primary/10 flex items-center justify-center">
//                   <StoreIcon className="w-5 h-5 text-primary" />
//                 </div>
//                 <div className="min-w-0">
//                   <div className="font-medium truncate">
//                     {activeStore?.name ?? "No store"}
//                   </div>
//                   <div className="text-xs text-muted-foreground truncate">
//                     {activeStore?.address ?? "—"}
//                   </div>
//                 </div>
//               </div>
//             </div>
//           </CardContent>
//         </Card>
//       </div>

//       {/* Available tasks (staff) */}
//       {!isAdmin && availableTasks.length > 0 && (
//         <Card id="available">
//           <CardHeader>
//             <CardTitle>Available Tasks to Claim</CardTitle>
//           </CardHeader>
//           <CardContent className="space-y-4">
//             {availableTasks.slice(0, 3).map((task) => (
//               <TaskCard key={task.id} task={task} />
//             ))}
//           </CardContent>
//         </Card>
//       )}

//       {/* Optional: QR scanner modal – keep using your existing component */}
//       {/* You can wire this to a button state if you want the actual camera modal here */}
//       {/* <QRScanner isOpen={...} onClose={...} onSuccess={...} /> */}
//     </div>
//   );
// }

// /* ---------------- small helpers ---------------- */

// function KpiCard({
//   title,
//   value,
//   icon: Icon,
//   tone = "primary",
//   loading,
//   sub,
// }: {
//   title: string;
//   value: number | string;
//   icon: any;
//   tone?: "primary" | "success" | "info" | "warn";
//   loading?: boolean;
//   sub?: string;
// }) {
//   const toneClass =
//     tone === "success"
//       ? "text-emerald-600"
//       : tone === "info"
//       ? "text-sky-600"
//       : tone === "warn"
//       ? "text-amber-600"
//       : "text-primary";

//   return (
//     <Card>
//       <CardContent className="p-4">
//         <div className="flex items-center justify-between">
//           <div className="min-w-0">
//             <p className="text-sm text-muted-foreground">{title}</p>
//             {loading ? (
//               <LineSkeleton className="h-6 w-20 mt-1" />
//             ) : (
//               <p className={cls("text-2xl font-bold", toneClass)}>{value}</p>
//             )}
//             {sub && <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>}
//           </div>
//           <Icon className={cls("w-8 h-8", toneClass)} />
//         </div>
//       </CardContent>
//     </Card>
//   );
// }

// function EmptyState({
//   title,
//   desc,
//   action,
// }: {
//   title: string;
//   desc?: string;
//   action?: React.ReactNode;
// }) {
//   return (
//     <div className="text-center py-12">
//       <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
//         <BarChart3 className="w-6 h-6 text-muted-foreground" />
//       </div>
//       <h3 className="text-lg font-semibold">{title}</h3>
//       {desc && <p className="text-muted-foreground mt-1">{desc}</p>}
//       {action && <div className="mt-4">{action}</div>}
//     </div>
//   );
// }
