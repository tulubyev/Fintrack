import { MetricsCollector } from './collector';
import { ApplicationMetrics } from './types';

/**
 * Экспортер метрик - форматирование для внешних систем
 */
export class MetricsExporter {
  constructor(private collector: MetricsCollector) {}

  /**
   * Экспорт метрик в различных форматах
   */
  export(format: 'prometheus' | 'json' | 'csv'): string {
    switch (format) {
      case 'prometheus':
        return this.exportPrometheus();
      case 'json':
        return this.exportJSON();
      case 'csv':
        return this.exportCSV();
      default:
        return this.exportJSON();
    }
  }

  /**
   * Экспорт в формат Prometheus
   */
  private exportPrometheus(): string {
    const metrics = this.collector.getCurrentMetrics();
    const lines: string[] = [];

    lines.push(`# HELP fintrack_uptime_seconds Application uptime in seconds`);
    lines.push(`# TYPE fintrack_uptime_seconds counter`);
    lines.push(`fintrack_uptime_seconds ${metrics.uptime / 1000}`);

    lines.push(`# HELP fintrack_requests_total Total number of requests`);
    lines.push(`# TYPE fintrack_requests_total counter`);
    lines.push(`fintrack_requests_total ${metrics.totalRequests}`);

    lines.push(`# HELP fintrack_response_time_seconds Average response time in seconds`);
    lines.push(`# TYPE fintrack_response_time_seconds gauge`);
    lines.push(`fintrack_response_time_seconds ${metrics.averageResponseTime / 1000}`);

    lines.push(`# HELP fintrack_memory_bytes Memory usage in bytes`);
    lines.push(`# TYPE fintrack_memory_bytes gauge`);
    lines.push(`fintrack_memory_bytes ${metrics.performance.memory}`);

    lines.push(`# HELP fintrack_error_rate Error rate percentage`);
    lines.push(`# TYPE fintrack_error_rate gauge`);
    lines.push(`fintrack_error_rate ${metrics.errors.rate}`);

    lines.push(`# HELP fintrack_cache_hit_rate Cache hit rate percentage`);
    lines.push(`# TYPE fintrack_cache_hit_rate gauge`);
    lines.push(`fintrack_cache_hit_rate ${metrics.cache.hitRate}`);

    lines.push(`# HELP fintrack_cache_entries Number of cache entries`);
    lines.push(`# TYPE fintrack_cache_entries gauge`);
    lines.push(`fintrack_cache_entries ${metrics.cache.entryCount}`);

    lines.push(`# HELP fintrack_active_users Number of active users`);
    lines.push(`# TYPE fintrack_active_users gauge`);
    lines.push(`fintrack_active_users ${metrics.users.activeUsers}`);

    return lines.join('\n');
  }

  /**
   * Экспорт в JSON
   */
  private exportJSON(): string {
    return JSON.stringify(this.collector.getCurrentMetrics(), null, 2);
  }

  /**
   * Экспорт в CSV
   */
  private exportCSV(): string {
    const metrics = this.collector.getCurrentMetrics();
    const lines: string[] = [];
    const timestamp = Date.now();

    lines.push('metric,value,timestamp');
    lines.push(`uptime,${metrics.uptime},${timestamp}`);
    lines.push(`total_requests,${metrics.totalRequests},${timestamp}`);
    lines.push(`requests_per_minute,${metrics.requestsPerMinute},${timestamp}`);
    lines.push(`average_response_time,${metrics.averageResponseTime},${timestamp}`);
    lines.push(`memory_usage,${metrics.performance.memory},${timestamp}`);
    lines.push(`heap_used,${metrics.performance.heapUsed},${timestamp}`);
    lines.push(`error_rate,${metrics.errors.rate},${timestamp}`);
    lines.push(`error_total,${metrics.errors.total},${timestamp}`);
    lines.push(`cache_hits,${metrics.cache.hits},${timestamp}`);
    lines.push(`cache_misses,${metrics.cache.misses},${timestamp}`);
    lines.push(`cache_hit_rate,${metrics.cache.hitRate},${timestamp}`);

    return lines.join('\n');
  }
}
