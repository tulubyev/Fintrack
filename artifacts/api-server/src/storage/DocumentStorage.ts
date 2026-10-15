import { db } from "../db";
import { 
  documents, documentTypes, documentVerificationHistory, users,
  type Document, type InsertDocument, type DocumentType, type DocumentVerificationHistory
} from "@shared/schema";
import { eq, and, or, desc, asc } from "drizzle-orm";
import type { IDocumentStorage } from "./types";

export class DocumentStorage implements IDocumentStorage {
  async getDocumentTypes(): Promise<DocumentType[]> {
    return await db.select().from(documentTypes).where(eq(documentTypes.isActive, true)).orderBy(asc(documentTypes.displayName));
  }

  async getUserDocuments(userId: string, status?: string): Promise<Document[]> {
    const conditions = [eq(documents.userId, userId), eq(documents.isActive, true)];
    if (status) conditions.push(eq(documents.status, status));
    return await db.select().from(documents).where(and(...conditions)).orderBy(desc(documents.createdAt));
  }

  async getDocuments(userId: string): Promise<Document[]> {
    return this.getUserDocuments(userId);
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    return doc || undefined;
  }

  async getDocumentById(documentId: string): Promise<any | null> {
    try {
      const [document] = await db.select().from(documents).where(eq(documents.id, documentId));
      return document || null;
    } catch (error) {
      console.error('Ошибка получения документа по ID:', error);
      throw error;
    }
  }

  async getPendingDocuments(): Promise<any[]> {
    try {
      const pendingDocs = await db.select().from(documents).where(or(eq(documents.status, 'pending'), eq(documents.status, 'processing')));
      const result = [];
      for (const doc of pendingDocs) {
        const [user] = await db.select().from(users).where(eq(users.id, doc.userId));
        if (user) {
          result.push({ id: doc.id, type: doc.documentTypeId, originalName: doc.fileName, userId: doc.userId, status: doc.status, uploadedAt: doc.createdAt, userFirstName: user.firstName, userLastName: user.lastName, userPhone: user.phone, userEmail: user.email });
        }
      }
      return result.sort((a, b) => {
        const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
        const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
        return dateB - dateA;
      });
    } catch (error) {
      console.error('Ошибка получения документов на модерацию:', error);
      throw error;
    }
  }

  async getArchivedDocuments(): Promise<any[]> {
    try {
      const archivedDocs = await db.select().from(documents).where(or(eq(documents.status, 'verified'), eq(documents.status, 'rejected')));
      const result = [];
      for (const doc of archivedDocs) {
        const [user] = await db.select().from(users).where(eq(users.id, doc.userId));
        if (user) {
          result.push({ id: doc.id, type: doc.documentTypeId, originalName: doc.fileName, userId: doc.userId, status: doc.status, uploadedAt: doc.createdAt, verifiedAt: doc.verifiedAt, userFirstName: user.firstName, userLastName: user.lastName, userPhone: user.phone, userEmail: user.email });
        }
      }
      return result.sort((a, b) => ((a.verifiedAt ? new Date(a.verifiedAt).getTime() : 0) - (b.verifiedAt ? new Date(b.verifiedAt).getTime() : 0)));
    } catch (error) {
      console.error('Ошибка получения архивных документов:', error);
      throw error;
    }
  }

  async createDocument(doc: InsertDocument): Promise<Document> {
    const [newDoc] = await db.insert(documents).values(doc).returning();
    return newDoc;
  }

  async updateDocument(id: string, updates: Partial<Document>): Promise<Document | undefined> {
    const [doc] = await db.update(documents).set(updates).where(eq(documents.id, id)).returning();
    return doc || undefined;
  }

  async updateDocumentStatus(id: string, newStatus: string, changedBy: string | null, changeReason?: string, verificationNotes?: string, extractedData?: any): Promise<Document | undefined> {
    const currentDoc = await this.getDocument(id);
    if (!currentDoc) return undefined;

    const updates: any = { status: newStatus, updatedAt: new Date() };
    if (newStatus === 'verified') {
      updates.verifiedBy = changedBy;
      updates.verifiedAt = new Date();
    }
    if (verificationNotes) updates.verificationNotes = verificationNotes;
    if (extractedData) updates.extractedData = extractedData;

    const [updatedDoc] = await db.update(documents).set(updates).where(eq(documents.id, id)).returning();

    await db.insert(documentVerificationHistory).values({ documentId: id, previousStatus: currentDoc.status, newStatus, changedBy, changeReason });

    if (newStatus === 'verified') {
      await this.updateUserVerificationStatus(updatedDoc.userId);
    }

    return updatedDoc;
  }

  async getDocumentVerificationHistory(documentId: string): Promise<DocumentVerificationHistory[]> {
    return this.getVerificationHistory(documentId);
  }

  async getVerificationHistory(documentId: string): Promise<DocumentVerificationHistory[]> {
    return await db.select().from(documentVerificationHistory).where(eq(documentVerificationHistory.documentId, documentId)).orderBy(desc(documentVerificationHistory.createdAt));
  }

  async createVerificationHistoryEntry(entry: { documentId: string; status: string; verifiedBy: string; verifiedAt: Date; reason?: string }): Promise<DocumentVerificationHistory> {
    const [historyEntry] = await db.insert(documentVerificationHistory).values({ 
      documentId: entry.documentId,
      previousStatus: (await this.getDocument(entry.documentId))?.status || 'pending',
      newStatus: entry.status,
      changedBy: entry.verifiedBy,
      changeReason: entry.reason,
    }).returning();
    return historyEntry;
  }

  async deleteDocument(id: string): Promise<boolean> {
    try {
      await db.delete(documentVerificationHistory).where(eq(documentVerificationHistory.documentId, id));
      const result = await db.delete(documents).where(eq(documents.id, id));
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('Error deleting document:', error);
      return false;
    }
  }

  async updateUserVerificationStatus(userId: string): Promise<void> {
    try {
      console.log(`🔄 Обновление статуса верификации для пользователя ${userId}`);
      const userDocuments = await db.select({ id: documents.id, documentTypeId: documents.documentTypeId, status: documents.status, typeName: documentTypes.name })
        .from(documents).innerJoin(documentTypes, eq(documents.documentTypeId, documentTypes.id)).where(and(eq(documents.userId, userId), eq(documents.status, 'verified')));

      const hasPassport = userDocuments.some(doc => doc.typeName === 'passport');
      const hasSnils = userDocuments.some(doc => doc.typeName === 'snils');
      const hasInn = userDocuments.some(doc => doc.typeName === 'inn');
      const hasIncomeDocument = userDocuments.some(doc => doc.typeName === 'income_document');

      const updates: any = {};
      const [currentUser] = await db.select().from(users).where(eq(users.id, userId));

      if (currentUser && currentUser.phone && currentUser.email && !currentUser.isVerified) {
        updates.isVerified = true;
        updates.verificationMethod = 'phone_email';
      }

      if (hasPassport) {
        updates.verificationLevel2 = true;
        if (!currentUser?.isVerified) {
          updates.isVerified = true;
          updates.verificationMethod = 'document_verification';
        }
      }

      if (hasPassport && hasSnils && hasInn && hasIncomeDocument) {
        updates.verificationLevel3 = true;
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date();
        await db.update(users).set(updates).where(eq(users.id, userId));
        console.log(`✅ Автоматически обновлен статус верификации для пользователя ${userId}:`, updates);
      }
    } catch (error) {
      console.error('❌ Ошибка при обновлении статуса верификации:', error);
    }
  }

  async getDocumentsWithUserInfo(): Promise<any[]> {
    return this.getPendingDocuments();
  }

  async getArchivedDocumentsWithUserInfo(): Promise<any[]> {
    return this.getArchivedDocuments();
  }
}
