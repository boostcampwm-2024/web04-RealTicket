export const getPriceWon = (price: number) => {
  if (price != 0 && !price) return NaN;

  return price.toLocaleString() + '원';
};
