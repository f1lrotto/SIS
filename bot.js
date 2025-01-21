const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const dotenv = require('dotenv');

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

// Configuration
const JOIN_PROBABILITY = 0.8; // 80% chance to join
const MIN_DELAY_MS = 60000; // 1 minute
const MAX_DELAY_MS = 300000; // 5 minutes
let currentVoiceConnection = null;
let pendingJoin = null;

function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
}

// Function to get random delay between MIN_DELAY_MS and MAX_DELAY_MS
function getRandomDelay() {
    return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1) + MIN_DELAY_MS);
}

client.once('ready', () => {
    log(`Bot is ready! Logged in as ${client.user.tag}`);
});

// Function to actually join the channel
async function joinChannel(guild, channel) {
    try {
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false  // Don't deafen the bot
        });
        currentVoiceConnection = connection;
        log(`Successfully joined voice channel: ${channel.name}`);
    } catch (error) {
        log(`Error joining voice channel: ${error.message}`);
        console.error(error);
    }
    pendingJoin = null;
}

// Function to check voice channels and potentially join one
async function checkAndJoinVoiceChannel(guild) {
    // If we're already in a voice channel or have a pending join, don't do anything
    if (currentVoiceConnection || pendingJoin) {
        log('Already in a voice channel or have pending join, skipping join check');
        return;
    }

    // Get all voice channels with members
    const activeVoiceChannels = guild.channels.cache
        .filter(channel => channel.type === 2) // 2 is the type for voice channels
        .filter(channel => {
            // Count members excluding bots
            const realMembers = channel.members.filter(member => !member.user.bot).size;
            return realMembers > 0;
        });

    // If no active voice channels, return
    if (activeVoiceChannels.size === 0) {
        log('No active voice channels with real users found');
        return;
    }

    // Random chance to join
    if (Math.random() > JOIN_PROBABILITY) {
        log('Random chance prevented joining');
        return;
    }

    // Pick a random active voice channel
    const channelsArray = Array.from(activeVoiceChannels.values());
    const randomChannel = channelsArray[Math.floor(Math.random() * channelsArray.length)];
    
    // Calculate random delay
    const delay = getRandomDelay();
    const joinTime = new Date(Date.now() + delay);
    
    log(`Planning to join channel: ${randomChannel.name} in ${Math.floor(delay/1000)} seconds (at ${joinTime.toLocaleTimeString()})`);

    // Store the pending join information
    pendingJoin = {
        channel: randomChannel,
        timeout: setTimeout(() => joinChannel(guild, randomChannel), delay)
    };
}

// Function to check if we should leave
function checkAndLeaveVoiceChannel(guild) {
    if (!currentVoiceConnection) return;

    const connection = getVoiceConnection(guild.id);
    if (!connection) {
        log('Voice connection lost, resetting state');
        currentVoiceConnection = null;
        return;
    }

    const channel = guild.channels.cache.get(connection.joinConfig.channelId);
    if (!channel) {
        log('Channel no longer exists, leaving');
        connection.destroy();
        currentVoiceConnection = null;
        return;
    }

    // Count real users (non-bots) in the channel
    const realMemberCount = channel.members.filter(member => !member.user.bot).size;
    log(`Current channel (${channel.name}) has ${realMemberCount} real users`);

    if (realMemberCount === 0) {
        log(`Leaving channel ${channel.name} as there are no real users left`);
        connection.destroy();
        currentVoiceConnection = null;

        // If we have a pending join, cancel it
        if (pendingJoin) {
            log('Cancelling pending join as we just left a channel');
            clearTimeout(pendingJoin.timeout);
            pendingJoin = null;
        }
    }
}

// Listen for voice state updates
client.on('voiceStateUpdate', (oldState, newState) => {
    // Ignore bot voice state updates
    if (oldState.member.user.bot || newState.member.user.bot) {
        return;
    }

    // Get the guild from either state
    const guild = oldState.guild || newState.guild;
    
    // Log the voice state change
    log(`Voice state update: ${oldState.member.user.tag} | ` +
        `Old channel: ${oldState.channel?.name || 'None'} | ` +
        `New channel: ${newState.channel?.name || 'None'}`);
    
    // Check if we should join or leave
    checkAndJoinVoiceChannel(guild);
    checkAndLeaveVoiceChannel(guild);
});

// Replace 'YOUR_BOT_TOKEN' with your actual bot token
client.login(process.env.TOKEN);
