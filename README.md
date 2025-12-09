# 🧪 Oak’s Assistant – Pokémon Discord Bot

En Discord-bot som spawner tilfeldige Pokémon i en kanal, lar brukere fange dem, holde orden på Pokédex, og konkurrere i topplister.
Bygget med **Node.js**, **Discord.js** og **PokéAPI**.

---

## ✨ Funksjoner

- 🟢 **Automatiske Pokémon-spawns** i valgte kanaler
- 🎣 **Fang Pokémon** med `!catch`
- 📘 **Pokédex per bruker** – se samlingen din
- 🏆 **Toppliste / Trainer ranks** basert på antall Pokémon fanget
- ⏳ **Despawn timer** hvis ingen prøver å fange
- 🌍 **Støtte for flere servere**, én spawn-kanal per guild
- 🧪 **100% Gen 1 (1–151)** Pokémon via PokéAPI

---

## 📦 Teknologier brukt

- **Node.js**
- **Discord.js v14**
- **PokéAPI** ([https://pokeapi.co](https://pokeapi.co))
- **dotenv** for miljøvariabler

---

## 🔧 Installasjon

### 1. Klon repoet

```bash
git clone https://github.com/<brukernavn>/pokemon-bot.git
cd pokemon-bot
```

### 2. Installer avhengigheter

```bash
npm install
```

### 3. Lag en `.env`-fil

Opprett en fil i rotmappa:

```
DISCORD_TOKEN=din-token-her
```

⚠️ **Del aldri tokenet ditt.**
`.env` er allerede ignorert av `.gitignore`.

---

## ▶️ Start botten

```bash
node index.js
```

Når botten logger inn ser du:

```
Logget inn som Oak’s Assistant
Botten er klar. Husk å sette spawn-kanal med !setspawn.
```

---

## 💬 Kommandoer

| Kommando    | Beskrivelse                                  |
| ----------- | -------------------------------------------- |
| `!catch`    | Prøv å fange den aktive Pokémonen            |
| `!pokedex`  | Se dine fangede Pokémon + trainer rank       |
| `!top`      | Se toppliste over trenere                    |
| `!help`     | Vis kommandomeny                             |
| `!setspawn` | (Admin) Sett nåværende kanal som spawn-kanal |
| `!unspawn`  | (Admin) Fjern spawn-kanalen                  |

---

## 🏅 Trainer Ranks

Rank basert på antall Pokémon du har fanget:

- **New Trainer** (0)
- **Youngster** (1–4)
- **Bug Catcher** (5–9)
- **Hiker** (10–19)
- **PokéManiac** (20–34)
- **Ace Trainer** (35–49)
- **Gym Leader** (50+)

---

## 🧵 Hvordan spawns fungerer

- Botten velger en **tilfeldig Pokémon fra Gen 1**
- Sender et embed i valgt kanal
- Pokémon forsvinner etter **120 sekunder** hvis ingen prøver
- Kun **første person** som bruker `!catch` får forsøket
- Om du lykkes er basert på RNG (40% sjanse)
