process.on('warning', (w) => {
  if (w.name === 'DeprecationWarning' && w.message.includes('clientReady')) return;
  console.warn(w);
});

const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { loadDraftsFromDisk, setClient, persistDrafts, getActiveDrafts } = require('./state/drafts');
const { loadTournamentsFromDisk } = require('./state/tournaments');
const { loadStatsFromDisk } = require('./utils/stats');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  }
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

client.once('clientReady', () => {
  setClient(client);
  loadDraftsFromDisk();
  loadTournamentsFromDisk();
  loadStatsFromDisk();
  const { setClient: setBlacklistClient, loadBlacklistsFromDisk } = require('./utils/blacklist');
  setBlacklistClient(client);
  loadBlacklistsFromDisk();

  const { loadVotationsFromDisk, persistVotations } = require('./state/votations');
  loadVotationsFromDisk();

  const { setClient: setTrialClient, loadTrialMembersFromDisk, rescheduleAllTrials } = require('./state/trialReviews');
  setTrialClient(client);
  loadTrialMembersFromDisk();
  rescheduleAllTrials();

  const activeDrafts = getActiveDrafts();
  if (activeDrafts.size > 0) {
    console.log(`🔄 Recovering ${activeDrafts.size} active draft(s)...`);
    const { recoverDraft } = require('./utils/recovery');
    for (const [, draft] of activeDrafts) {
      recoverDraft(draft, client).catch(e => console.error(`Recovery failed for ${draft.id}:`, e));
    }
  }

  setInterval(() => {
    persistDrafts();
    const { persistTournaments } = require('./state/tournaments');
    persistTournaments();
    persistVotations();
  }, 30000);
});

client.login(config.token);
