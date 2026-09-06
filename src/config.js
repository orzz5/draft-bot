require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  ownerId: '667791939453583373',
  trialHighPlayerRoleId: '1542878277474193649',

  highDrafterRoleId: '1541972950964510801',
  lowerDrafterRoleId: '1541972950268387408',
  highVoteRoleId: '1544442806595092490',
  highVoteChannelId: '1544122071070539786',
  highKickChannelId: '1544466327992012840',
  trialReviewChannelId: '1544321344504729700',
  highRequestVotesNeeded: 7,
  highRequestCooldownMs: 2 * 24 * 60 * 60 * 1000,
  trialDurationMs: 7 * 24 * 60 * 60 * 1000,

  blacklistRoleId: '1542907895794892912',
  blacklistChannelId: '1542908764351373462',

  mvpsChannels: {
    lower: '1542254725737484388',
    mixed: '1542254791055380510',
    higher: '1542254672050524211'
  },

  auditLogChannels: {
    host: '1543011639903912066',
    staff: '1543033357418627154'
  },

  statsLogChannelId: '1546176191793205420',

  verification: {
    verifiedRoleId: '1542162308556529685',
    unverifiedRoleId: '1542656004959899738',
    verificationChannelId: '1542656417247399956',
    legacyVerifiedRoleIds: ['1542655923737071737']
  },

  draftTypes: ['lower', 'mixed', 'higher'],
  positions: ['WS', 'Setter', 'DS', 'Lib'],
  teamRoster: { WS: 2, Setter: 1, DS: 2, Lib: 1 },
  maxTeams: 4,
  turnTime: { reminder: 30000, hostAlert: 60000 },

  colors: {
    primary: 0x5865F2,
    success: 0x57F287,
    warning: 0xFEE75C,
    danger: 0xED4245,
    info: 0x00b4d8,
    draft: 0x9b59b6,
    match: 0xe67e22
  },

  structure: {
    roles: {
      hosts: ['Lower Draft Host', 'Mixed Draft Host', 'Higher Draft Host'],
      players: ['Lower Draft Player', 'Higher Draft Player']
    },
    categories: {
      draft: ['Lower Draft', 'Mixed Draft', 'Higher Draft']
    },
    channels: {
      perType: ['announcement', 'winners', 'picks']
    },
    stages: {
      perType: 4
    },
    draftTypes: ['lower', 'mixed', 'higher'],
    teamNumbers: [1, 2, 3, 4]
  }
};
