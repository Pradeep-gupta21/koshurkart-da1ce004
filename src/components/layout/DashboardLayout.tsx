import { type ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import DashboardSidebar from "@/components/navigation/DashboardSidebar";

interface DashboardLayoutProps {
  variant: "admin" | "vendor";
  title?: string;
  children: ReactNode;
}

const SIDEBAR_STORAGE_KEY = "nexus-dashboard-sidebar-open";

const DashboardLayout = ({ variant, title, children }: DashboardLayoutProps) => {
  const stored = typeof window !== "undefined" ? localStorage.getItem(SIDEBAR_STORAGE_KEY) : null;
  const defaultOpen = stored === null ? true : stored === "true";

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      onOpenChange={(open) => {
        try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open)); } catch { /* ignore */ }
      }}
    >
      <div className="min-h-[calc(100vh-8rem)] flex w-full bg-background">
        <DashboardSidebar variant={variant} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center gap-2 border-b bg-background/95 px-4 sticky top-16 z-30">
            <SidebarTrigger />
            {title && <h1 className="text-sm font-medium text-foreground truncate">{title}</h1>}
          </header>
          <main className="flex-1 p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default DashboardLayout;
