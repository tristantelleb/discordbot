import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import axios from 'axios';
import { config as dotenvConfig } from 'dotenv';
import { OpenAI } from 'openai';

dotenvConfig();

interface PokemonData {
  name: string;
  sprite: string;
}

async function getRandomPokemon(): Promise<PokemonData> {
  const pokemonId = Math.floor(Math.random() * 151) + 1;
  const url = `https://pokeapi.co/api/v2/pokemon/${pokemonId}/`;

  //console.log  (`[getRandomPokemon] Fetching pokemon ${pokemonId}...`);
  const response = await axios.get(url);
  const name = response.data.name;
  const sprite = response.data.sprites?.other?.["official-artwork"]?.front_default
    ?? response.data.sprites?.front_default;
  //console.log  (`[getRandomPokemon] Got: ${name}, sprite: ${sprite}`);
  return { name, sprite };
}

async function generateLieu(): Promise<string> {
  const client = new OpenAI({
    apiKey: process.env.EDEN_API_KEY,
    baseURL: "https://api.edenai.run/v3/llm",
  });

  //console.log  ("[generateLieu] Requesting lieu from EdenAI...");
  const response = await client.chat.completions.create({
    model: "openai/gpt-4o",
    messages: [
      {
        role: "user",
        content:
          "Give me a place and an uncanny activity. Answer only with the name of the place or activity, without any explanation or additional sentence.",
      },
    ],
    temperature: 0.9,
  });

  const lieu = response.choices[0]?.message?.content?.trim() ?? "Lieu inconnu";
  console.log  (`[generateLieu] Got: ${lieu}`);
  return lieu;
}

async function generateImage(pokemon: string, lieu: string): Promise<string> {
  const url = "https://api.edenai.run/v3/universal-ai/";
  const prompt = `A ${pokemon} pokemon in ${lieu}`;
  console.log  (`[generateImage] Prompt: ${prompt}`);
  //console.log  ("[generateImage] Calling EdenAI image generation...");
  const response = await axios.post(
    url,
    {
      model: "image/generation/bytedance/seedream-3-0-t2i-250415",
      input: {
        text: prompt,
        resolution: "1024x1024",
        num_images: 1,
      },
      show_original_response: false,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env['EDEN_API_KEY']}`,
        "Content-Type": "application/json",
      },
    }
  );

  //console.log  (`[generateImage] Response status: ${response.data.status}`);
  //console.log  (`[generateImage] Output:`, JSON.stringify(response.data.output));
  if (response.data.status === "success") {
    const imageUrl = response.data.output?.items?.[0]?.image_resource_url
      ?? response.data.output?.items?.[0]?.image;
    //console.log  (`[generateImage] Image URL: ${imageUrl}`);
    return imageUrl;
  }

  console.error(`[generateImage] Failed:`, response.data.error);
  throw new Error(response.data.error ?? "Image generation failed");
}

export default {
  data: new SlashCommandBuilder()
    .setName('generate')
    .setDescription('Generation images with EdenAI'),
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    //console.log  ("[execute] Command /generate triggered");
    await interaction.reply({ content: 'Loading...' });

    try {
      //console.log  ("[execute] Fetching pokemon and lieu in parallel...");
      const [pokemon, lieu] = await Promise.all([
        getRandomPokemon(),
        generateLieu(),
      ]);
      //console.log  (`[execute] Pokemon: ${pokemon.name}, Lieu: ${lieu}`);

      const imageUrl = await generateImage(pokemon.name, lieu);
      //console.log  (`[execute] Image generated successfully`);

      const embed = new EmbedBuilder()
        .setTitle(`${pokemon.name} — ${lieu}`)
        .setThumbnail(pokemon.sprite)
        .setImage(imageUrl)
        .setFooter({ text: "Generated with EdenAI" });

      await interaction.editReply({ content: "", embeds: [embed] });
      //console.log  ("[execute] Reply sent to Discord");
    } catch (error) {
      console.error("[execute] Error during generation:", error);
      await interaction.editReply("Une erreur est survenue lors de la génération.");
    }
  },
};
