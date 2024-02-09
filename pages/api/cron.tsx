import type { NextApiRequest, NextApiResponse } from 'next';
import { NextRequest, NextResponse } from 'next/server'
import {kv} from "@vercel/kv";
import { generatePollIdBasedOnInterval } from '@/app/utils';
import { TwitterWarpcastPoll } from '@/app/types';
import OpenAI from 'openai';

// export const config = {
//   runtime: 'edge',
// }

export const maxDuration = 300;

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
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  return res.status(200).send('Success');
}

async function update() {
  // Previous interval key
  const previousInterval = generatePollIdBasedOnInterval(new Date(Date.now() - 10 * 60000));
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
      if (winner) {
        // image generated here
        await updateLongTermStore(winner);
      }
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
    const response = await openai.images.generate({
      model: "dall-e-3",
      n: 1,
      size: "1792x1024",
      quality: "hd",
      prompt: `YOU MUST USE THE EXACT PROMPT BETWEEN THE BRACKET INDICATORS, DO NOT MODIFY THE PROMPT: [[ I'm measuring the battle between the twitter bird (make it a realistic bird) and a degenerate man with a single integer between 1 - 100. The degenerate man is wearing a purple rounded purple top hat. Only display a degenerate with a tophat fighting against a twitter bird, and no other primary subjects. Do not depict the numbers in the image. An integer of 50 is midway and means the battle is a tie. 1 means the twitter bird has totally defeated the degenerate in an absolutely devastating fashion and 100 means the degenerate has annihilated the twitter bird as completely and totally as possible. When I'm speaking of defeat and victory, I want you to consider what a total, and unequivocal defeat/victory looks like, be as imaginative as possible. For example, a total defeat would show multiple generations of loser enslaved by victor, and displays of triumph and defeat in that vein. give me an image of the battle when the integer is ${currentValue}.]]`,
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

async function updateLongTermStore(winner: 'twitter' | 'warpcast') {
  let rawData = await kv.get(longTermKey) || '';
  // @ts-ignore
  let longTermData: LongTermData = rawData ? rawData : { twitter: 0, warpcast: 0, lastUpdated: Date.now() };
  
  longTermData[winner] += 1;
  longTermData.lastUpdated = Date.now();

  const url = await createDalleImage(longTermData)
  longTermData.imageUrl = url;

  await kv.set(longTermKey, JSON.stringify(longTermData));
  return longTermData;
}