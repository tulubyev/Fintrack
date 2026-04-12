import { nanoid } from 'nanoid';

interface ViewToken {
  token: string;
  documentId: string;
  userId: string;
  ownerUserId: string;
  expiresAt: number;
  used: boolean;
}

class ViewTokenService {
  private tokens: Map<string, ViewToken> = new Map();
  private readonly TOKEN_EXPIRY = 60 * 1000; // 1 minute
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
  }

  generateViewToken(documentId: string, userId: string, ownerUserId: string): string {
    const token = nanoid(32);
    const expiresAt = Date.now() + this.TOKEN_EXPIRY;
    
    this.tokens.set(token, {
      token,
      documentId,
      userId,
      ownerUserId,
      expiresAt,
      used: false
    });

    return token;
  }

  validateAndConsumeToken(token: string): ViewToken | null {
    const viewToken = this.tokens.get(token);
    
    if (!viewToken) {
      return null;
    }

    if (viewToken.used) {
      return null;
    }

    if (Date.now() > viewToken.expiresAt) {
      this.tokens.delete(token);
      return null;
    }

    viewToken.used = true;
    return viewToken;
  }

  private cleanup() {
    const now = Date.now();
    for (const [token, data] of Array.from(this.tokens.entries())) {
      if (data.used || now > data.expiresAt) {
        this.tokens.delete(token);
      }
    }
  }
}

export const viewTokenService = new ViewTokenService();
