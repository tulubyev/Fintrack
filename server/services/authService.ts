import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { storage } from "../storage";
import type { User, InsertUser } from "@shared/schema";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface TokenPayload {
  userId: string;
  email: string;
  type: 'access' | 'refresh';
}

export class AuthService {
  private readonly JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
  private readonly JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "your-refresh-secret";
  private readonly ACCESS_TOKEN_EXPIRES = "15m";
  private readonly REFRESH_TOKEN_EXPIRES = "7d";

  async register(userData: InsertUser & { password: string }): Promise<{ user: User; tokens: AuthTokens }>;
  async register(
    firstName: string,
    lastName: string,
    phone: string,
    password: string,
    email?: string
  ): Promise<{ user: User; tokens: AuthTokens }>;
  async register(
    firstNameOrUserData: string | (InsertUser & { password: string }),
    lastName?: string,
    phone?: string,
    password?: string,
    email?: string
  ): Promise<{ user: User; tokens: AuthTokens }> {
    // Handle overloaded function signatures
    let userData: InsertUser & { password: string };
    
    if (typeof firstNameOrUserData === 'string') {
      // Called with individual parameters
      userData = {
        firstName: firstNameOrUserData,
        lastName: lastName!,
        phone: phone!,
        password: password!,
        email: email || null,
        role: 'personal',
        planType: 'free',
      } as InsertUser & { password: string };
    } else {
      // Called with userData object
      userData = firstNameOrUserData;
    }

    // Check if user already exists by phone
    const existingUserByPhone = await storage.getUserByPhone(userData.phone);
    if (existingUserByPhone) {
      throw new Error(`Этот номер телефона уже зарегистрирован. Войдите в систему с ним или введите другой контактный номер.`);
    }

    // Check if user already exists by email (if provided)
    if (userData.email) {
      const existingUserByEmail = await storage.getUserByEmail(userData.email);
      if (existingUserByEmail) {
        throw new Error(`Этот email уже зарегистрирован. Войдите в систему с ним или используйте другой email.`);
      }
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(userData.password, saltRounds);

    // Create user
    try {
      const { password: _, ...userDataWithoutPassword } = userData;
      // Убираем пустой email, заменяем на null
      const cleanUserData = {
        ...userDataWithoutPassword,
        email: userDataWithoutPassword.email || null,
        passwordHash,
      };
      const user = await storage.createUser(cleanUserData);
      
      console.log('User created successfully:', user.id);
      return { user, tokens: this.generateTokens(user) };
    } catch (dbError) {
      console.error('Database error during user creation:', dbError);
      
      // Специфичные ошибки базы данных
      if (dbError instanceof Error) {
        if (dbError.message.includes('duplicate key') || dbError.message.includes('unique')) {
          if (dbError.message.includes('phone')) {
            throw new Error(`Пользователь с номером телефона ${userData.phone} уже зарегистрирован`);
          } else if (dbError.message.includes('email')) {
            throw new Error(`Пользователь с email ${userData.email} уже зарегистрирован`);
          }
          throw new Error('Пользователь с такими данными уже существует');
        }
        
        if (dbError.message.includes('connection') || dbError.message.includes('timeout')) {
          throw new Error('Проблема соединения с базой данных. Попробуйте позже');
        }
      }
      
      throw new Error('Ошибка при создании пользователя. Попробуйте еще раз');
    }
  }

  async login(identifier: string, password: string): Promise<{ user: User; tokens: AuthTokens }> {
    // Find user by email or phone
    const user = await storage.getUserByIdentifier(identifier);
    if (!user) {
      throw new Error("Неверные данные для входа");
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Error("Неверные данные для входа");
    }

    // Generate tokens
    const tokens = this.generateTokens(user);

    return { user, tokens };
  }

  async refreshToken(refreshToken: string): Promise<{ user: User; tokens: AuthTokens }> {
    try {
      const payload = jwt.verify(refreshToken, this.JWT_REFRESH_SECRET) as TokenPayload;
      
      if (payload.type !== 'refresh') {
        throw new Error("REFRESH_TOKEN_TYPE_INVALID");
      }

      const user = await storage.getUser(payload.userId);
      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }

      const tokens = this.generateTokens(user);
      return { user, tokens };
    } catch (error: unknown) {
      const err = error as Error & { name?: string };
      if (err.name === 'TokenExpiredError') {
        throw new Error("REFRESH_TOKEN_EXPIRED");
      }
      if (err.name === 'JsonWebTokenError') {
        throw new Error("REFRESH_TOKEN_MALFORMED");
      }
      
      if (err.message?.includes("TOKEN_") || err.message?.includes("USER_")) {
        throw error;
      }
      
      throw new Error("REFRESH_TOKEN_VERIFICATION_FAILED");
    }
  }

  async verifyAccessToken(token: string): Promise<User> {
    try {
      const payload = jwt.verify(token, this.JWT_SECRET) as TokenPayload;
      
      if (payload.type !== 'access') {
        throw new Error("TOKEN_TYPE_INVALID");
      }

      const user = await storage.getUser(payload.userId);
      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }

      return user;
    } catch (error: unknown) {
      const err = error as Error & { name?: string };
      if (err.name === 'TokenExpiredError') {
        throw new Error("TOKEN_EXPIRED");
      }
      if (err.name === 'JsonWebTokenError') {
        throw new Error("TOKEN_MALFORMED");
      }
      
      if (err.message?.includes("TOKEN_") || err.message?.includes("USER_")) {
        throw error;
      }
      
      throw new Error("TOKEN_VERIFICATION_FAILED");
    }
  }

  generateTokens(user: User): AuthTokens {
    const accessPayload: TokenPayload = {
      userId: user.id,
      email: user.email || '', // Handle null email
      type: 'access'
    };

    const refreshPayload: TokenPayload = {
      userId: user.id,
      email: user.email || '', // Handle null email
      type: 'refresh'
    };

    const accessToken = jwt.sign(accessPayload, this.JWT_SECRET, {
      expiresIn: this.ACCESS_TOKEN_EXPIRES,
    });

    const refreshToken = jwt.sign(refreshPayload, this.JWT_REFRESH_SECRET, {
      expiresIn: this.REFRESH_TOKEN_EXPIRES,
    });

    return { accessToken, refreshToken };
  }

  // Mock OAuth for Gosuslugi integration (for MVP)
  async mockGosuslugiAuth(code: string): Promise<{ user: User; tokens: AuthTokens }> {
    // In production, this would validate the OAuth code with Gosuslugi
    // For MVP, we'll create a mock user
    const mockUserData = {
      email: `user${Date.now()}@gosuslugi.ru`,
      firstName: "Александр",
      lastName: "Иванов",
      phone: "+7-900-123-45-67",
      isVerified: true,
    };

    // Check if user exists or create new one
    let user = await storage.getUserByEmail(mockUserData.email);
    if (!user) {
      const passwordHash = await bcrypt.hash("temp-password", 12);
      user = await storage.createUser({
        ...mockUserData,
        passwordHash,
      });
    }

    const tokens = this.generateTokens(user);
    return { user, tokens };
  }
}

export const authService = new AuthService();
