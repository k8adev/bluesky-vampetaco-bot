import AtProto from '@atproto/api';
import { cborDecodeMulti, cborDecode } from '@atproto/common';
import WebSocket from 'ws';
import { CarReader } from '@ipld/car/reader';
import process from 'process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VAMPETAS_DIR = path.join(__dirname, 'vampetas');

const agent = new AtProto.BskyAgent({
  service: 'https://bsky.social',
});

/**
 * Bot credentials.
 * TODO: Change to custom handle.
 */
await agent.login({
  identifier: process.env.BLUESKY_USERNAME!,
  password: process.env.BLUESKY_PASSWORD!,
});

function getRandomVampetaImage(): Uint8Array {
  const files = fs.readdirSync(VAMPETAS_DIR);
  const images = files.filter((file) => (
    /**
     * Bluesky only supports PNG and JPG images.
     */
    /\.(png|jpg)$/i.test(file)
  ));

  const n = Math.floor(Math.random() * images.length);

  const imagePath = images[n];
  const image = fs.readFileSync(
    path.join(VAMPETAS_DIR, imagePath),
  );

  return new Uint8Array(image);
}

type Payload =
  & AtProto.ComAtprotoSyncSubscribeRepos.Commit
  & {
    ops?: AtProto.ComAtprotoSyncSubscribeRepos.RepoOp[],
  };

const ws = new WebSocket(
  'wss://bsky.network/xrpc/com.atproto.sync.subscribeRepos'
);

/**
 * TODO: Needs to add error and close event handlers.
 */
ws.on('message', async (data: Uint8Array) => {
  const [, payload] = cborDecodeMulti(
    data,
  ) as [unknown, Payload];

  try {
    const {
      ops,
      blocks,
      repo,
    } = payload;

    if (!Array.isArray(ops)) {
      return;
    }

    const [op] = ops;

    if (op?.action !== 'create') {
      return;
    }

    const cr = await CarReader.fromBytes(blocks);
    const block = await cr.get(op.cid);

    if (!block?.bytes) {
      return;
    }

    const post = cborDecode(
      block.bytes,
    ) as AtProto.AppBskyFeedPost.Record;

    /**
     * Only replies to posts that contain text the and
     * belongs to a thread.
     */
    const isNotTextNorReply = !post?.text && !post?.reply;

    if (isNotTextNorReply) {
      return;
    }

    const hasVampetacoHashTag = /#vampeta(ç|c)o/gmi.test(post.text);

    if (!hasVampetacoHashTag) {
      return;
    }

    const { data: { blob: image } } = await agent.uploadBlob(
      getRandomVampetaImage(),
      { encoding: 'image/png' },
    );

    const createdAt = new Date().toISOString();
    const uri = `at://${repo}/${op.path}`;

    const reply = {
      createdAt,
      text: '',
      reply: {
        /**
         * Reply to the post where the hashtag was found.
         */
        root: post.reply!.root,
        parent: {
          uri,
          cid: op.cid.toString(),
        },
      },
      embed: {
        $type: 'app.bsky.embed.images',
        images: [
          {
            image,
            alt: 'Foto do jogador Vampeta em momentos duvidosos.'
          },
        ],
      },
    };

    await agent.post(reply);
    /**
     * Just for debugging purposes.
     */
    console.log(reply);
  } catch (exception) {
    console.error(exception);
  }
});
