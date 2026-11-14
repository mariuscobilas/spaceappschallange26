"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Calculator,
  Compass,
  Leaf,
  MessageSquare,
  PanelLeftClose,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { FieldGuards } from "@/components/workspace/FieldGuards";
import { FieldContext } from "@/components/workspace/FieldContext";
import { WorkspaceBackup } from "@/components/workspace/WorkspaceBackup";
import MapPreview from "@/components/map/MapPreview";
import { cn } from "@/lib/utils";

const destinations = [
  { href: "/", title: "Explore", icon: Compass },
  { href: "/planner", title: "Field Planner", icon: Leaf },
  { href: "/economics", title: "Economics", icon: Calculator },
  { href: "/intel", title: "Ask Meridian", icon: MessageSquare },
];
function AppNavigation() {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon" aria-label="Main navigation">
      <SidebarHeader className="px-4 py-5 group-data-[collapsible=icon]:px-2">
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <Link
            href="/"
            aria-label="Meridian home"
            onClick={() => setOpenMobile(false)}
            className="flex min-w-0 items-center gap-2.5"
          >
            <svg
              className="size-7 shrink-0 text-primary"
              viewBox="0 0 36 36"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              aria-hidden="true"
            >
              <path d="M18 3.5 31 11v14L18 32.5 5 25V11z" />
              <path d="M18 3.5v29M5 11l26 14M31 11 5 25" />
              <circle cx="18" cy="18" r="4" fill="var(--sidebar)" />
            </svg>
            <span className="text-xl font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
              Meridian
            </span>
          </Link>
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close navigation"
              onClick={() => setOpenMobile(false)}
            >
              <PanelLeftClose />
            </Button>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent role="navigation" aria-label="Main navigation">
        <SidebarGroup className="px-3 group-data-[collapsible=icon]:px-2">
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {destinations.map(({ href, title, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    size="lg"
                    className="group-data-[collapsible=icon]:justify-center"
                    isActive={pathname === href || (href !== "/" && pathname.startsWith(`${href}/`))}
                    tooltip={title}
                    render={
                      <Link
                        href={href}
                        aria-current={pathname === href ? "page" : undefined}
                        onClick={() => setOpenMobile(false)}
                      />
                    }
                  >
                    <Icon aria-hidden="true" />
                    <span className="group-data-[collapsible=icon]:sr-only">{title}</span>
                  </SidebarMenuButton>
                  {href === "/planner" && <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        className="min-h-11 md:min-h-7"
                        isActive={pathname === "/planner/saved"}
                        render={<Link href="/planner/saved" aria-current={pathname === "/planner/saved" ? "page" : undefined} onClick={() => setOpenMobile(false)} />}
                      >
                        <span>Saved plans</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-5 group-data-[collapsible=icon]:hidden">
        <WorkspaceBackup />
        <Separator />
        <p className="pt-3 text-xs leading-relaxed text-muted-foreground">
          Your workspace stays in this browser.
          <br />
          No account needed.
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready } = useMeridian();
  const [mapVisited, setMapVisited] = useState(pathname === "/");
  useEffect(() => {
    if (pathname === "/") setMapVisited(true);
  }, [pathname]);
  const page = destinations.find((d) => d.href === pathname || (d.href !== "/" && pathname.startsWith(`${d.href}/`)));
  return (
    <>
      <AppNavigation />
      <SidebarInset className="h-dvh min-h-0 min-w-0 overflow-hidden">
        {pathname !== "/" && (
          <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3 md:px-6">
            <SidebarTrigger aria-label="Toggle navigation" />
            <Separator orientation="vertical" className="my-4" />
            <span className="mr-auto text-sm font-medium">
              {pathname === "/planner/saved" ? "Saved plans" : page?.title ?? "Meridian"}
            </span>
            <FieldContext />
          </header>
        )}
        <div className="relative min-h-0 flex-1">
          {ready ? (
            <>
              {mapVisited && (
                <div
                  className={cn(
                    "absolute inset-0",
                    pathname !== "/" && "invisible pointer-events-none",
                  )}
                  aria-hidden={pathname !== "/"}
                  inert={pathname !== "/"}
                >
                  <MapPreview />
                </div>
              )}
              {pathname !== "/" && (
                <div className="absolute inset-0 overflow-y-auto bg-background">
                  {children}
                </div>
              )}
            </>
          ) : (
            <div
              className="flex h-full flex-col items-center justify-center gap-4"
              role="status"
            >
              <Skeleton className="h-8 w-32" />
              <p className="text-sm text-muted-foreground">Opening Meridian…</p>
            </div>
          )}
        </div>
      </SidebarInset>
    </>
  );
}
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delay={300}>
      <SidebarProvider
        className="h-dvh min-h-0"
        style={{ "--sidebar-width": "14.5rem" } as React.CSSProperties}
      >
        <WorkspaceShell>{children}</WorkspaceShell>
        <FieldGuards />
      </SidebarProvider>
    </TooltipProvider>
  );
}
