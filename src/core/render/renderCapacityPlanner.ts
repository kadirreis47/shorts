import type { RenderPerformanceSnapshot } from './renderMetrics';

export interface RenderCapacityInput {
  snapshot: RenderPerformanceSnapshot | null;
  concurrency: number;
  jobsPerDay: number;
  averageVideoDurationSeconds: number;
  targetCompletionHours: number;
}

export interface RenderCapacityScenario {
  concurrency: number;
  estimatedJobsPerHour: number;
  estimatedDailyCapacity: number;
  estimatedCompletionHours: number;
  utilizationPercent: number;
  queueRisk: 'low' | 'medium' | 'high';
  meetsTarget: boolean;
}

export interface RenderCapacityPlan {
  generatedAt: string;
  baselineRenderMs: number;
  current: RenderCapacityScenario;
  alternatives: RenderCapacityScenario[];
  recommendedConcurrency: number;
  recommendation: string;
  confidence: number;
}

export function buildRenderCapacityPlan(
  input: RenderCapacityInput,
): RenderCapacityPlan {
  const concurrency = clamp(Math.round(input.concurrency), 1, 8);
  const jobsPerDay = Math.max(1, Math.round(input.jobsPerDay));
  const targetCompletionHours = clamp(
    input.targetCompletionHours,
    0.25,
    24,
  );
  const baselineRenderMs = estimateBaselineRenderMs(input);

  const current = calculateScenario({
    concurrency,
    jobsPerDay,
    targetCompletionHours,
    baselineRenderMs,
  });

  const alternatives = Array.from({ length: 4 }, (_, index) =>
    calculateScenario({
      concurrency: index + 1,
      jobsPerDay,
      targetCompletionHours,
      baselineRenderMs,
    }),
  );

  const recommended =
    alternatives.find(
      (scenario) =>
        scenario.meetsTarget &&
        scenario.utilizationPercent <= 75 &&
        scenario.queueRisk !== 'high',
    ) ??
    alternatives[alternatives.length - 1];

  const measuredJobs = input.snapshot?.totalJobs ?? 0;
  const confidence = clamp(
    Math.round(35 + Math.min(60, measuredJobs * 6)),
    35,
    95,
  );

  return {
    generatedAt: new Date().toISOString(),
    baselineRenderMs,
    current,
    alternatives,
    recommendedConcurrency: recommended.concurrency,
    recommendation: recommendationText(
      current,
      recommended,
      jobsPerDay,
    ),
    confidence,
  };
}

function estimateBaselineRenderMs(
  input: RenderCapacityInput,
): number {
  const measured = input.snapshot?.averageRenderMs ?? 0;
  if (measured > 0) return measured;

  const durationSeconds = Math.max(
    5,
    input.averageVideoDurationSeconds,
  );

  // No measured data yet: use conservative 1.25x real-time estimate.
  return Math.round(durationSeconds * 1_250);
}

function calculateScenario(input: {
  concurrency: number;
  jobsPerDay: number;
  targetCompletionHours: number;
  baselineRenderMs: number;
}): RenderCapacityScenario {
  const effectiveConcurrency = Math.max(1, input.concurrency);
  const jobsPerHour =
    (3_600_000 / Math.max(1, input.baselineRenderMs)) *
    effectiveConcurrency *
    efficiencyFactor(effectiveConcurrency);

  const estimatedDailyCapacity = Math.max(
    1,
    Math.floor(jobsPerHour * 24),
  );
  const estimatedCompletionHours =
    input.jobsPerDay / Math.max(0.01, jobsPerHour);
  const availableCapacityWithinTarget =
    jobsPerHour * input.targetCompletionHours;
  const utilizationPercent = Math.round(
    (input.jobsPerDay /
      Math.max(1, availableCapacityWithinTarget)) *
      100,
  );

  return {
    concurrency: effectiveConcurrency,
    estimatedJobsPerHour:
      Math.round(jobsPerHour * 100) / 100,
    estimatedDailyCapacity,
    estimatedCompletionHours:
      Math.round(estimatedCompletionHours * 100) / 100,
    utilizationPercent,
    queueRisk:
      utilizationPercent > 95
        ? 'high'
        : utilizationPercent > 75
          ? 'medium'
          : 'low',
    meetsTarget:
      estimatedCompletionHours <= input.targetCompletionHours,
  };
}

function efficiencyFactor(concurrency: number): number {
  if (concurrency <= 1) return 1;
  if (concurrency === 2) return 0.9;
  if (concurrency === 3) return 0.78;
  return 0.68;
}

function recommendationText(
  current: RenderCapacityScenario,
  recommended: RenderCapacityScenario,
  jobsPerDay: number,
): string {
  if (
    current.meetsTarget &&
    current.utilizationPercent <= 75
  ) {
    return (
      `Mevcut ${current.concurrency} concurrency ayarı günlük ` +
      `${jobsPerDay} iş için yeterli kapasite sağlıyor.`
    );
  }

  if (recommended.meetsTarget) {
    return (
      `Günlük ${jobsPerDay} işi hedef sürede tamamlamak için ` +
      `${recommended.concurrency} concurrency öneriliyor.`
    );
  }

  return (
    'Mevcut cihaz hedef kapasiteyi güvenli aralıkta karşılamıyor. ' +
    'Render cache, daha hızlı preset veya ek worker değerlendirilmelidir.'
  );
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(maximum, Math.max(minimum, value));
}
