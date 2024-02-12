import type { NextApiRequest, NextApiResponse } from 'next';
import { NextRequest, NextResponse } from 'next/server'
import {kv} from "@vercel/kv";
import { generatePollIdBasedOnInterval } from '@/app/utils';
import { TwitterWarpcastPoll } from '@/app/types';
import OpenAI from 'openai';

// export const config = {
//   runtime: 'edge',
// }

const longTermKey = "tug_of_war_vote";

interface IntervalVoteData {
  twitter: number;
  warpcast: number;
}

type LongTermData = {
  imageUrl: string | undefined;
  twitter: number;
  warpcast: number;
  lastUpdated: number; // Timestamp
};

export default async function handler(req: NextRequest, res: NextApiResponse) {
  const response = await update();
  const authHeader = (req.headers as any)['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  return res.status(200).send('Success');
}

async function update() {
  // Previous interval key
  // const previousInterval = generatePollIdBasedOnInterval(new Date(Date.now() - 10 * 60000));
  const previousInterval = generatePollIdBasedOnInterval(new Date(Date.now() - 60 * 60000));
  // const previousInterval = generatePollIdBasedOnInterval(new Date(1707426459356))
  // Retrieve the previous interval's vote data
  let poll: TwitterWarpcastPoll | null = await kv.hgetall(`poll:${previousInterval}`);
  console.log("IN CRON")
  console.log(poll);

  if (poll) {
    // @ts-ignore
    const previousData = {twitter: parseInt(poll['votestwitter']), warpcast: parseInt(poll['voteswarpcast'])}
  
    if (previousData) {
      // Determine the winner based on vote counts
      const winner = determineIntervalWinner(previousData);
      // If there's a clear winner, update the long-term store
      // image generated here
      await updateLongTermStore(winner);
    }
  } else {
    console.log("Missing poll id")
  }

  // Initialize the next interval's store with default vote counts
  const currentInterval = generatePollIdBasedOnInterval();
  const initialCurrentIntervalPoll: TwitterWarpcastPoll = { votestwitter: 0, voteswarpcast: 0 };
  await kv.hset(`poll:${currentInterval}`, initialCurrentIntervalPoll);
}

async function createDalleImage(longTermData: LongTermData) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  let currentValue: number = 50 - (longTermData.twitter - longTermData.warpcast);
  console.log("THE LONG TERM SCORE")
  console.log(currentValue)

  try {
    // const completion = await openai.chat.completions.create({
    //   messages: [
    //     {
    //       role: "system",
    //       content: 
    //       `You are a helpful assistant that is designed to output detailed prompts that will be highly optimized to work with the Dall-e-3 text to image generation api from OpenAI. 
    //       You will output only the prompt, do not include anything else in the output except for the prompt that can be fed into dall e 3. Comply with the following rules:

    //       * The state of the battle (who is winnning or losing) is ${currentValue} where numbers closer to 1 means the smug man has experienced total loss, and numbers closer to 100 means the twitter bird has experienced total loss
    //       * Do not include or mention the battle score in the output prompt, only use it to determine how to describe who is winning the battle and by what margin the battle is decided. 
    //       * Only include two primary subjects in the output prompt: the twitter bird and the likeable/smug man. 
    //       * The style should be a blend of digital art with elements of realism and fantasy. It should feature a realistic portrayal of a bird with dramatic lighting and dynamic composition, common in digital painting. The rendering of light, shadow, and texture gives depth and a lifelike quality to the characters.
    //       * Do not include any numbers or scores in the output prompt`,
    //     },
    //     { role: "user", content: `Describe a tableau vivant of a battle that correlates to this number: ${currentValue}, where a number of 50 is midway and means the battle is a tie, and 1 equals the twitter bird has total victory over the degenerate in an absolutely devastating fashion and 100 equals the smug man has annihilated the twitter bird as completely and totally as possible. An extreme and vivid portrayal of a battle between a realistic twitter bird and a smug and likeable man wearing a purple rounded purple top hat. Other acceptable descriptions for total, and unequivocal defeat/victory are: showing multiple generations of loser enslaved by victor, and physical altercations between the two fighters. Be as imaginative in the prompt as possible` },
    //   ],
    //   model: "gpt-3.5-turbo",
    // });
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: 
          `You are a helpful assistant that takes a number and outputs a prompt that describes either the twitter bird winning or a smug man wearing a purple top hat winning a physical large scale war. 
            * The smaller the number, the more victorious the twitter bird appears, 
            * the larger the number the more victorious the smug man appears.
          You will output only the prompt, do not include anything else in the output except for the prompt that can be fed into dall e 3. Comply with the following rules:

          * Only include two primary subjects in the output prompt: the twitter bird and the likeable/smug man wearing a purple top hat
          * The style should be a blend of digital art with elements of realism and fantasy
          `,
        },
        { role: "user", content: "1"},
        { role: "assistant", content: `a realistic twitter bird has total victory over the smug man wearing a purple top hat in an absolutely devastating fashion. The twitter bird has total victory and stands over the smug man, who is sprawled across the ground with weapons broken and getting clawed by the twitter bird. The twitter bird has a regal air about him and is surrounded by flags and displays of triumph. Style is a blend of digital art with elements of realism and fantasy. This victory is symbolized by dramatic and victorious imagery, illustrating the 'twitter bird's' unchallenged supremacy and the complete annihilation of the smug man.` },
        { role: "user",  content: "80"},
        { role: "assistant", content: `The bird is injured and running away while the man is clearly confident and has an abvious upperhand in their war/battle. The twitter bird looks distressed and weary. A blend of realism and digital art, high quality art, where a smug man depicted wearing a purple top hat is victorious over a twitter bird. The bird's feathers are bent and dirtied, and it tries to beg the smug man for mercy`},
        { role: "user",  content: "45"},
        { role: "assistant", content: `a vivid battle scene where the realistic Twitter bird holds a slight advantage over the 'smug man'. The 'smug man' is slightly off balance, while trying to defend against the more favorably positioned twitter bird. The twitter bird looks strong, while the smug man appears to be caught off guard. The 'smug man', identifiable by his purple rounded top hat, is shown resilient but slightly overpowered in this challenging confrontation. Style is a blend of digital art with elements of realism and fantasy`},
        { role: "user", content: "100"},
        { role: "assistant", content: `a smug man wearing a purple top hat annihilating a realistic twitter bird as completely and totally as possible. the smug man is standing over the twitter bird's corpse and the twitter bird is enslaved by chains held by the smug man. The twitter bird looks utterly and totally defeated and crippled. Style is a blend of digital art with elements of realism and fantasy. This victory is symbolized by dramatic and victorious imagery, illustrating the 'smug man's' unchallenged supremacy and the complete annihilation of the Twitter bird.` },
        { role: "user", content: `${currentValue}`}
      ],
      model: "gpt-4",
    });
    console.log(completion.choices[0].message.content);
    const response = await openai.images.generate({
      model: "dall-e-3",
      n: 1,
      size: "1792x1024",
      quality: "hd",
      prompt: `YOU MUST USE THE EXACT PROMPT BETWEEN THE BRACKET INDICATORS, DO NOT MODIFY THE PROMPT: [[ ${completion.choices[0].message.content} The style should be a blend of digital art with elements of realism and fantasy. Dynamic contrast and great lighting composition.]]`,
    });
    const imageData = response.data[0].url; // URL to the generated image
    console.log("L(@(@(@(>>>>")
    console.log(imageData)
    return imageData;
  } catch (err) {
    console.log(err);
    return '';
  }
  
}

function determineIntervalWinner(data: IntervalVoteData): 'twitter' | 'warpcast' | null {
  if (data.twitter > data.warpcast) {
    return 'twitter';
  } else if (data.warpcast > data.twitter) {
    return 'warpcast';
  }
  return null; // It's a tie or no votes
}

async function updateLongTermStore(winner: 'twitter' | 'warpcast' | null) {
  let rawData = await kv.get(longTermKey) || '';
  // @ts-ignore
  let longTermData: LongTermData = rawData ? rawData : { twitter: 0, warpcast: 0, lastUpdated: Date.now() };
  
  if (winner) {
    longTermData[winner] += 1;
  }
  longTermData.lastUpdated = Date.now();

  const url = await createDalleImage(longTermData)
  longTermData.imageUrl = url;

  await kv.set(longTermKey, JSON.stringify(longTermData));
  return longTermData;
}