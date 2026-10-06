/** Strip Electron's "Error invoking remote method 'x': Error: " prefix. */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}

export async function alertError(error: unknown): Promise<void> {
  await window.api.dialog.alert("エラー", errorMessage(error));
}
