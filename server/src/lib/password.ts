import { hash, verify } from '@node-rs/argon2';

// Argon2id (library default) with OWASP-recommended parameters.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const hashPassword = (plain: string) => hash(plain, OPTIONS);

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

// Used to equalize timing when the user does not exist.
let dummyHash: Promise<string> | undefined;
export const getDummyHash = () => (dummyHash ??= hashPassword('dummy-password-for-timing-1'));
