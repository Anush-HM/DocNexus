import { apiFetch, readError } from './api.js';

// Downloads a ready-made PDF built by the backend (real file, figures included).
export async function downloadPdf(projectId, kind) {
  try {
    const res = await apiFetch(`/projects/${projectId}/export/${kind}`);
    if (!res.ok) throw new Error(await readError(res, 'Could not create the PDF.'));
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = kind === 'notes' ? 'DocNexus-Unified-Notes.pdf' : 'DocNexus-Revision-Sheet.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    alert(err.message || 'PDF export failed.');
  }
}
