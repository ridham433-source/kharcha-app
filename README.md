# Kharcha

A fast, mobile-first daily expense tracker. Installable on your phone (PWA), works offline, free to host.

Inside it lives **Splitter**, a Splitwise-style tool for trips and shared costs.
**Use Splitter to avoid bitter.**

Kharcha is a placeholder name. To rename it, change `name`/`short_name` in `vite.config.ts` and the `<title>` in `index.html`.

## What it does

**Daily tracking (the main app)**
- Add an expense or income in a few taps with a big custom keypad
- Categories, accounts (cash, bank, UPI, card), notes and dates
- Mark each expense as **Needed** or **Could skip**. Insights turns that into a score
- Monthly budget (total and per category) with progress on Home
- Insights: savings rate, spending by category, day-by-day chart, comparison with last month, biggest expenses
- Savings goals, search and filters, CSV export, JSON backup and restore
- All money is stored in paise (whole numbers), shown with Indian grouping (₹1,00,000)

**Splitter**
- Make a group (Goa trip, Flat 402) and add friends by name
- Add an expense, choose **who paid** (one or several people) and **who it was for**. Not everyone has to be in every expense, so "out of A to Q, this one is only for A to F" works
- Split **equally, by exact amounts, by percentage, or by shares**
- Live balances per person and a **simplified settle-up** (the fewest payments to clear everyone)
- Mark payments as paid, or open a **UPI** payment if the person has a UPI ID saved
- Per-person totals (paid vs share) and category totals
- Share a text summary to WhatsApp
- Your share of every group expense can count in your daily spending (toggle in Profile)

## Two ways to use Splitter

| Mode | Setup | Who adds expenses |
|---|---|---|
| **Solo** | None. Works out of the box | Only you, on your phone |
| **Shared** | Free Supabase project, about 5 minutes, once | Everyone, from their own phone, through an invite link |

Neither costs money. Supabase's free tier needs no card for this amount of data.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # split and settle-up math
npm run build      # production build in dist/
```

## Publish on GitHub Pages

1. Create a new GitHub repository and push this folder to the `main` branch.
2. In the repo go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) builds and deploys on every push. Your app appears at `https://<your-username>.github.io/<repo-name>/`.
4. Open that link on your phone and use **Add to Home Screen** to install it.

Routing uses `#/` URLs and relative paths, so it works under a repo sub-path with no extra settings.

## Turn on shared Splitter groups (optional, free)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste everything from `supabase/schema.sql` and click **Run**.
3. Go to **Project Settings → API** and copy the **Project URL** and the **anon / publishable key**.
4. Give the app those two values in either of these ways:
   - **Easiest for friends:** on GitHub open **Settings → Secrets and variables → Actions → Variables** and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then re-run the workflow. Everyone who opens your site gets sync with no setup.
   - **Or type them in the app:** Profile → Cloud sync for Splitter → Save and test. Invite links then carry the address along, so friends join with one tap.
5. Open a group, tap the share icon, choose **Create invite link** and send it to your friends.

How it stays safe and simple:
- The table is locked. The app can only read or write a group if it knows that group's secret 10-character code, and codes cannot be listed.
- Anyone with the invite link can view and edit that group, so only share it with the people on the trip.
- Edits from different phones are merged per expense. If two people save at the same moment the app re-merges and retries, and the newest edit of each item wins.
- The anon key is meant to be public. Do not put a Supabase *service role* key in this app.

## Project layout

```
src/
  lib/
    money.ts      paise <-> ₹ formatting and parsing
    splits.ts     split, balance and settle-up math (tested)
    store.ts      app state saved in localStorage
    derive.ts     monthly stats, account balances
    cloud.ts      optional Supabase sync and merge
    router.ts     tiny hash router
  pages/          Home, Activity, Insights, AddTx, Splitter, GroupDetail, GroupExpenseForm, More, Join
  components/     BottomNav, TxRow, ui (icons, sheets, controls)
  styles.css      the whole design (tokens at the top)
supabase/schema.sql
.github/workflows/deploy.yml
```

## Good next steps

- Recurring transactions (rent, subscriptions)
- Receipt scanning and item-by-item splitting for restaurant bills
- Multi-currency trips
- Real accounts and login, if you ever want your own history to sync between your devices
- Investments and net worth, if you want them back later

## Notes

- Data lives in your browser. Use **Profile → Download backup** now and then. Clearing site data erases it.
- Fonts (Bricolage Grotesque and Figtree) load from Google Fonts. Offline, the app falls back to system fonts.
