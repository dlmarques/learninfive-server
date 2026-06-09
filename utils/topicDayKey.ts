export const getUtcDayKey = (date = new Date()) => {
  return date.toISOString().slice(0, 10);
};
