import "dotenv/config";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const PREFIX = "!";

// guildId -> channelId (hvilken kanal spawns skal i per server)
const spawnChannels = new Map();

// Global encounter (kun én om gangen på tvers av alle servere)
let activeEncounter = null;
// Timeout for hvor lenge en Pokémon blir før den stikker
let activeEncounterTimeout = null;

// Map for fangede pokemons: userId -> [pokemon, ...]
const inventory = new Map();

// Konfig for spawn-tid (nå 5–15 sek for testing – bytt til minutter senere)
const MIN_SPAWN_MS = 1 * 60 * 1000;
const MAX_SPAWN_MS = 10 * 60 * 1000;

// Hvor lenge en Pokémon blir værende før den stikker (f.eks. 60 sekunder)
const ENCOUNTER_TIMEOUT_MS = 120 * 1000;

function randomDelay() {
  const diff = MAX_SPAWN_MS - MIN_SPAWN_MS;
  return MIN_SPAWN_MS + Math.floor(Math.random() * diff);
}

async function getRandomPokemon() {
  const randomId = Math.floor(Math.random() * 151) + 1; // Gen 1
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${randomId}`);

  if (!res.ok) {
    throw new Error("Kunne ikke hente Pokémon fra PokéAPI");
  }

  const data = await res.json();

  const types = data.types.map((t) => t.type.name);
  const sprite =
    data.sprites?.other?.["official-artwork"]?.front_default ||
    data.sprites?.front_default ||
    null;

  return {
    id: data.id,
    name: capitalize(data.name),
    types,
    sprite,
  };
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getUserInventory(userId) {
  if (!inventory.has(userId)) {
    inventory.set(userId, []);
  }
  return inventory.get(userId);
}

function getTrainerRank(total) {
  if (total >= 50) return "Gym Leader";
  if (total >= 35) return "Ace Trainer";
  if (total >= 20) return "PokéManiac";
  if (total >= 10) return "Hiker";
  if (total >= 5) return "Bug Catcher";
  if (total >= 1) return "Youngster";
  return "New Trainer";
}

// 🕒 Planlegg neste spawn
function scheduleNextSpawn() {
  const delay = randomDelay();
  console.log(
    `⏱️ Neste vill Pokémon spawner om ca. ${Math.round(delay / 1000)} sek`
  );
  setTimeout(spawnWildPokemon, delay);
}

// 🌳 Spawn en vill Pokémon i en av spawn-kanalene
async function spawnWildPokemon() {
  try {
    if (activeEncounter) {
      console.log("Det finnes allerede en aktiv encounter, hopper over spawn.");
      scheduleNextSpawn();
      return;
    }

    const entries = Array.from(spawnChannels.entries());
    if (entries.length === 0) {
      console.log(
        "Ingen spawn-kanaler er satt ennå (bruk !setspawn på en server)."
      );
      scheduleNextSpawn();
      return;
    }

    // Velg en random server/kanal blant de som har satt spawn
    const [guildId, channelId] =
      entries[Math.floor(Math.random() * entries.length)];

    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      console.error(
        `Fant ikke tekst-kanal for spawn i guild ${guildId}. Hopper over.`
      );
      scheduleNextSpawn();
      return;
    }

    const pokemon = await getRandomPokemon();

    activeEncounter = {
      pokemon,
      guildId,
      channelId: channel.id,
      hasBeenAttempted: false,
      catcherId: null,
    };

    const embed = new EmbedBuilder()
      .setTitle(`En vill ${pokemon.name} dukker opp!`)
      .setDescription(
        `Alle kan prøve å fange den, men **kun den første som bruker \`!catch\` får forsøket**!\n\n` +
          `**Nr:** #${pokemon.id}\n` +
          `**Type:** ${pokemon.types.join(", ")}\n\n` +
          `Denne Pokémonen blir her i ca. ${
            ENCOUNTER_TIMEOUT_MS / 1000
          } sekunder.`
      )
      .setColor(0xff7300)
      .setFooter({ text: "Gotta catch ’em all!" });

    if (pokemon.sprite) {
      embed.setThumbnail(pokemon.sprite);
    }

    await channel.send({ embeds: [embed] });

    // ⏳ Timeout: hvis ingen prøver å fange -> Pokémon stikker
    if (activeEncounterTimeout) {
      clearTimeout(activeEncounterTimeout);
    }

    activeEncounterTimeout = setTimeout(async () => {
      try {
        if (!activeEncounter) return;

        const { pokemon, channelId } = activeEncounter;
        const ch = await client.channels.fetch(channelId);
        if (ch && ch.isTextBased()) {
          await ch.send(
            `⌛ **${pokemon.name}** ble lei av å vente og løp av gårde! Ingen rakk å prøve å fange den.`
          );
        }
      } catch (err) {
        console.error("Feil ved timeout/despawn:", err);
      } finally {
        activeEncounter = null;
        activeEncounterTimeout = null;
        scheduleNextSpawn();
      }
    }, ENCOUNTER_TIMEOUT_MS);
  } catch (err) {
    console.error("Feil ved spawning av Pokémon:", err);
    scheduleNextSpawn();
  }
}

client.once("ready", () => {
  console.log(`✅ Logget inn som ${client.user.tag}`);
  console.log("Botten er klar. Husk å sette spawn-kanal med !setspawn.");
  scheduleNextSpawn();
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (command === "catch") {
    await handleCatchCommand(message);
  } else if (command === "pokedex") {
    await handlePokedexCommand(message);
  } else if (command === "top") {
    await handleTopCommand(message);
  } else if (command === "help") {
    await handleHelpCommand(message);
  } else if (command === "setspawn") {
    await handleSetSpawnCommand(message);
  } else if (command === "unspawn") {
    await handleUnspawnCommand(message);
  }
});

async function handleCatchCommand(message) {
  const userId = message.author.id;

  if (!activeEncounter) {
    await message.reply(
      "Det er ingen vill Pokémon akkurat nå. Vent på neste spawn! ⏳"
    );
    return;
  }

  if (!message.guild || message.guild.id !== activeEncounter.guildId) {
    await message.reply(
      "Denne Pokémonen er på en annen server. Sjekk der den dukket opp! 👀"
    );
    return;
  }

  if (message.channel.id !== activeEncounter.channelId) {
    await message.reply(
      "Denne Pokémonen er i en annen kanal på serveren. Sjekk spawn-kanalen! 👀"
    );
    return;
  }

  if (activeEncounter.hasBeenAttempted) {
    if (activeEncounter.catcherId === userId) {
      await message.reply(
        "Du har allerede forsøkt å fange denne Pokémonen! 😅"
      );
    } else {
      await message.reply("Noen andre rakk å prøve før deg! ⚡");
    }
    return;
  }

  // Første som prøver
  activeEncounter.hasBeenAttempted = true;
  activeEncounter.catcherId = userId;

  const pokemon = activeEncounter.pokemon;
  const successChance = 0.4;
  const roll = Math.random();

  if (activeEncounterTimeout) {
    clearTimeout(activeEncounterTimeout);
    activeEncounterTimeout = null;
  }

  if (roll < successChance) {
    const userInv = getUserInventory(userId);
    userInv.push(pokemon);

    const total = userInv.length;
    const rank = getTrainerRank(total);

    await message.reply(
      `🎉 **${message.author.username}** fanget **${pokemon.name}**! ` +
        `Du har nå totalt **${total}** Pokémon og er en **${rank}**.`
    );

    activeEncounter = null;
    scheduleNextSpawn();
  } else {
    await message.reply(
      `😢 ${pokemon.name} brøt seg fri og rømte! Ingen fikk den denne gangen.`
    );

    activeEncounter = null;
    scheduleNextSpawn();
  }
}

async function handlePokedexCommand(message) {
  const userId = message.author.id;
  const userInv = inventory.get(userId) || [];

  if (userInv.length === 0) {
    await message.reply(
      "Du har ikke fanget noen Pokémon ennå. 😇 Vent på en vill encounter!"
    );
    return;
  }

  const total = userInv.length;
  const displayList = userInv.slice(0, 10);
  const rank = getTrainerRank(total);

  const listText = displayList
    .map((p, index) => `${index + 1}. ${p.name} (#${p.id})`)
    .join("\n");

  const extraText =
    total > displayList.length
      ? `\n\n… og ${total - displayList.length} flere.`
      : "";

  const embed = new EmbedBuilder()
    .setTitle(`${message.author.username} sin Pokédex`)
    .setDescription(
      `Du har fanget **${total}** Pokémon.\n` +
        `Trainer rank: **${rank}**\n\n` +
        `${listText}${extraText}`
    )
    .setColor(0x8f2600);

  await message.reply({ embeds: [embed] });
}

async function handleTopCommand(message) {
  if (!message.guild) {
    await message.reply("Denne kommandoen må brukes på en server.");
    return;
  }

  const entries = Array.from(inventory.entries());
  if (entries.length === 0) {
    await message.reply("Ingen har fanget noen Pokémon ennå. 😅");
    return;
  }

  entries.sort((a, b) => b[1].length - a[1].length);
  const top10 = entries.slice(0, 10);

  const lines = [];
  for (const [userId, pokemons] of top10) {
    const count = pokemons.length;
    const rank = getTrainerRank(count);

    let name = userId;
    try {
      const member = await message.guild.members.fetch(userId);
      name = member?.displayName || member?.user?.username || userId;
    } catch {
      // bruker ikke i guild lenger, bruker id
    }

    lines.push(`**${name}** – ${count} Pokémon (${rank})`);
  }

  const embed = new EmbedBuilder()
    .setTitle("🏆 Top Trainers")
    .setDescription(lines.join("\n"))
    .setColor(0xff7300);

  await message.reply({ embeds: [embed] });
}

async function handleHelpCommand(message) {
  const embed = new EmbedBuilder()
    .setTitle("📜 Oak’s Assistant – Commands")
    .setDescription(
      [
        "`!catch` – prøv å fange den aktive Pokémonen i spawn-kanalen",
        "`!pokedex` – se dine fangede Pokémon + trainer rank",
        "`!top` – se topp-trainere på serveren",
        "`!help` – vis denne hjelpeteksten",
        "",
        "`!setspawn` – sett denne kanalen som spawn-kanal for serveren",
        "`!unspawn` – fjern spawn-kanalen (ingen flere encounters herfra)",
      ].join("\n")
    )
    .setColor(0x4b433f);

  await message.reply({ embeds: [embed] });
}

async function handleSetSpawnCommand(message) {
  if (!message.guild) {
    await message.reply("Denne kommandoen må brukes på en server.");
    return;
  }

  spawnChannels.set(message.guild.id, message.channel.id);
  await message.reply(
    "✅ Denne kanalen er nå satt som **spawn-kanal** for vill Pokémon på denne serveren!"
  );
}

async function handleUnspawnCommand(message) {
  if (!message.guild) {
    await message.reply("Denne kommandoen må brukes på en server.");
    return;
  }

  const guildId = message.guild.id;

  if (!spawnChannels.has(guildId)) {
    await message.reply(
      "Det er ikke satt noen spawn-kanal for denne serveren."
    );
    return;
  }

  spawnChannels.delete(guildId);

  // Hvis aktiv encounter er i denne guilden, avslutt den
  if (activeEncounter && activeEncounter.guildId === guildId) {
    if (activeEncounterTimeout) {
      clearTimeout(activeEncounterTimeout);
      activeEncounterTimeout = null;
    }
    activeEncounter = null;
    scheduleNextSpawn();
  }

  await message.reply(
    "❌ Spawn-kanalen for denne serveren er fjernet. Det vil ikke dukke opp flere Pokémon her før du bruker `!setspawn` igjen."
  );
}

client.login(process.env.DISCORD_TOKEN);
