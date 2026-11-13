export interface Cat {
  id: string;
  emoji: string;
}

export const EXPENSE_CATS: Cat[] = [
  { id: 'Food', emoji: '🍜' },
  { id: 'Groceries', emoji: '🛒' },
  { id: 'Transport', emoji: '🚌' },
  { id: 'Shopping', emoji: '🛍️' },
  { id: 'Bills', emoji: '💡' },
  { id: 'Rent', emoji: '🏠' },
  { id: 'Health', emoji: '💊' },
  { id: 'Fun', emoji: '🎬' },
  { id: 'Travel', emoji: '✈️' },
  { id: 'Education', emoji: '📚' },
  { id: 'Other', emoji: '🧾' },
];

export const INCOME_CATS: Cat[] = [
  { id: 'Salary', emoji: '💼' },
  { id: 'Gift', emoji: '🎁' },
  { id: 'Refund', emoji: '↩️' },
  { id: 'Other income', emoji: '💰' },
];

export const catEmoji = (id: string): string =>
  id === 'Khata' ? '🤝' : ([...EXPENSE_CATS, ...INCOME_CATS].find((c) => c.id === id)?.emoji ?? '🧾');

export const GROUP_EMOJIS = ['🏖️', '🏔️', '🍕', '🏠', '🎉', '🚗', '✈️', '🍻', '🎬', '🏕️'];
