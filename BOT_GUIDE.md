# Olympus Draft Bot – Complete Guide

---

## STAFF / ADMIN THINGS

These are commands and functions meant for the **Owner**, **Admins**, and **Staff** who manage the server and bot.

### 1. Initial Server Setup (Owner only)

The bot builds the entire server structure (roles, categories, text channels, stage channels) automatically.

- **`@OlympusBot work`** – Auto-creates:
  - Host roles: `Lower Draft Host`, `Mixed Draft Host`, `Higher Draft Host`
  - Player roles: `Lower Draft Player`, `Higher Draft Player`
  - Captain roles: `Lower/Mixed/Higher Team 1-4 Captain` (12 roles)
  - Categories: `Lower Draft`, `Mixed Draft`, `Higher Draft`
  - Channels per type: `〔〕lower-announcement`, `〔〕lower-winners`, `〔〕lower-picks` (and mixed/higher)
  - Stages: `Lower Stage 1-4`, `Mixed Stage 1-4`, `Higher Stage 1-4`

- **`/setup`** – Manual configuration (Owner only). Lets you pick individual roles, channels, categories, and stages with dropdowns instead of auto-building.

- **`@OlympusBot reverse`** – Deletes everything the bot created (roles, channels, categories) while keeping the rest of the server.

- **`@OlympusBot remove everything`** – Wipes ALL channels and categories in the server (keeps `#general` only). **DANGER – use carefully.**

### 2. Test Drafts (Admin only)

- **`/test-draft start type: <lower|mixed|higher>`** – Creates a test draft with 24 fake players and 8 fake captain candidates. Use it to test the picking flow without real users.
- **`/test-draft cancel draft_id: <ID>`** – Cancels a test draft during registration.

### 3. Draft Management (Staff/Admin)

- **`/draft revert draft_id: <ID>`** – (Admin only) Cancels and completely wipes a draft: deletes all created channels/categories and removes captain roles. Hard reset.
- **`/draft force-cancel draft_id: <ID>`** – (Host/Admin) Instantly cancels a draft in ANY state (registration, picking, or matches). Cleans up temporary channels, categories, team roles, and tournament data.
- **`/draft cancel draft_id: <ID>`** – (Host/Admin) Cancels a draft that is still in the **registration** phase (softer version of force-cancel).
- **`/draft move player: <@user> draft_type: <lower|higher>`** – (Host/Admin) Moves a player between the Lower and Higher draft player roles.

### 4. Crash Recovery & Database

- The bot automatically saves all draft state to `data/database.json` (players, captains, picks, turn index, channels).
- If the bot restarts or crashes mid-draft, it **auto-recovers** active drafts on startup:
  - **Registration phase** → resumes the remaining timer and keeps the registration embed live.
  - **Picking phase** → re-posts the picks embed, re-pings the current captain, restarts the turn timer.
  - **Manual mode** → re-sends the `/winner` instructions to the host.
- No data is lost on restart.

---

## HOST THINGS

These are the commands and flows used to run an actual draft.

### 1. Starting a Draft

**`/draft start time: <minutes|unlimited> type: <lower|mixed|higher> automatization: <Automatic|Manual>`**

- **`time`** – Registration window in minutes (1–60) or `unlimited`.
- **`type`** – Lower, Mixed, or Higher draft.
- **`automatization`** – REQUIRED:
  - **`Automatic`** – The bot runs the full flow itself (captain selection + picking phases).
  - **`Manual`** – The bot handles registration, then YOU manage everything manually and report the winner at the end.

A registration panel is posted in the announcement channel with buttons:

- 👑 **Register as Captain**
- 🏐 **Register as Player**
- 🚫 **Unregister** (players can remove themselves before the signup window closes)
- 🚀 **Start Draft** / ❌ **Cancel Draft** (unlimited drafts only, host-only buttons)

### 2. Automatic Mode Flow

1. **Registration** – Players press the buttons, then pick their position (WS, Setter, DS, Lib) from a dropdown. Counters update live on the announcement embed.
2. When the timer ends (or host clicks **Start Draft**), the bot:
   - Selects the captain(s) randomly from the registered captain candidates (4 needed → 2 captains, 8+ → 4 captains).
   - Assigns each captain a team number + captain role.
   - Creates a private `#<type>-draft-picks` channel.
   - Starts the **snake draft order** (Team 1 → 2 → 3 → 4 → 3 → 2 → 1 → repeat).
3. **Picking** – The bot pings the captain whose turn it is and tells them which roles their team still needs. The captain **types the @mention (or username) of the player they want** in the picks channel.
   - 30s reminder + 60s host alert if they stall.
   - Picked player gets a DM saying they were picked.
   - Draft ends when all team rosters are full.
4. **Matches** – (When 4 teams) the bot creates semifinal match channels with **winner-vote buttons labeled with the captains' team names** (e.g., "icy110's Team"). Captains vote, bot advances the bracket and eventually announces the winner + MVP prompt.

### 3. Manual Mode Flow

1. **Registration** – Same buttons/position selection as automatic.
2. When the timer ends, the **host ONLY** receives a DM with:
   - The full list of registered captain candidates.
   - Instructions to use the `/winner` command after the match.
3. You manually organize the teams and play the match (outside the bot).
4. After the match, as host, run:

   **`/winner draft-id: <ID> player1: @user player2: @user player3: @user player4: @user player5: @user player6: @user`**

   - The 6 players are the winning team's roster.
   - All 6 must be registered in the draft (bot returns which user is invalid if not).
   - This posts the winner to the winners channel and sends you the MVP prompt.

### 4. Substitutions

- **`/draft captain-sub draft_type: <lower|mixed|higher>`** – (Host/Admin) Replaces a captain via dropdowns. Transfers the captain role, swaps the team captain, updates draft state.
- **`/draft player-sub draft_type: <type>`** – (Host/Admin) Pre-draft player swap: pick team → pick player to replace → pick the substitute from unpicked players (must match position).
- **`/draft sub draft_id: <ID> sub_in: <@user> sub_out: <@user>`** – (Host/Admin) In-game substitution. Swaps out a player currently on a team, updates the roster, and DMs both users.

### 5. Fixing Stuck Drafts

- **`/draft fix draft_id: <ID>`** – (Host/Admin) If the draft gets stuck during the picking phase (API glitch, rate limit, lost collector), this:
  - Re-evaluates the draft from the database.
  - Re-posts the current picks embed.
  - Re-pings the captain whose turn it is.
  - Restarts the turn timer.
  - No need to restart the bot or remake the draft.

### 6. Leaving a Draft

- **`/draft unregister draft_id: <ID>`** – Removes you from the registration pool (works for both players and captain candidates while registration is open).

### 7. Viewing Results

- **`/bracket draft_type: <lower|mixed|higher>`** – Shows the bracket / final winner for the most recent completed draft of that type.

---

## Command Quick Reference

| Command | Who | What it does |
|---|---|---|
| `/draft start` | Host/Admin | Start a draft (registers automatization mode) |
| `/draft cancel` | Host/Admin | Cancel draft in registration |
| `/draft force-cancel` | Host/Admin | Cancel draft in any state |
| `/draft revert` | Admin | Hard-wipe a draft |
| `/draft fix` | Host/Admin | Repair a stuck drafting phase |
| `/draft captain-sub` | Host/Admin | Replace a captain |
| `/draft player-sub` | Host/Admin | Replace a player pre-draft |
| `/draft sub` | Host/Admin | In-game substitution |
| `/draft unregister` | Everyone | Leave the registration pool |
| `/draft move` | Host/Admin | Move player between Lower/Higher |
| `/winner` | Host/Admin | Report manual-mode winning team |
| `/bracket` | Everyone | View bracket / winner |
| `/test-draft` | Admin | Run tests with fake players |
| `/setup` | Owner | Manual server config |
| `@bot work` | Owner | Auto-build server structure |
| `@bot reverse` | Owner | Delete bot-created structure |
| `@bot remove everything` | Owner | Wipe all channels |