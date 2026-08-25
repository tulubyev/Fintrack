/**
 * Issue #8 FIX: Secure Logging (Don't log sensitive data)
 * Prevents accidental exposure of passwords, tokens, API keys in logs
 */

const SENSITIVE_PATTERNS = [
  /password["\s:=]+([^\s",}]*)/gi,
  /token["\s:=]+([^\s",}]*)/gi,
  /apikey["\s:=]+([^\s",}]*)/gi,
  /secret["\s:=]+([^\s",}]*)/gi,
  /authorization["\s:=]+([^\s",}]*)/gi,
  /creditcard["\s:=]+([^\s",}]*)/gi,
  /ssn["\s:=]+([^\s",}]*)/gi,
  /phone["\s:=]+(\+\d{11})/gi,
  /email["\s:=]+([^\s",}@]*@)/gi,
];

export const sanitizeForLogging = (data: any): any => {
  if (!data) return data;

  const str = typeof data === 'string' ? data : JSON.stringify(data);
  
  let sanitized = str;
  SENSITIVE_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, (match, sensitive) => {
      // Handle short strings (less than 6 chars)
      if (sensitive.length <= 6) {
        return match.replace(sensitive, '***');
      }
      const prefix = sensitive.substring(0, 3);
      const suffix = sensitive.substring(sensitive.length - 2);
      return match.replace(sensitive, `${prefix}${'*'.repeat(sensitive.length - 5)}${suffix}`);
    });
  });

  try {
    return JSON.parse(sanitized);
  } catch {
    return sanitized;
  }
};

export const secureLogs = {
  sanitize: sanitizeForLogging,
  
  logRequest: (method: string, path: string, statusCode: number, time: number) => {
    const safeData = {
      method,
      path: path.replace(/\/[0-9a-f-]{36}/g, '/:id'), // Hide UUIDs
      statusCode,
      time: `${time}ms`
    };
    return safeData;
  },

  logError: (error: any) => {
    if (!error) return '';
    
    const message = error.message || String(error);
    return sanitizeForLogging(message);
  }
};
