import a from '@atproto/api';
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

const agent = new a.BskyAgent({
  service: 'https://bsky.social',
})

/**
 * Bot credentials.
 */
await agent.login({
  identifier: process.env.BLUESKY_USERNAME!,
  password: process.env.BLUESKY_PASSWORD!,
});

function getRandomVampetaImage() {
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

const ws = new WebSocket('wss://bsky.network/xrpc/com.atproto.sync.subscribeRepos');

ws.on('message', async (data: Uint8Array) => {
  const [header, payload] = cborDecodeMulti(data) as any;

  if (header.op === 1) {
    const t = header?.t;

    if (t) {
      const { ops, blocks } = payload;

      if (ops) {
        const [op] = ops;

        if (op?.action === 'create') {
          const cr = await CarReader.fromBytes(blocks);
          const block = await cr.get(op.cid);

          const post = cborDecode(block.bytes);

          if (!post?.text && !post?.reply) {
            return;
          }

          if (!post.text.toLowerCase().includes('#vampetaço')) {
            return;
          }

          const { data } = await agent.uploadBlob(
            getRandomVampetaImage(),
            { encoding: 'image/png' }
          );

          agent.post({
            createdAt: new Date().toISOString(),
            reply: post.reply,
            embed: {
              $type: 'app.bsky.embed.images',
              images: [
                {
                  alt: 'Vampetaço',
                  image: data.blob,
                }
              ],
            }
          });
        }
      }
    }
  }
});
