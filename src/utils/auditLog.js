const { EmbedBuilder } = require('discord.js');
const config = require('../config');

function buildLogEmbed({ title, color, description, user, fields = [] }) {
  return new EmbedBuilder()
    .setColor(color || config.colors.info)
    .setTitle(title)
    .setDescription(description)
    .addFields(
      { name: '👤 By', value: `${user ? `<@${user.id}>` : 'Unknown'} | ID: \`${user?.id || '?'}\``, inline: true },
      { name: '🕐 Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      ...fields
    )
    .setTimestamp();
}

async function sendAuditLog(guild, channelId, embed) {
  if (!channelId) return;
  const channel = guild?.channels?.cache?.get(channelId);
  if (!channel) return;
  try {
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error(`Audit log failed (${channelId}):`, e.message);
  }
}

async function logHostAction(guild, user, description, fields = [], color = config.colors.info) {
  await sendAuditLog(guild, config.auditLogChannels?.host, buildLogEmbed({
    title: '📋 Host Action', color, description, user, fields
  }));
}

async function logStaffAction(guild, user, description, fields = [], color = config.colors.info) {
  await sendAuditLog(guild, config.auditLogChannels?.staff, buildLogEmbed({
    title: '🛠️ Staff Action', color, description, user, fields
  }));
}

module.exports = { buildLogEmbed, sendAuditLog, logHostAction, logStaffAction };