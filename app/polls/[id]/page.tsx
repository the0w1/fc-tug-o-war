import {kv} from "@vercel/kv";
import {Poll, TwitterWarpcastPoll} from "@/app/types";
import {PollVoteForm} from "@/app/form";
import Head from "next/head";
import {Metadata, ResolvingMetadata} from "next";
import { generatePollIdBasedOnInterval } from "@/app/utils";

async function getPoll(id: string): Promise<TwitterWarpcastPoll> {
    let nullPoll = {
        votestwitter: 0,
        voteswarpcast: 0
    };

    try {
        let poll: TwitterWarpcastPoll | null = await kv.hgetall(`poll:${id}`);

        if (!poll) {
            return nullPoll;
        }

        return poll;
    } catch (error) {
        console.error(error);
        return nullPoll;
    }
}

type Props = {
    params: { id: string }
    searchParams: { [key: string]: string | string[] | undefined }
}

export async function generateMetadata(
    { params, searchParams }: Props,
    parent: ResolvingMetadata
): Promise<Metadata> {
    // read route params
    const id = generatePollIdBasedOnInterval()
    const poll = await getPoll(id)

    const fcMetadata: Record<string, string> = {
        "fc:frame": "vNext",
        "fc:frame:post_url": `${process.env['HOST']}/api/vote?id=${id}`,
        "fc:frame:image": `${process.env['HOST']}/api/image?id=${id}`,
    };
    ['Twitter', 'Warpcast'].filter(o => o !== "").map((option, index) => {
        fcMetadata[`fc:frame:button:${index + 1}`] = option;
    });


    return {
        title: 'Twitter vs. Warpcast',
        openGraph: {
            title: 'Twitter vs. Warpcast',
            images: [`/api/image?id=${id}`],
        },
        other: {
            ...fcMetadata,
        },
        metadataBase: new URL(process.env['HOST'] || '')
    }
}
function getMeta(
    poll: Poll
) {
    // This didn't work for some reason
    return (
        <Head>
            <meta property="og:image" content="" key="test"></meta>
            <meta property="og:title" content="My page title" key="title"/>
        </Head>
    );
}


export default async function Page() {
    const id = generatePollIdBasedOnInterval();
    const poll = await getPoll(id);

    return(
        <>
            <div className="flex flex-col items-center justify-center min-h-screen py-2">
                <main className="flex flex-col items-center justify-center flex-1 px-4 sm:px-20 text-center">
                    <PollVoteForm poll={poll}/>
                </main>
            </div>
        </>
    );

}