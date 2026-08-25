/**
 * Issue #6 FIX: Query Optimization Middleware
 * Prevents N+1 queries through eager loading hints
 */

import { Request, Response, NextFunction } from 'express';

export interface OptimizedQuery {
  select?: string[];
  relations?: string[];
  limit?: number;
  offset?: number;
}

/**
 * Parse ?select=field1,field2 and ?relations=relation1,relation2
 */
export const queryOptimizationMiddleware = (
  req: Request & { optimizedQuery?: OptimizedQuery },
  res: Response,
  next: NextFunction
) => {
  const optimizedQuery: OptimizedQuery = {};

  // Parse select fields
  if (req.query.select) {
    const selectStr = Array.isArray(req.query.select)
      ? req.query.select[0]
      : req.query.select;
    
    optimizedQuery.select = String(selectStr)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  // Parse relations (eager loading)
  if (req.query.relations) {
    const relStr = Array.isArray(req.query.relations)
      ? req.query.relations[0]
      : req.query.relations;
    
    optimizedQuery.relations = String(relStr)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  // Parse pagination
  if (req.query.limit) {
    const limit = parseInt(String(req.query.limit), 10);
    if (limit > 0 && limit <= 1000) {
      optimizedQuery.limit = limit;
    }
  }

  if (req.query.offset) {
    const offset = parseInt(String(req.query.offset), 10);
    if (offset >= 0) {
      optimizedQuery.offset = offset;
    }
  }

  req.optimizedQuery = optimizedQuery;
  next();
};

/**
 * Hint for N+1 detection
 */
export const detectN1Queries = (stack: string[]): boolean => {
  const similarQueries = stack.filter(
    (q, idx) => 
      idx > 0 && 
      stack.slice(0, idx).some(prev => 
        prev.split(' ')[0] === q.split(' ')[0] // Same table queries
      )
  );
  
  return similarQueries.length > 3; // More than 3 similar queries = likely N+1
};
