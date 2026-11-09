// A deliverable's preview address (Preview.tsx previewUrl), read before kernel.ts starts: it keeps the address, the
// snapshot link and the history to itself, so the kernel does nothing to them while this is set.
const q = new URLSearchParams(location.search)
export const preview = q.get('preview') && q.get('folder')?.startsWith('/') ? { id: q.get('preview')!, folder: q.get('folder')!, on: q.get('on') } : null
