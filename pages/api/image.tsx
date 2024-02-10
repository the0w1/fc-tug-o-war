import type { NextApiRequest, NextApiResponse } from 'next';
import sharp from 'sharp';
import {Poll, TwitterWarpcastPoll} from "@/app/types";
import {kv} from "@vercel/kv";
import satori from "satori";
import { join } from 'path';
import * as fs from "fs";
import { generatePollIdBasedOnInterval } from '@/app/utils';
import { createCanvas, loadImage } from 'canvas';

const fontPath = join(process.cwd(), 'Roboto-Regular.ttf')
let fontData = fs.readFileSync(fontPath)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const pollId = generatePollIdBasedOnInterval()
        const previousIntervalPollId = generatePollIdBasedOnInterval(new Date(Date.now() - 10 * 60000));
        // const fid = parseInt(req.query['fid']?.toString() || '')
        if (!pollId) {
            return res.status(400).send('Missing poll ID');
        }

        let poll: TwitterWarpcastPoll | null = await kv.hgetall(`poll:${pollId}`) || await kv.hgetall(`poll:${previousIntervalPollId}`);
        let rawData = await kv.get<{twitter: number, warpcast: number, imageUrl: string}>('tug_of_war_vote');

        const showResults = req.query['results'] === 'true'

        const pollOptions = ['twitter', 'warpcast']
        
        // @ts-ignore
        poll['votestwitter'] = 2 || poll['votestwitter'] || '0';
        // @ts-ignore
        poll['voteswarpcast'] = 1 || poll['voteswarpcast'] || '0';
        
        const totalVotes = pollOptions
            // @ts-ignore
            .map((option, index) => parseInt(poll[`votes${option}`]))
            .reduce((a, b) => a + b, 0);
        const pollData = {
            question: showResults ? `Results for ${pollId}` : pollId,
            options: pollOptions
                .map((option, index) => {
                    // @ts-ignore
                    const votes = poll[`votes${option}`] || 0;
                    const percentOfTotal = totalVotes ? Math.round(votes / totalVotes * 100) : 0;
                    let text = showResults ? `${percentOfTotal}%: ${option} (${votes} votes)` : `${index + 1}. ${option}`
                    return { option, votes, text, percentOfTotal }
                })
        };

        const twitterScore = rawData?.twitter || 0;
        const warpcastScore = rawData?.warpcast || 0;
        const cumulativeScore = 50 - twitterScore - warpcastScore;
        const pngBuffer = await createPollImageWithBackground(rawData?.imageUrl, pollId, pollData, showResults, cumulativeScore)

        // // Convert SVG to PNG using Sharp
        // const pngBuffer = await sharp(Buffer.from(svg))
        //     .toFormat('png')
        //     .toBuffer();

        // Set the content type to PNG and send the response
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'max-age=10');
        res.send(pngBuffer);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error generating image');
    }
}

async function createPollImageWithBackground(backgroundUrl: string | Buffer = 'https://t4.ftcdn.net/jpg/00/97/58/97/360_F_97589769_t45CqXyzjz0KXwoBZT9PRaWGHRk5hQqQ.jpg', pollId: string, pollData: { question?: string; options: any; }, showResults: boolean, cumulativeScore: number) {
    const width = 1075;
    const height = 614;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
  
    // Load and draw the background image
    const backgroundImage = await loadImage(backgroundUrl);
    ctx.drawImage(backgroundImage, 0, 0, width, height);
    const borderRadius = 15; // Adjust as needed
    const shadowOffset = 10;
    const shadowBlur = 10;
    const shadowColor = 'rgba(0,0,0,0.5)';
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(106,17,203, 0.5)');
    gradient.addColorStop(1, 'rgba(37,117,252, 0.5)');
  
    pollData.options.forEach((opt: { percentOfTotal: number; text: string; }, index: number) => {
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        const optionX = 30;
        const optionY = 80 + index * 60;
        const optionWidth = 250;
        const optionHeight = 37;

        ctx.shadowOffsetX = shadowOffset;
        ctx.shadowOffsetY = shadowOffset;
        ctx.shadowBlur = shadowBlur;
        ctx.shadowColor = shadowColor;
    
        // If showing results, overlay with a percentage bar
        if (showResults) {
            if (!!opt.percentOfTotal && opt.percentOfTotal != 0) {
                // Continue with setting styles for the text
                ctx.font = '30px Roboto';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';

                // Draw the poll ID, options, etc., as before
                ctx.fillStyle = "white";
                ctx.fillText("Latest 10 min Vote Results", 20, 20); // Adjust positioning as needed

                // Background bar for the option
                ctx.fillStyle = gradient; // Use gradient for a modern look
                drawRoundedRect(ctx, optionX, optionY, optionWidth, optionHeight, borderRadius);
                ctx.fill();
                
                drawPercentageBar(ctx, optionX, optionY, optionWidth, optionHeight, opt.percentOfTotal, borderRadius);
                // Option text
                ctx.fillStyle = '#FFF';
                ctx.font = '18px Roboto';
                ctx.fillText(opt.text, optionX + 10, optionY + 10);
            }
        }

    });

    drawTheCumulativeScore(ctx, width, height, cumulativeScore);
    
    return canvas.toBuffer();
  }

// @ts-ignore
function drawPercentageBar(ctx, x, y, width, height, percent, borderRadius) {
    const barWidth = width * percent / 100;
    const gradient = ctx.createLinearGradient(x, y, x + barWidth, y);
    gradient.addColorStop(0, 'rgba(251,131,167, 0.5)'); // Light green
    gradient.addColorStop(1, 'rgba(253,210,158, 0.5)'); // Dark green

    ctx.fillStyle = gradient;
    drawRoundedRect(ctx, x, y, barWidth, height, borderRadius);
    ctx.fill();
}

  // @ts-ignore
function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

// @ts-ignore
function drawTheCumulativeScore(ctx, width, height, cumulativeScore) {
    ctx.font = '16px Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Define the bar's dimensions and position
    const barWidth = width * 0.8;
    const barHeight = 30;
    const barX = (width - barWidth) / 2;
    const barY = height - 60; // Position the bar towards the bottom of the canvas

    // Draw the background bar
    ctx.fillStyle = 'rgba(200, 200, 200, 0.6)'; // Light grey background
    drawRoundedRect(ctx, barX, barY, barWidth, barHeight, 10); // 10 is the borderRadius
    ctx.fill();

    // Calculate the position of the cumulative score marker
    const scorePosition = barX + (cumulativeScore / 50) * barWidth;

    // Draw the cumulative score marker
    ctx.fillStyle = 'rgba(255, 99, 71, 0.8)'; // A strong color for visibility
    ctx.beginPath();
    ctx.arc(scorePosition, barY + barHeight / 2, 10, 0, 2 * Math.PI);
    ctx.fill();

    // Optional: Add text or icons for Twitter and Warpcast at the ends of the bar
    ctx.fillStyle = '#000'; // Black text
    drawTextWithShadow(ctx, 'Warpcast', barX, barY - 20);
    drawTextWithShadow(ctx, 'Twitter', barX + barWidth, barY - 20);

    // Display the cumulative score above the marker
    ctx.fillStyle = '#fff'; // White text for contrast
    ctx.fillText(`Score: ${cumulativeScore}`, scorePosition, barY - 20);
}

//@ts-ignore
function drawTextWithShadow(ctx, text, x, y) {
    // Configure shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)'; // Shadow color
    ctx.shadowBlur = 4; // Blur level
    ctx.shadowOffsetX = 2; // Horizontal offset
    ctx.shadowOffsetY = 2; // Vertical offset

    // Set text properties
    ctx.font = '30px Roboto';
    ctx.fillStyle = '#FFF'; // Text color for contrast
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw the text with shadow
    ctx.fillText(text, x, y);

    // Reset shadow properties to avoid affecting other canvas elements
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}
