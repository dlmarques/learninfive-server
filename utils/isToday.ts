export const isToday = (date: Date) => {
  return date.setHours(0, 0, 0, 0) === new Date().setHours(0, 0, 0, 0);
};
