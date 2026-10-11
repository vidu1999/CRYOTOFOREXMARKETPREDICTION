export function downloadFile(filename: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.replace(/[^\w.\-]/g, '_');
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function readStored<T>(
  key: string,
  fallback: T,
  validate: (value: unknown) => value is T,
): T {
  try {
    const raw = localStorage.getItem(`vector.${key}`);
    const value: unknown = raw ? JSON.parse(raw) : null;
    return validate(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function saveStored(key: string, value: unknown) {
  try {
    localStorage.setItem(`vector.${key}`, JSON.stringify(value));
  } catch {
    /* Storage may be blocked; the workspace still works. */
  }
}
