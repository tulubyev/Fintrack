import { Router, Request, Response } from 'express';
import { logger } from "../services/logger";
import { authenticateToken } from '../middleware/auth.js';
import { storage } from '../storage';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config/environment';
import type { AuthenticatedRequest } from '../middleware/types.js';

const router = Router();

// Multer configuration for profile images
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.uploads.maxFileSize,
  },
  fileFilter: (req, file, cb) => {
    if (req.url === '/upload-image') {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Только изображения разрешены'));
      }
    } else {
      cb(null, true);
    }
  },
});

/**
 * PROFILE ROUTES MODULE
 * Extracted from main routes.ts for modular architecture
 * 
 * Routes:
 * - PUT /update - Update user profile information
 * - POST /upload-image - Upload and process profile image
 * - GET /images/:filename - Serve uploaded profile images
 */

// Update user profile
router.put('/update', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { firstName, lastName, email, phone } = req.body;
    const userId = req.user!.id;

    // Validate input
    if (!firstName || !lastName) {
      return res.status(400).json({ message: 'Имя и фамилия обязательны' });
    }

    // Update user profile
    const updatedUser = await storage.updateUser(userId, {
      firstName,
      lastName,
      email: email || null,
      phone
    });

    if (!updatedUser) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    res.json(updatedUser);
  } catch (error) {
    logger.error('Profile update error:', error);
    res.status(500).json({ message: 'Ошибка обновления профиля' });
  }
});

// Upload and process profile image
router.post('/upload-image', 
  authenticateToken, 
  upload.single('profileImage'), 
  async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Файл не загружен' });
    }

    const userId = req.user!.id;
    const fileName = `${userId}_${uuidv4()}.jpg`;
    const uploadsDir = path.join(__dirname, '..', 'uploads', 'profile-images');
    const filePath = path.join(uploadsDir, fileName);

    // Ensure uploads directory exists
    await fs.mkdir(uploadsDir, { recursive: true });

    // Process image with Sharp - resize and crop to square
    await sharp(req.file.buffer)
      .resize(400, 400, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({
        quality: 85,
        progressive: true
      })
      .toFile(filePath);

    // Generate image URL
    const imageUrl = `/uploads/profile-images/${fileName}`;

    // Update user profile with new image URL
    const updatedUser = await storage.updateUser(userId, {
      profileImageUrl: imageUrl
    });

    if (!updatedUser) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    res.json({ 
      imageUrl,
      message: 'Изображение профиля успешно загружено'
    });
  } catch (error) {
    logger.error('Profile image upload error:', error);
    res.status(500).json({ 
      message: error instanceof Error ? error.message : 'Ошибка загрузки изображения' 
    });
  }
});

// Serve uploaded profile images
router.get('/images/:filename', (req: Request, res: Response) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '..', 'uploads', 'profile-images', filename);
    
    // Security check: only allow files with safe names
    if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png)$/i.test(filename)) {
      return res.status(400).json({ message: 'Недопустимое имя файла' });
    }

    res.sendFile(filePath, (err) => {
      if (err) {
        res.status(404).json({ message: 'Изображение не найдено' });
      }
    });
  } catch (error) {
    logger.error('Error serving profile image:', error);
    res.status(500).json({ message: 'Ошибка получения изображения' });
  }
});

export default router;