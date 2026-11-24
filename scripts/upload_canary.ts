/**
 * Task 111 — Upload canary video to Cloudinary.
 * Run: npx tsx scripts/upload_canary.ts
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { v2 as cloudinary } from 'cloudinary';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

const VIDEO_PATH =
  'C:/Users/kajal/OneDrive/Desktop/New folder/marvedge-task111/WhatsApp Video 2026-11-18 at 1.41.14 PM.mp4';

async function main() {
  console.log('[upload_canary] Uploading video to Cloudinary...');
  console.log('[upload_canary] Source:', VIDEO_PATH);
  console.log('[upload_canary] Cloud:', process.env.CLOUDINARY_CLOUD_NAME ?? '(not set)');

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
    throw new Error('Cloudinary env vars not loaded — check .env.local');
  }

  const result = await cloudinary.uploader.upload(VIDEO_PATH, {
    resource_type: 'video',
    folder: 'task111_canary',
    public_id: 'whatsapp_canary_a',
    overwrite: false,
    // Don't apply eager transformations — keep original intact for download
    use_filename: false,
  });

  console.log('\n✅ UPLOAD COMPLETE');
  console.log('secure_url:', result.secure_url);
  console.log('public_id: ', result.public_id);
  console.log('width:     ', result.width);
  console.log('height:    ', result.height);
  console.log('duration:  ', result.duration, 's');
  console.log('format:    ', result.format);
  console.log('bytes:     ', result.bytes);
}

main().catch((e) => {
  console.error('[upload_canary] FAILED:', e.message ?? e);
  process.exit(1);
});
