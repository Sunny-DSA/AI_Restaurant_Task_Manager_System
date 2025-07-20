import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { analyticsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { 
  TrendingUp, 
  Clock, 
  Camera, 
  Download, 
  FileText, 
  CalendarIcon,
  Filter,
  BarChart3,
  PieChart,
  Activity
} from "lucide-react";

export default function Reports() {
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState("last7days");
  const [selectedStore, setSelectedStore] = useState<string>("all");
  const [taskType, setTaskType] = useState("all");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();

  // Calculate date range based on selection
  const getDateRange = () => {
    const now = new Date();
    let from: Date | undefined;
    let to: Date = now;

    switch (dateRange) {
      case "today":
        from = new Date(now.setHours(0, 0, 0, 0));
        to = new Date(now.setHours(23, 59, 59, 999));
        break;
      case "last7days":
        from = new Date();
        from.setDate(from.getDate() - 7);
        break;
      case "last30days":
        from = new Date();
        from.setDate(from.getDate() - 30);
        break;
      case "thismonth":
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "custom":
        from = startDate;
        to = endDate || now;
        break;
      default:
        from = new Date();
        from.setDate(from.getDate() - 7);
    }

    return { from, to };
  };

  const { from: dateFrom, to: dateTo } = getDateRange();

  // Get task analytics
  const { data: taskStats } = useQuery({
    queryKey: ["/api/analytics/tasks", user?.storeId, dateFrom, dateTo],
    queryFn: () => analyticsApi.getTaskStats(
      user?.storeId, 
      dateFrom, 
      dateTo
    ),
  });

  // Get user stats
  const { data: userStats } = useQuery({
    queryKey: ["/api/analytics/users", user?.storeId],
    queryFn: () => analyticsApi.getUserStats(user?.storeId),
  });

  const handleExportCSV = () => {
    // Implementation for CSV export would go here
    console.log("Exporting CSV...");
  };

  const handleExportPDF = () => {
    // Implementation for PDF export would go here
    console.log("Exporting PDF...");
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Report Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="w-5 h-5" />
            <span>Report Filters</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="last7days">Last 7 days</SelectItem>
                  <SelectItem value="last30days">Last 30 days</SelectItem>
                  <SelectItem value="thismonth">This month</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dateRange === "custom" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "PPP") : "Pick start date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "PPP") : "Pick end date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Actions</label>
              <div className="flex space-x-2">
                <Button className="flex-1">
                  Apply Filters
                </Button>
                <Button variant="outline" onClick={handleExportCSV}>
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Overview */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Task Completion</h3>
              <TrendingUp className="w-8 h-8 text-success-600" />
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-success-600 mb-2">
                {taskStats ? Math.round(taskStats.completionRate) : 0}%
              </div>
              <p className="text-sm text-gray-600">Average completion rate</p>
              <div className="mt-4">
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-success-500 h-3 rounded-full" 
                    style={{ width: `${taskStats ? taskStats.completionRate : 0}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Average Time</h3>
              <Clock className="w-8 h-8 text-primary-600" />
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary-600 mb-2">
                {taskStats ? Math.round(taskStats.averageCompletionTime) : 0}m
              </div>
              <p className="text-sm text-gray-600">Per task completion</p>
              <div className="mt-4 text-sm space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Tasks:</span>
                  <span className="font-medium text-gray-900">
                    {taskStats?.totalTasks || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Completed:</span>
                  <span className="font-medium text-success-600">
                    {taskStats?.completedTasks || 0}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Photo Compliance</h3>
              <Camera className="w-8 h-8 text-warning-600" />
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-warning-600 mb-2">94%</div>
              <p className="text-sm text-gray-600">Photos uploaded</p>
              <div className="mt-4 text-sm space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Required:</span>
                  <span className="font-medium">156</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Uploaded:</span>
                  <span className="font-medium text-success-600">147</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Reports Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <BarChart3 className="w-5 h-5" />
              <span>Task Performance Report</span>
            </CardTitle>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={handleExportCSV}>
                <FileText className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button variant="outline" onClick={handleExportPDF}>
                <Download className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {taskStats && (taskStats.totalTasks > 0 || taskStats.completedTasks > 0) ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Metric
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Value
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <BarChart3 className="w-5 h-5 text-gray-400 mr-3" />
                        <span className="text-sm font-medium text-gray-900">Total Tasks</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {taskStats.totalTasks}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="secondary">Active</Badge>
                    </td>
                  </tr>

                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Activity className="w-5 h-5 text-success-500 mr-3" />
                        <span className="text-sm font-medium text-gray-900">Completed Tasks</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {taskStats.completedTasks}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge className="bg-success-100 text-success-700">
                        {taskStats.totalTasks > 0 
                          ? Math.round((taskStats.completedTasks / taskStats.totalTasks) * 100)
                          : 0
                        }% Complete
                      </Badge>
                    </td>
                  </tr>

                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Clock className="w-5 h-5 text-primary-500 mr-3" />
                        <span className="text-sm font-medium text-gray-900">Average Completion Time</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {Math.round(taskStats.averageCompletionTime)} minutes
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge className="bg-primary-100 text-primary-700">
                        {taskStats.averageCompletionTime <= 30 ? "Fast" : 
                         taskStats.averageCompletionTime <= 60 ? "Good" : "Slow"}
                      </Badge>
                    </td>
                  </tr>

                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <PieChart className="w-5 h-5 text-warning-500 mr-3" />
                        <span className="text-sm font-medium text-gray-900">Overdue Tasks</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {taskStats.overdueTasks}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={taskStats.overdueTasks > 0 ? "destructive" : "secondary"}>
                        {taskStats.overdueTasks > 0 ? "Attention Needed" : "On Track"}
                      </Badge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Data Available</h3>
              <p className="text-gray-600 mb-6">
                There are no tasks in the selected time period. Try adjusting your filters or date range.
              </p>
              <Button variant="outline">
                <Filter className="w-4 h-4 mr-2" />
                Adjust Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additional Analytics Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Team Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Team Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-success-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-success-600">1</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Top Performer</p>
                    <p className="text-sm text-gray-600">95% completion rate</p>
                  </div>
                </div>
                <Badge className="bg-success-100 text-success-700">Excellent</Badge>
              </div>

              <div className="text-center py-6">
                <p className="text-sm text-gray-500">
                  Individual performance data will be available once more tasks are completed.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Task Categories */}
        <Card>
          <CardHeader>
            <CardTitle>Task Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Opening Checklists</span>
                <div className="flex items-center space-x-2">
                  <div className="w-16 bg-gray-200 rounded-full h-2">
                    <div className="bg-primary-500 h-2 rounded-full" style={{ width: '60%' }}></div>
                  </div>
                  <span className="text-sm font-medium text-gray-900">60%</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Cleaning Tasks</span>
                <div className="flex items-center space-x-2">
                  <div className="w-16 bg-gray-200 rounded-full h-2">
                    <div className="bg-success-500 h-2 rounded-full" style={{ width: '80%' }}></div>
                  </div>
                  <span className="text-sm font-medium text-gray-900">80%</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Inventory</span>
                <div className="flex items-center space-x-2">
                  <div className="w-16 bg-gray-200 rounded-full h-2">
                    <div className="bg-warning-500 h-2 rounded-full" style={{ width: '40%' }}></div>
                  </div>
                  <span className="text-sm font-medium text-gray-900">40%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
