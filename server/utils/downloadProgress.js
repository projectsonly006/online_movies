const progressStore = new Map();

export const setProgress = (jobId, data) => {
  progressStore.set(jobId, {
    ...data,
    updatedAt: Date.now(),
  });
};

export const getProgress = (jobId) => {
  return progressStore.get(jobId);
};

export const deleteProgress = (jobId) => {
  progressStore.delete(jobId);
};
