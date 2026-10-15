export function createStoreContact({ put, get }) {
  return async (submission) => {
    try {
      await put(submission);
    } catch (error) {
      if (error.name !== 'ConditionalCheckFailedException') throw error;
      const existing = await get(submission.id);
      if (!existing) throw new Error('Existing submission could not be read');
      if (existing.payloadFingerprint !== submission.payloadFingerprint) {
        const conflict = new Error('Submission key reused with different input');
        conflict.name = 'IdempotencyConflict';
        throw conflict;
      }
    }
  };
}
