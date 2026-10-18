/** Compare complete drafts, not just revision numbers: drafts can change within one revision. */
export function projectStamp(project) { return JSON.stringify(project); }

export function requireUnchangedProject(current, expectedStamp) {
  if (projectStamp(current) !== expectedStamp) throw new Error('O projeto foi alterado durante esta operação. Suas alterações foram preservadas; repita a abertura ou solicite uma nova proposta.');
}

/** Never replace edits made while the current draft was being preserved asynchronously. */
export async function preserveBeforeReplacing(getProject, preserve) {
  const snapshot = structuredClone(getProject());
  const stamp = projectStamp(snapshot);
  await preserve(snapshot);
  requireUnchangedProject(getProject(), stamp);
  return snapshot;
}

export function nextCloudRevision(incoming, current, revisions = []) {
  return Math.max(incoming.revision, current.id === incoming.id ? current.revision : 0,
    ...revisions.filter(item => item.projectId === incoming.id).map(item => item.revision)) + 1;
}
