function generateOrderNumber(prefix = 'NA') {
  const now = new Date();
  const y = now.getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  // Example: NA-2026-4821
  return `${prefix}-${y}-${rand}`;
}

module.exports = { generateOrderNumber };
