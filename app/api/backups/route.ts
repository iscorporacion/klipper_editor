import { NextRequest, NextResponse } from "next/server";
import { WORKSPACE_ROOT } from "@/lib/workspace";
import { BACKUP_DIRECTORY, BACKUP_RULES_FILE } from "@/scripts/backup-paths.mjs";
import { BackupError, readBackupRules, saveBackupRules } from "@/lib/backup-rules";
import { deleteBackups, migrateBackups, previewBackupMigration } from "@/lib/backup-migration";
import { getMoonrakerStatus } from "@/lib/moonraker";

const failure = (error: unknown) => NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo administrar las copias" }, { status: error instanceof BackupError ? error.status : 500 });
export async function GET() {
  try { return NextResponse.json({ ...(await readBackupRules()), location: `${WORKSPACE_ROOT}/${BACKUP_DIRECTORY}`, rulesFile: BACKUP_RULES_FILE }); }
  catch (error) { return failure(error); }
}
export async function PUT(request: NextRequest) {
  try { const body = await request.json(); return NextResponse.json(await saveBackupRules(body.rules, body.revision)); }
  catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.action === "preview") return NextResponse.json(await previewBackupMigration());
    if (body.action !== "move" && body.action !== "delete") throw new BackupError("Accion invalida");
    if (body.action === "delete" && body.confirm !== true) throw new BackupError("Confirma el borrado definitivo");
    const status = await getMoonrakerStatus();
    if (status.printing || status.webhooksState !== "ready") throw new BackupError("Esta operacion requiere Klipper listo y sin impresion activa ni pausada", 409);
    return NextResponse.json(await (body.action === "delete" ? deleteBackups : migrateBackups)(body.items, body.revision));
  } catch (error) { return failure(error); }
}
