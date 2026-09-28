export const SCORE_DIMENSIONS = {
  career: '事业运',
  wealth: '财运',
  relationship: '感情运',
  health: '健康运',
  study: '学业运',
} as const;

export type ScoreDimension = keyof typeof SCORE_DIMENSIONS;

export const FORTUNE_RATINGS = {
  great: { label: '大吉', color: '#c62828', min: 90 },
  good: { label: '吉', color: '#e65100', min: 70 },
  neutral: { label: '平', color: '#9e9e9e', min: 50 },
  bad: { label: '凶', color: '#4a148c', min: 30 },
  terrible: { label: '大凶', color: '#1a237e', min: 0 },
} as const;
