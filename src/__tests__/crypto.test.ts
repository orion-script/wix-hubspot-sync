import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { encrypt, decrypt, verifyHmac, hashProps } from '@/lib/crypto';
import crypto from 'crypto';

describe('Crypto Utilities', () => {
  // Use a stable dummy key for testing encryption (32 bytes = 64 hex chars)
  const TEST_ENCRYPTION_KEY = 'a'.repeat(64);
  const TEST_WEBHOOK_SECRET = 'my_test_webhook_secret_key';

  let originalEnv: string | undefined;

  beforeAll(() => {
    originalEnv = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  });

  afterAll(() => {
    process.env.ENCRYPTION_KEY = originalEnv;
  });

  describe('Encryption & Decryption (AES-256-GCM)', () => {
    it('should successfully encrypt and decrypt a string', () => {
      const plaintext = 'super_secret_hubspot_token_123';
      const encrypted = encrypt(plaintext);
      
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toContain(':'); // Should have IV, AuthTag, and Ciphertext separated by colons

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for the same plaintext due to random IV', () => {
      const plaintext = 'test_token';
      const enc1 = encrypt(plaintext);
      const enc2 = encrypt(plaintext);

      expect(enc1).not.toBe(enc2);
      
      // Both should still decrypt back to the same plaintext
      expect(decrypt(enc1)).toBe(plaintext);
      expect(decrypt(enc2)).toBe(plaintext);
    });

    it('should throw an error if the encrypted token format is invalid', () => {
      expect(() => decrypt('invalid-format')).toThrow('Invalid encrypted token format');
    });

    it('should fail decryption if the encryption key is wrong', () => {
      const encrypted = encrypt('test_data');
      process.env.ENCRYPTION_KEY = 'b'.repeat(64);
      
      expect(() => decrypt(encrypted)).toThrow(); // Auth tag verification will fail
      
      // restore
      process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    });
  });

  describe('HMAC Verification (Webhooks)', () => {
    it('should return true for a valid HMAC-SHA256 signature', () => {
      const payload = JSON.stringify({ event: 'contact.created', id: 123 });
      
      // Generate a valid signature just like Wix/HubSpot would (hex in our impl)
      const validSignature = crypto
        .createHmac('sha256', TEST_WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');

      expect(verifyHmac(TEST_WEBHOOK_SECRET, payload, validSignature)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const payload = JSON.stringify({ event: 'contact.created', id: 123 });
      expect(verifyHmac(TEST_WEBHOOK_SECRET, payload, 'invalid_signature_string')).toBe(false);
    });

    it('should return false if the payload was tampered with', () => {
      const originalPayload = JSON.stringify({ amount: 100 });
      const tamperedPayload = JSON.stringify({ amount: 9999 });

      const validSignatureForOriginal = crypto
        .createHmac('sha256', TEST_WEBHOOK_SECRET)
        .update(originalPayload)
        .digest('hex');

      expect(verifyHmac(TEST_WEBHOOK_SECRET, tamperedPayload, validSignatureForOriginal)).toBe(false);
    });
  });

  describe('SHA-256 Hashing (Idempotency)', () => {
    it('should generate a consistent hex hash for the same input regardless of key order', () => {
      const input1 = { name: 'John Doe', email: 'john@example.com' };
      const input2 = { email: 'john@example.com', name: 'John Doe' }; // different order
      
      const hash1 = hashProps(input1);
      const hash2 = hashProps(input2);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 hex is 64 characters long
    });

    it('should generate different hashes for different inputs', () => {
      const hash1 = hashProps({ name: 'John Doe' });
      const hash2 = hashProps({ name: 'Jane Doe' });

      expect(hash1).not.toBe(hash2);
    });
  });
});
