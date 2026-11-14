"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { validSavedField } from "@/lib/fields/storage";
export function FieldGuards() {
  const {
    draftDirty,
    hasUnsavedChanges,
    fieldDraft,
    drawing,
    requestTransition,
    pendingAction,
    resolveTransition,
  } = useMeridian();
  const router = useRouter(),
    pathname = usePathname();
  useEffect(() => {
    if (!draftDirty) return;
    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element)?.closest("a[href]");
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const url = new URL(anchor.href);
      if (url.origin !== location.origin || url.pathname === pathname) return;
      event.preventDefault();
      event.stopPropagation();
      requestTransition(() =>
        router.push(url.pathname + url.search + url.hash),
      );
    };
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unload);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", unload);
    };
  }, [draftDirty, pathname, router, requestTransition]);
  useEffect(() => {
    if (
      draftDirty &&
      hasUnsavedChanges() &&
      pathname !== "/" &&
      !pendingAction
    ) {
      const destination = pathname;
      router.replace("/");
      requestTransition(() => router.push(destination));
    }
  }, [
    pathname,
    draftDirty,
    pendingAction,
    router,
    requestTransition,
    hasUnsavedChanges,
  ]);
  const canSave =
    fieldDraft &&
    !["polygon", "edit"].includes(drawing.mode) &&
    validSavedField(fieldDraft);
  return (
    <AlertDialog
      open={!!pendingAction}
      onOpenChange={(open) => {
        if (!open) resolveTransition("stay");
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Save field changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Your boundary or field details have unsaved changes. Save them,
            discard them, or stay here to continue editing.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-wrap">
          <Button variant="outline" onClick={() => resolveTransition("stay")}>
            Stay here
          </Button>
          <Button
            variant="outline"
            onClick={() => resolveTransition("discard")}
          >
            Discard changes
          </Button>
          <Button disabled={!canSave} onClick={() => resolveTransition("save")}>
            Save changes
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
