import type { ImportStatus, RowStatus } from './api';

export const STATUS_LABELS: Record<ImportStatus, string> = {
  uploaded: 'Загружена',
  parsing: 'Читаем…',
  needs_mapping: 'Нужно выбрать колонки',
  preview: 'Ждёт подтверждения',
  committing: 'Сохраняем…',
  done: 'Загружена',
  failed: 'Ошибка',
  cancelled: 'Удалена',
  undone: 'Отменена',
};

export const ROW_STATUS_LABELS: Record<RowStatus, string> = {
  new: 'новые',
  duplicate: 'уже есть',
  possible_duplicate: 'похожи на дубли',
  skipped: 'пропущены',
  error: 'ошибки',
};
