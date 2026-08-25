import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface UserManagementProps {
  isVisible: boolean;
  users: any[];
  isLoading: boolean;
  userRole: string;
}

const ADMIN_ROLES = [
  { value: 'none', label: 'Пользователь (без админских прав)' },
  { value: 'super_admin', label: 'Супер Администратор' },
  { value: 'devops_admin', label: 'DevOps Администратор' },
  { value: 'analytics_admin', label: 'Аналитический Администратор' },
  { value: 'finance_admin', label: 'Финансовый Администратор' },
  { value: 'api_admin', label: 'API Администратор' },
  { value: 'security_admin', label: 'Администратор Безопасности' }
];

const USER_ROLES = [
  { value: 'personal', label: 'Персональный' },
  { value: 'premium', label: 'Премиум' },
  { value: 'family_admin', label: 'Семейный (Админ)' },
  { value: 'family_member', label: 'Семейный (Участник)' },
  { value: 'business', label: 'Бизнес' }
];

interface EditableField {
  phone?: string;
  email?: string;
  address?: string;
  birthDate?: string;
  snils?: string;
  inn?: string;
}

interface EditingFields {
  phone: boolean;
  email: boolean;
  address: boolean;
  birthDate: boolean;
  snils: boolean;
  inn: boolean;
}

export function UserManagement({ isVisible, users, isLoading, userRole }: UserManagementProps) {
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isUserCardOpen, setIsUserCardOpen] = useState(false);
  const [editedAdminRole, setEditedAdminRole] = useState<string>('none');
  const [editedRole, setEditedRole] = useState<string>('personal');
  const [editableFields, setEditableFields] = useState<EditableField>({});
  const [editingFields, setEditingFields] = useState<EditingFields>({
    phone: false,
    email: false,
    address: false,
    birthDate: false,
    snils: false,
    inn: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, adminRole }: { userId: string; adminRole: string | null }) => {
      const response = await apiRequest('PATCH', `/api/admin/users/${userId}/role`, { 
        adminRole: adminRole === 'none' ? null : adminRole 
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: '✅ Роль изменена',
        description: data.message || 'Роль пользователя успешно обновлена',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      if (selectedUser) {
        setSelectedUser({ ...selectedUser, adminRole: editedAdminRole === 'none' ? null : editedAdminRole });
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Ошибка',
        description: error.message || 'Не удалось изменить роль',
        variant: 'destructive',
      });
    }
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: any }) => {
      const response = await apiRequest('PATCH', `/api/admin/users/${userId}`, updates);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: '✅ Данные изменены и сохранены',
        description: 'Данные пользователя успешно обновлены',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Ошибка',
        description: error.message || 'Не удалось сохранить данные',
        variant: 'destructive',
      });
    }
  });

  if (!isVisible) return null;

  const handleViewClick = (user: any) => {
    setSelectedUser(user);
    setEditedAdminRole(user.adminRole || 'none');
    setEditedRole(user.role || 'personal');
    setEditableFields({
      phone: user.phone,
      email: user.email,
      address: user.address,
      birthDate: user.birthDate ? new Date(user.birthDate).toISOString().split('T')[0] : '',
      snils: user.snils,
      inn: user.inn,
    });
    setIsUserCardOpen(true);
  };

  const handleFieldClick = (field: keyof EditingFields) => {
    setEditingFields(prev => ({ ...prev, [field]: true }));
  };

  const handleFieldSave = async (field: keyof EditableField) => {
    setEditingFields(prev => ({ ...prev, [field]: false }));
    if (!selectedUser) return;

    setIsSaving(true);
    try {
      const updates: any = {};
      updates[field] = editableFields[field];
      
      await updateUserMutation.mutateAsync({
        userId: selectedUser.id,
        updates
      });

      setSelectedUser({
        ...selectedUser,
        [field]: editableFields[field]
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFieldChange = (field: keyof EditableField, value: string) => {
    setEditableFields(prev => ({ ...prev, [field]: value }));
  };

  const getDocumentStatus = (user: any) => {
    if (user.verificationLevel3) return { text: 'Полная верификация (Уровень 3)', color: '#28a745' };
    if (user.verificationLevel2) return { text: 'Расширенная верификация (Уровень 2)', color: '#17a2b8' };
    if (user.isVerified) return { text: 'Базовая верификация (Уровень 1)', color: '#ffc107' };
    return { text: 'Не верифицирован', color: '#dc3545' };
  };

  const getRoleBadgeColor = (role: string | null) => {
    switch (role) {
      case 'super_admin': return '#dc3545';
      case 'devops_admin': return '#6f42c1';
      case 'analytics_admin': return '#17a2b8';
      case 'finance_admin': return '#28a745';
      case 'api_admin': return '#fd7e14';
      case 'security_admin': return '#6c757d';
      default: return '#007bff';
    }
  };

  const EditableFieldComponent = ({ label, field, value, type = 'text' }: any) => {
    const isEditing = editingFields[field as keyof EditingFields];
    
    if (!userRole || userRole !== 'super_admin') {
      return (
        <div>
          <Label style={{ fontSize: '12px', color: '#666' }}>{label}</Label>
          <div style={{ fontSize: '15px', fontWeight: '500', marginTop: '4px' }}>
            {value || 'Не указано'}
          </div>
        </div>
      );
    }

    return (
      <div>
        <Label style={{ fontSize: '12px', color: '#666' }}>{label}</Label>
        {isEditing ? (
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <input
              type={type}
              value={value || ''}
              onChange={(e) => handleFieldChange(field, e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleFieldSave(field);
                }
              }}
              style={{
                flex: 1,
                padding: '6px 10px',
                border: '1px solid #007bff',
                borderRadius: '4px',
                fontSize: '14px'
              }}
              autoFocus
              data-testid={`input-edit-${field}`}
            />
            <button
              onClick={() => handleFieldSave(field)}
              style={{
                padding: '6px 12px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
              data-testid={`button-save-${field}`}
            >
              ✓
            </button>
          </div>
        ) : (
          <div
            onClick={() => handleFieldClick(field as keyof EditingFields)}
            style={{
              fontSize: '15px',
              fontWeight: '500',
              marginTop: '4px',
              padding: '6px 10px',
              backgroundColor: '#f0f0f0',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
              border: '1px solid transparent',
              minHeight: '32px',
              display: 'flex',
              alignItems: 'center'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e0e0e0'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
            data-testid={`field-${field}`}
          >
            {value || 'Не указано'} <span style={{ marginLeft: '8px', fontSize: '12px', color: '#999' }}>✏️</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', border: '1px solid #e9ecef', marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 15px 0', color: '#333' }}>👥 Управление пользователями</h2>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <div>Загрузка пользователей...</div>
          </div>
        ) : (
          <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {users.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                Пользователи не найдены
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {users.map((userItem: any) => (
                  <div key={userItem.id} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: '15px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px',
                    border: '1px solid #e9ecef'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <div style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        backgroundColor: '#e9ecef',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        flexShrink: 0
                      }}>
                        {userItem.profileImageUrl ? (
                          <img 
                            src={userItem.profileImageUrl} 
                            alt="avatar" 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <span style={{ fontSize: '20px', color: '#666' }}>
                            {userItem.firstName?.[0]?.toUpperCase() || '?'}
                          </span>
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: 'bold', color: '#333', marginBottom: '5px' }}>
                          {userItem.firstName} {userItem.lastName}
                          {userItem.adminRole && (
                            <span style={{
                              marginLeft: '10px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: getRoleBadgeColor(userItem.adminRole),
                              color: 'white',
                              fontSize: '11px'
                            }}>
                              {ADMIN_ROLES.find(r => r.value === userItem.adminRole)?.label || userItem.adminRole}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '14px', color: '#666', marginBottom: '5px' }}>
                          📞 {userItem.phone} • ✉️ {userItem.email || 'Не указан'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#999' }}>
                          ID: {userItem.id} • Тип: {USER_ROLES.find(r => r.value === userItem.role)?.label || userItem.role || 'Персональный'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#999' }}>
                          Верификация: 
                          <span style={{ margin: '0 5px' }}>
                            Уровень 1: {userItem.isVerified ? '✅' : '❌'}
                          </span>
                          <span style={{ margin: '0 5px' }}>
                            Уровень 2: {userItem.verificationLevel2 ? '✅' : '❌'}
                          </span>
                          <span style={{ margin: '0 5px' }}>
                            Уровень 3: {userItem.verificationLevel3 ? '✅' : '❌'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                      <button 
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#17a2b8',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '500'
                        }}
                        onClick={() => handleViewClick(userItem)}
                        data-testid={`button-view-user-${userItem.id}`}
                      >
                        👁️ Просмотр
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Модальное окно карточки пользователя */}
      <Dialog open={isUserCardOpen} onOpenChange={setIsUserCardOpen}>
        <DialogContent style={{ maxWidth: '600px' }}>
          <DialogHeader>
            <DialogTitle>Карточка пользователя</DialogTitle>
            <DialogDescription>
              Просмотр и редактирование данных пользователя (нажмите на поле для редактирования)
            </DialogDescription>
          </DialogHeader>
          
          {selectedUser && (
            <div style={{ display: 'grid', gap: '20px' }}>
              {/* Фото и основная информация */}
              <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '100px',
                  height: '100px',
                  borderRadius: '12px',
                  backgroundColor: '#e9ecef',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0,
                  border: '3px solid #dee2e6'
                }}>
                  {selectedUser.profileImageUrl ? (
                    <img 
                      src={selectedUser.profileImageUrl} 
                      alt="avatar" 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span style={{ fontSize: '36px', color: '#666' }}>
                      {selectedUser.firstName?.[0]?.toUpperCase() || '?'}
                    </span>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', color: '#333' }}>
                    {selectedUser.firstName} {selectedUser.lastName}
                    {selectedUser.middleName && ` ${selectedUser.middleName}`}
                  </h3>
                  <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
                    ID: <code style={{ backgroundColor: '#f1f3f4', padding: '2px 6px', borderRadius: '4px' }}>{selectedUser.id}</code>
                  </div>
                  <div style={{ 
                    display: 'inline-block',
                    padding: '4px 12px', 
                    borderRadius: '20px', 
                    backgroundColor: getDocumentStatus(selectedUser).color, 
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}>
                    {getDocumentStatus(selectedUser).text}
                  </div>
                </div>
              </div>

              {/* Контактная информация - редактируемая */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '15px',
                padding: '15px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px'
              }}>
                <EditableFieldComponent label="📞 Телефон" field="phone" value={editableFields.phone} type="tel" />
                <EditableFieldComponent label="✉️ Email" field="email" value={editableFields.email} type="email" />
                <EditableFieldComponent label="📍 Адрес" field="address" value={editableFields.address} type="text" />
                <EditableFieldComponent label="🎂 Дата рождения" field="birthDate" value={editableFields.birthDate} type="date" />
              </div>

              {/* Документы - редактируемые */}
              <div style={{ 
                padding: '15px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px'
              }}>
                <Label style={{ fontSize: '12px', color: '#666', marginBottom: '10px', display: 'block' }}>📄 Документы</Label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <EditableFieldComponent label="СНИЛС" field="snils" value={editableFields.snils} type="text" />
                  <EditableFieldComponent label="ИНН" field="inn" value={editableFields.inn} type="text" />
                  <div>
                    <Label style={{ fontSize: '12px', color: '#666' }}>ЕСИА</Label>
                    <div style={{ fontSize: '15px', fontWeight: '500', marginTop: '4px' }}>
                      {selectedUser.esiaOid ? '✅ Привязан' : '❌ Не привязан'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Роли */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '15px',
                padding: '15px',
                backgroundColor: '#fff3cd',
                borderRadius: '8px',
                border: '1px solid #ffc107'
              }}>
                <div>
                  <Label style={{ fontSize: '12px', color: '#856404', marginBottom: '8px', display: 'block' }}>
                    👤 Тип аккаунта
                  </Label>
                  <Select value={editedRole} onValueChange={setEditedRole}>
                    <SelectTrigger data-testid="select-user-role">
                      <SelectValue placeholder="Выберите тип" />
                    </SelectTrigger>
                    <SelectContent>
                      {USER_ROLES.map(role => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {userRole === 'super_admin' && (
                  <div>
                    <Label style={{ fontSize: '12px', color: '#856404', marginBottom: '8px', display: 'block' }}>
                      🔐 Админская роль
                    </Label>
                    <Select value={editedAdminRole} onValueChange={setEditedAdminRole}>
                      <SelectTrigger data-testid="select-admin-role">
                        <SelectValue placeholder="Выберите роль" />
                      </SelectTrigger>
                      <SelectContent>
                        {ADMIN_ROLES.map(role => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Статистика верификации */}
              <div style={{ 
                padding: '15px',
                backgroundColor: '#e7f5ff',
                borderRadius: '8px',
                border: '1px solid #74c0fc'
              }}>
                <Label style={{ fontSize: '12px', color: '#1971c2', marginBottom: '10px', display: 'block' }}>
                  ✅ Статус верификации
                </Label>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px' }}>{selectedUser.isVerified ? '✅' : '⬜'}</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>Уровень 1</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px' }}>{selectedUser.verificationLevel2 ? '✅' : '⬜'}</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>Уровень 2</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px' }}>{selectedUser.verificationLevel3 ? '✅' : '⬜'}</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>Уровень 3</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px' }}>{selectedUser.isPhoneVerified ? '✅' : '⬜'}</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>Телефон</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px' }}>{selectedUser.isEmailVerified ? '✅' : '⬜'}</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>Email</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px' }}>{selectedUser.twoFactorEnabled ? '✅' : '⬜'}</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>2FA</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <Button variant="outline" onClick={() => setIsUserCardOpen(false)}>
              Закрыть
            </Button>
            {userRole === 'super_admin' && (
              <Button 
                onClick={async () => {
                  if (!selectedUser) return;
                  setIsSaving(true);
                  try {
                    await updateRoleMutation.mutateAsync({
                      userId: selectedUser.id,
                      adminRole: editedAdminRole
                    });
                  } finally {
                    setIsSaving(false);
                  }
                }}
                disabled={isSaving || updateRoleMutation.isPending}
                style={{ backgroundColor: '#007bff' }}
                data-testid="button-save-role"
              >
                {updateRoleMutation.isPending ? 'Сохранение...' : '🔐 Сохранить роль'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
