const formatter = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
  hour12: false,
});

export const getLocalISOString = (date = new Date()) => {
  return formatter.format(date).replace(' ', 'T').replace(',', '.') + 'Z';
};
