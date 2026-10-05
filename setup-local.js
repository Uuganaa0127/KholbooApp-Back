import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import { randomBytes } from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const here=dirname(fileURLToPath(import.meta.url));
const password=randomBytes(18).toString('base64url');
await writeFile(join(here,'.env'), `PORT=4100\nHOST=127.0.0.1\nADMIN_EMAIL=admin@youthmed.mn\nADMIN_PASSWORD=${password}\nJWT_SECRET=${randomBytes(48).toString('hex')}\n`,{flag:'wx',mode:0o600});
await writeFile(join(here,'LOCAL-ACCESS.md'), `# Local admin access\n\nAdmin: http://127.0.0.1:5180\n\nEmail: admin@youthmed.mn\n\nPassword: ${password}\n\nThese credentials are for this local development instance. Do not publish this file or .env.\n`,{flag:'wx',mode:0o600});
console.log('Local configuration created. Credentials: LOCAL-ACCESS.md');
