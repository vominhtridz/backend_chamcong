const LEAVE_TYPES = ['annual', 'sick', 'personal', 'other'];

const datesOverlap = (aFrom, aTo, bFrom, bTo) => aFrom <= bTo && bFrom <= aTo;

const findOverlappingLeave = (existingLeaves, userId, dateFrom, dateTo, excludeId = null) =>
  existingLeaves.find(
    (l) =>
      l.userId === userId &&
      l.id !== excludeId &&
      (l.status === 'Pending' || l.status === 'Approved') &&
      datesOverlap(l.dateFrom, l.dateTo, dateFrom, dateTo)
  );

module.exports = {
  LEAVE_TYPES,
  datesOverlap,
  findOverlappingLeave,
};
