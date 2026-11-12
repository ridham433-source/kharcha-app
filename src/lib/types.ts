export type ID = string;
export type TxType = 'expense' | 'income';

export interface Account {
  id: ID;
  name: string;
  kind: 'cash' | 'bank' | 'upi' | 'card' | 'wallet';
  openingPaise: number;
  color: string;
  archived?: boolean;
}

export interface Tx {
  id: ID;
  type: TxType;
  amountPaise: number;
  category: string;
  accountId: ID | null;
  date: string; // YYYY-MM-DD (local)
  note: string;
  necessary: boolean; // only meaningful for expenses
  createdAt: number;
}

export interface Goal {
  id: ID;
  name: string;
  targetPaise: number;
  savedPaise: number;
  deadline?: string;
}

/* ---------------- Splitter ---------------- */

export interface Member {
  id: ID;
  name: string;
  upi?: string;
  updatedAt: number;
  deleted?: boolean;
}

export type SplitType = 'equal' | 'exact' | 'percent' | 'shares';

export interface GroupExpense {
  id: ID;
  title: string;
  category: string;
  date: string;
  amountPaise: number;
  /** memberId -> paise paid. Can have several payers. Must add up to amountPaise. */
  paidBy: Record<ID, number>;
  splitType: SplitType;
  /**
   * Only members listed here take part in the split.
   * equal: 1 each | exact: paise | percent: percent | shares: share count
   */
  weights: Record<ID, number>;
  note?: string;
  updatedAt: number;
  deleted?: boolean;
}

export interface Payment {
  id: ID;
  from: ID;
  to: ID;
  amountPaise: number;
  date: string;
  note?: string;
  updatedAt: number;
  deleted?: boolean;
}

/** The part of a group that is shared between phones. */
export interface GroupDoc {
  id: ID;
  name: string;
  emoji: string;
  createdAt: number;
  metaUpdatedAt: number;
  updatedAt: number;
  members: Member[];
  expenses: GroupExpense[];
  payments: Payment[];
}

export interface Group extends GroupDoc {
  /** Present once the group is shared through the cloud. */
  code?: string;
  /** Last server version we synced with. */
  version?: number;
}

export interface Settings {
  userName: string;
  includeGroupShare: boolean;
  cloudUrl: string;
  cloudKey: string;
}

export interface AppState {
  v: 1;
  accounts: Account[];
  txs: Tx[];
  /** category -> monthly limit in paise. "_total" is the overall monthly budget. */
  budgets: Record<string, number>;
  goals: Goal[];
  groups: Group[];
  /** groupId -> memberId that is "me" on this device */
  meIds: Record<ID, ID>;
  settings: Settings;
}
