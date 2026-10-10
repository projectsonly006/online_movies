const progressStore = new Map();

export const setProgress = (id, progress) => {
  progressStore.set(id, progress);
};

export const getProgress = (id) => {
  return progressStore.get(id) || null;
};

export const deleteProgress = (id) => {
  progressStore.delete(id);
};

export default progressStore;
