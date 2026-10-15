import crypto from "crypto";
import { config } from "../../config/environment";

export class CryptoService {
  private readonly ALGORITHM = "aes-256-gcm";
  private readonly KEY_LENGTH = 32; // 256 bits
  private readonly IV_LENGTH = 12; // 96 bits for GCM
  private readonly TAG_LENGTH = 16; // 128 bits
  
  private readonly encryptionKey: Buffer;

  constructor() {
    const key = config.crypto.encryptionKey;
    // 64 hex-символа — готовый 256-битный ключ, иначе выводим ключ через SHA-256
    this.encryptionKey = /^[0-9a-fA-F]{64}$/.test(key)
      ? Buffer.from(key, "hex")
      : crypto.createHash("sha256").update(key).digest();
  }

  encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(this.IV_LENGTH);
      const cipher = crypto.createCipheriv(this.ALGORITHM, this.encryptionKey, iv);

      let encrypted = cipher.update(text, "utf8", "hex");
      encrypted += cipher.final("hex");
      
      const tag = cipher.getAuthTag();
      
      // Combine IV + encrypted data + tag
      return iv.toString("hex") + ":" + encrypted + ":" + tag.toString("hex");
    } catch (error) {
      throw new Error("Encryption failed");
    }
  }

  decrypt(encryptedData: string): string {
    try {
      const parts = encryptedData.split(":");
      if (parts.length !== 3) {
        throw new Error("Invalid encrypted data format");
      }

      const iv = Buffer.from(parts[0], "hex");
      const encrypted = parts[1];
      const tag = Buffer.from(parts[2], "hex");

      const decipher = crypto.createDecipheriv(this.ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      throw new Error("Decryption failed");
    }
  }

  hash(data: string): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString("hex");
  }

  // For hashing sensitive data like account numbers
  hashSensitiveData(data: string, salt?: string): string {
    const actualSalt = salt || crypto.randomBytes(16).toString("hex");
    const hash = crypto.pbkdf2Sync(data, actualSalt, 100000, 64, "sha512");
    return actualSalt + ":" + hash.toString("hex");
  }

  verifySensitiveData(data: string, hashedData: string): boolean {
    const parts = hashedData.split(":");
    if (parts.length !== 2) return false;

    const salt = parts[0];
    const hash = parts[1];
    
    const verifyHash = crypto.pbkdf2Sync(data, salt, 100000, 64, "sha512");
    return hash === verifyHash.toString("hex");
  }
}

export const cryptoService = new CryptoService();
