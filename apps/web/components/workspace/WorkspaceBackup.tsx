"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useMeridian } from "@/components/workspace/MeridianProvider";
import { MAX_BACKUP_BYTES, parseWorkspaceBackup } from "@/lib/workspace-backup";

export function WorkspaceBackup() {
  const { createBackup, importBackup, hasUnsavedChanges, storageAvailable } = useMeridian();
  const inputRef = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<ReturnType<typeof parseWorkspaceBackup> | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const exportData = () => {
    try {
      const blob = new Blob([JSON.stringify(createBackup(), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `meridian-workspace-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click(); URL.revokeObjectURL(url);
      setMessage("Workspace backup downloaded.");
    } catch { setMessage("Could not create the backup. Check browser storage access and try again."); }
  };
  const readFile = async (file?: File) => {
    setMessage(""); setBackup(null);
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) { setMessage("Backup exceeds the 5 MB limit."); return; }
    setBusy(true);
    try { setBackup(parseWorkspaceBackup(await file.text())); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not read this backup."); }
    finally { setBusy(false); }
  };
  const apply = () => {
    if (!backup || hasUnsavedChanges()) return;
    const result = importBackup(backup);
    if (!result) { setMessage("Import could not be saved. Your current workspace is still open; check available browser storage."); return; }
    setBackup(null);
    if (inputRef.current) inputRef.current.value = "";
    setMessage(`Import complete. Added ${result.imported} item${result.imported === 1 ? "" : "s"}; skipped ${result.skipped} collision or unavailable reference${result.skipped === 1 ? "" : "s"}. Existing local items win when keys collide. Settings and display units were restored from the backup.`);
  };
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger render={<Button variant="outline" size="sm" className="w-full min-h-11 group-data-[collapsible=icon]:px-0" aria-label="Workspace backup" title="Workspace backup" />}><Download data-icon="inline-start" /><span className="group-data-[collapsible=icon]:sr-only">Workspace backup</span></SheetTrigger>
    <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
    <SheetHeader><SheetTitle>Workspace backup</SheetTitle><SheetDescription>Export or restore this browser’s fields, plans, drafts, economics and map preferences.</SheetDescription></SheetHeader>
    <div className="px-4 pb-4">
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={exportData}><Download data-icon="inline-start" />Export</Button>
      <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}><Upload data-icon="inline-start" />Choose backup</Button>
      <input ref={inputRef} className="sr-only" type="file" accept="application/json,.json" aria-label="Choose Meridian backup JSON" onChange={(event) => void readFile(event.target.files?.[0])} />
    </div>
    {busy && <p role="status" className="mt-2 text-xs text-muted-foreground">Checking backup…</p>}
    {backup && <div className="mt-3 rounded-md border p-3 text-xs">
      <p className="font-medium">Backup ready to review</p>
      <p className="mt-1 text-muted-foreground">{backup.fields.length} fields · {Object.keys(backup.plans).length} plans · {Object.keys(backup.drafts).length} drafts · {Object.keys(backup.economics).length} economics records · {backup.unitSystem === "us" ? "U.S." : "Metric"} units</p>
      <p className="mt-2 text-muted-foreground">Import merges records. Existing local records win on key collisions; fields with duplicate IDs and records referring to unavailable fields are skipped. Map settings and units come from this backup.</p>
      {hasUnsavedChanges() && <p role="alert" className="mt-2 text-destructive">Save or discard the field edit before importing.</p>}
      <div className="mt-3 flex gap-2"><Button size="sm" onClick={apply} disabled={hasUnsavedChanges() || !storageAvailable}>Import and merge</Button><Button size="sm" variant="outline" onClick={() => setBackup(null)}>Cancel</Button></div>
    </div>}
    {message && <p role="status" aria-live="polite" className="mt-2 text-xs text-muted-foreground">{message}</p>}
    </div></SheetContent>
  </Sheet>;
}
