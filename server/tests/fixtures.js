import { randomBytes } from 'node:crypto';
export const testCredential = () => `Aa1-${randomBytes(24).toString('hex')}`;
