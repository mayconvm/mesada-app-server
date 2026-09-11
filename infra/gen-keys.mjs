import { randomBytes, createHmac } from 'node:crypto';

const b64url = (input) => Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const jwtSecret = randomBytes(48).toString('hex');

const sign = (role) => {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const iat = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ iss: 'supabase', ref: 'local', role, iat, exp: iat + 10 * 365 * 24 * 3600 }));
  const sig = b64url(createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
};

console.log(`POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}`);
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`ANON_KEY=${sign('anon')}`);
console.log(`SERVICE_ROLE_KEY=${sign('service_role')}`);
