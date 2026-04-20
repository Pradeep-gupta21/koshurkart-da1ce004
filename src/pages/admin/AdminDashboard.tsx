import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";

const AdminDashboard = () => {
  // Badge counts now handled inside DashboardSidebar via useAdminBadges
  return (
    <DashboardLayout variant="admin">
      <Outlet />
    </DashboardLayout>
  );
};

export default AdminDashboard;
