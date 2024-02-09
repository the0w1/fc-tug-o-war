import type { NextApiRequest, NextApiResponse } from 'next';
import {Poll} from "@/app/types";
import {kv} from "@vercel/kv";
import {getSSLHubRpcClient, Message} from "@farcaster/hub-nodejs";
import { generatePollIdBasedOnInterval } from '@/app/utils';

const HUB_URL = process.env['HUB_URL'] || "nemes.farcaster.xyz:2283"
const client = getSSLHubRpcClient(HUB_URL);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'POST') {
        // Process the vote
        // For example, let's assume you receive an option in the body
        try {
            const pollId = generatePollIdBasedOnInterval();
            const results = req.query['results'] === 'true'
            let voted = req.query['voted'] === 'true'
            if (!pollId) {
                return res.status(400).send('Missing poll ID');
            }

            let validatedMessage : Message | undefined = undefined;
            try {
                const frameMessage = Message.decode(Buffer.from(req.body?.trustedData?.messageBytes || '', 'hex'));
                const result = await client.validateMessage(frameMessage);
                if (result.isOk() && result.value.valid) {
                    validatedMessage = result.value.message;
                }

                // Also validate the frame url matches the expected url
                let urlBuffer = validatedMessage?.data?.frameActionBody?.url || [];
                const urlString = Buffer.from(urlBuffer).toString('utf-8');
                if (!urlString.startsWith(process.env['HOST'] || '')) {
                    return res.status(400).send(`Invalid frame url: ${urlBuffer}`);
                }
            } catch (e)  {
                return res.status(400).send(`Failed to validate message: ${e}`);
            }

            const buttonId = validatedMessage?.data?.frameActionBody?.buttonIndex || 0;
            const fid = validatedMessage?.data?.fid || 0;

            // Use untrusted data for testing
            // const buttonId = req.body?.untrustedData?.buttonIndex || 0;
            // const fid = req.body?.untrustedData?.fid || 0;

            // Clicked create poll
            if ((results || voted) && buttonId === 2) {
                return res.status(302).setHeader('Location', `${process.env['HOST']}`).send('Redirecting to create poll');
            }


            const voteExists = await kv.sismember(`poll:${pollId}:voted`, fid)
            voted = voted || !!voteExists

            // Buttons are 1-indexed
            if (fid > 0 && buttonId > 0 && buttonId < 5 && !results && !voted) {
                const votedFor = buttonId == 1 ? 'twitter' : 'warpcast';
                let multi = kv.multi();
                multi.hincrby(`poll:${pollId}`, `votes${votedFor}`, 1);
                multi.sadd(`poll:${pollId}:voted`, fid);
                await multi.exec();
            }

            let poll: Poll | null = await kv.hgetall(`poll:${pollId}`);

            if (!poll) {
                return res.status(400).send('Missing poll ID');
            }
            const imageUrl = `${process.env['HOST']}/api/image?id=${pollId}&results=${results ? 'false': 'true'}&date=${Date.now()}${ fid > 0 ? `&fid=${fid}` : '' }`;
            let button1Text = "View Results";
            if (!voted && !results) {
                button1Text = "Back"
            } else if (voted && !results) {
                button1Text = "Already Voted"
            } else if (voted && results) {
                button1Text = "View Results"
            }

            // Return an HTML response
            res.setHeader('Content-Type', 'text/html');
            res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Vote Recorded</title>
          <meta property="og:title" content="Vote Recorded">
          <meta property="og:image" content="${imageUrl}">
          <meta name="fc:frame" content="vNext">
          <meta name="fc:frame:image" content="${imageUrl}">
          <meta name="fc:frame:post_url" content="${process.env['HOST']}/api/vote?id=${pollId}&voted=true&results=${results ? 'false' : 'true'}">
          <meta name="fc:frame:button:1" content="${button1Text}">
          <meta name="fc:frame:button:2" content="Create your poll">
          <meta name="fc:frame:button:2:action" content="post_redirect">
        </head>
        <body>
          <p>${ results || voted ? `You have already voted. You clicked ${buttonId}` : `Your vote for ${buttonId} has been recorded for fid ${fid}.` }</p>
        </body>
      </html>
    `);
        } catch (error) {
            console.error(error);
            res.status(500).send('Error generating image');
        }
    } else {
        // Handle any non-POST requests
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}
