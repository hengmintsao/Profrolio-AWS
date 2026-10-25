export function validatePushUpdates(input, head, resolveTag) {
  const updates = input.trim().split(/\r?\n/).filter(Boolean);
  if (!updates.length)
    throw new Error(
      'No outgoing refs supplied; use npm run preflight for a local check.',
    );
  for (const update of updates) {
    const [localRef, localSha, remoteRef, remoteSha, extra] =
      update.split(/\s+/);
    if (
      extra ||
      !/^[a-f0-9]{40}$/.test(localSha ?? '') ||
      !/^[a-f0-9]{40}$/.test(remoteSha ?? '')
    )
      throw new Error('Invalid push update.');
    if (/^0+$/.test(localSha))
      throw new Error(
        'Remote deletion is outside the normal delivery workflow.',
      );
    if (remoteRef === 'refs/heads/main')
      throw new Error('Use a reviewed PR to update main.');
    if (
      localRef.startsWith('refs/heads/') &&
      remoteRef.startsWith('refs/heads/')
    ) {
      if (localSha !== head)
        throw new Error('Only the checked-out, tested HEAD may be pushed.');
    } else if (localRef.startsWith('refs/tags/') && localRef === remoteRef) {
      if (!/^0+$/.test(remoteSha) && remoteSha !== localSha)
        throw new Error(
          'Published release tags are immutable; use a new version.',
        );
      if (resolveTag(localRef.slice('refs/tags/'.length), localSha) !== head)
        throw new Error(
          'Release tag must identify the checked-out, tested HEAD.',
        );
    } else
      throw new Error(
        'Only the current branch or a validated release tag may be pushed.',
      );
  }
}
