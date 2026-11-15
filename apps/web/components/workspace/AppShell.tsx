"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
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
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { FieldGuards } from "@/components/workspace/FieldGuards";
import { contextKey } from "@/lib/workspace";
import { WorkspaceBackup } from "@/components/workspace/WorkspaceBackup";
const MapPreview = dynamic(() => import("@/components/map/MapPreview"), {
  loading: () => <div role="status" className="flex h-full items-center justify-center text-sm text-muted-foreground">Opening map…</div>,
});
import { cn } from "@/lib/utils";

const mapRoutes = new Set(["/", "/fields"]);
const destinations = [
  { href: "/", title: "Explore", icon: Compass },
  { href: "/planner", title: "Field Planner", icon: Leaf },
  { href: "/intel", title: "Ask Meridian", icon: MessageSquare },
];
function AppNavigation() {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [pathname, isMobile, setOpenMobile]);
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
              {destinations.map(({ href, title, icon: Icon }) => {
                const active = href === "/"
                  ? pathname === "/"
                  : pathname === href || pathname.startsWith(`${href}/`) || href === "/planner" && (pathname === "/economics" || pathname === "/fields");
                return <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    size="lg"
                    className="group-data-[collapsible=icon]:justify-center"
                    isActive={active}
                    tooltip={title}
                    render={
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setOpenMobile(false)}
                      />
                    }
                  >
                    <Icon aria-hidden="true" />
                    <span className="group-data-[collapsible=icon]:sr-only">{title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:items-center">
        <WorkspaceBackup />
      </SidebarFooter>
    </Sidebar>
  );
}
function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, change, settings, activeField } = useMeridian();
  const changeRef = useRef(change);
  changeRef.current = change;
  const [mapVisited, setMapVisited] = useState(mapRoutes.has(pathname));
  useEffect(() => {
    if (mapRoutes.has(pathname)) setMapVisited(true);
    if (!ready) return;
    if (pathname === "/" || pathname === "/fields") changeRef.current("mode", "field");
  }, [pathname, ready]);
  const isPlanEditor = pathname === "/planner/calendar" || pathname === "/economics" || pathname === "/planner/review";
  useEffect(() => {
    if (!ready || !isPlanEditor || !activeField) return;
    try {
      window.localStorage.setItem(`meridian.planner-step.v1:${contextKey(settings)}`, pathname);
    } catch {
      // Local persistence can be unavailable; direct navigation still works.
    }
  }, [ready, activeField, isPlanEditor, pathname, settings]);
  const page = destinations.find((d) => d.href === pathname || (d.href !== "/" && pathname.startsWith(`${d.href}/`)));
  return (
    <>
      <a href="#workspace-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:p-3 focus:ring-2 focus:ring-ring">Skip to workspace</a>
      <AppNavigation />
      <SidebarInset id="workspace-content" tabIndex={-1} className="h-dvh min-h-0 min-w-0 overflow-hidden">
        {!mapRoutes.has(pathname) && (
          <header className={cn("flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2 md:px-6", isPlanEditor ? "min-h-14" : "min-h-16")}>
            <SidebarTrigger aria-label="Toggle navigation" />
            <Separator orientation="vertical" className="my-4" />
            {isPlanEditor ? <>
              <Link href="/planner" className={cn(buttonVariants({ variant: "ghost" }), "min-h-11 shrink-0")}>Back to fields</Link>
              <nav aria-label="Plan editor" className="order-3 flex w-full min-w-0 flex-wrap gap-1 md:order-none md:ml-auto md:w-auto">
                <Link className={cn(buttonVariants({ variant: pathname === "/planner/calendar" ? "secondary" : "ghost" }), "min-h-11")} href="/planner/calendar" aria-current={pathname === "/planner/calendar" ? "page" : undefined}>Calendar</Link>
                <Link className={cn(buttonVariants({ variant: pathname === "/economics" ? "secondary" : "ghost" }), "min-h-11")} href="/economics" aria-current={pathname === "/economics" ? "page" : undefined}>Budget</Link>
                <Link className={cn(buttonVariants({ variant: pathname === "/planner/review" ? "secondary" : "ghost" }), "min-h-11")} href="/planner/review" aria-current={pathname === "/planner/review" ? "page" : undefined}>Review</Link>
              </nav>
              {activeField && <p aria-label="Plan context" className="min-w-0 text-sm text-muted-foreground md:ml-3"><span className="font-medium text-foreground">{activeField.name}</span> · {settings.crop[0].toUpperCase() + settings.crop.slice(1)}</p>}
            </> : <span className="mr-auto text-sm font-medium">{page?.title ?? "Meridian"}</span>}
          </header>
        )}
        <div className="relative min-h-0 flex-1">
          {ready ? (
            <>
              {mapVisited && (
                <div
                  className={cn(
                    "absolute inset-0",
                    !mapRoutes.has(pathname) && "invisible pointer-events-none",
                  )}
                  aria-hidden={!mapRoutes.has(pathname)}
                  inert={!mapRoutes.has(pathname)}
                >
                  <MapPreview />
                </div>
              )}
              {!mapRoutes.has(pathname) && (
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
