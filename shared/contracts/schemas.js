import { z } from 'zod';

export const Mode = {
  NORMAL: 'normal',
  TRAVEL: 'travel'
};

export const MealPeriod = {
  BREAKFAST: 'breakfast',
  LUNCH: 'lunch',
  DINNER: 'dinner',
  LATE_NIGHT: 'late_night'
};

export const TransportMode = {
  WALK: 'walk',
  DRIVE: 'drive'
};

export const ErrorCodes = {
  GEO_REQUIRED: 'GEO_REQUIRED',
  INVALID_TOTAL_TIME: 'INVALID_TOTAL_TIME',
  SCHEDULED_MEAL_UNSUPPORTED: 'SCHEDULED_MEAL_UNSUPPORTED',
  NO_RESULTS: 'NO_RESULTS',
  ROUTE_UNAVAILABLE: 'ROUTE_UNAVAILABLE',
  PROVIDER_QUOTA: 'PROVIDER_QUOTA',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  UNSUPPORTED_BROWSER: 'UNSUPPORTED_BROWSER',
  SESSION_EXPIRED: 'SESSION_EXPIRED'
};

export const SlotPriorityOrder = [
  'mode',
  'location',
  'mealPeriod',
  'totalTimeMinutes',
  'transportMode',
  'budgetPerPersonKrw',
  'partyContext',
  'vibe',
  'excludedFoods'
];

export const CoordinateSchema = z.object({
  lat: z.number({ required_error: 'Latitude is required' }),
  lng: z.number({ required_error: 'Longitude is required' })
});

export const LocationPayloadSchema = CoordinateSchema.extend({
  accuracyMeters: z.number().nonnegative().nullable().optional(),
  source: z.enum([
    'browser-geolocation',
    'manual-location',
    'selected-location'
  ])
}).strict();

export const CanonicalExpectedSlotBundleSchema = z
  .object({
    mode: z.enum([Mode.NORMAL, Mode.TRAVEL]),
    mealPeriod: z.enum([
      MealPeriod.BREAKFAST,
      MealPeriod.LUNCH,
      MealPeriod.DINNER,
      MealPeriod.LATE_NIGHT
    ]),
    totalTimeMinutes: z.number().int().min(20).max(60),
    transportMode: z.enum([TransportMode.WALK, TransportMode.DRIVE]),
    budgetPerPersonKrw: z.number().int().nonnegative(),
    partyContext: z.string(),
    vibe: z.string(),
    excludedFoods: z.array(z.string())
  })
  .strict();

export const CanonicalCollegeStudentPromptFixtureSchema = z
  .object({
    prompt: z.string().min(1),
    expectedSlotBundle: CanonicalExpectedSlotBundleSchema
  })
  .strict();

export const VenuePreference = {
  RESTAURANT: 'restaurant',
  CAFE: 'cafe',
  BAR: 'bar',
  ANY: 'any'
};

export const SlotSchema = z.object({
  mode: z.enum([Mode.NORMAL, Mode.TRAVEL]),
  mealPeriod: z.enum([
    MealPeriod.BREAKFAST,
    MealPeriod.LUNCH,
    MealPeriod.DINNER,
    MealPeriod.LATE_NIGHT
  ]),
  budgetPerPersonKrw: z.number().int().nonnegative(),
  totalTimeMinutes: z
    .number()
    .int()
    .min(20, '총 소요시간은 최소 20분이어야 합니다.')
    .max(60, '총 소요시간은 최대 60분이어야 합니다.'),
  transportMode: z.enum([TransportMode.WALK, TransportMode.DRIVE]),
  excludedFoods: z.array(z.string()),
  partyContext: z.string(),
  vibe: z.string(),
  location: CoordinateSchema,
  venuePreference: z
    .enum([
      VenuePreference.RESTAURANT,
      VenuePreference.CAFE,
      VenuePreference.BAR,
      VenuePreference.ANY
    ])
    .optional(),
  jobContext: z.string().optional().nullable(),
  ageGroup: z.string().optional().nullable()
});

const RecommendationRequestBaseSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  mode: z.enum([Mode.NORMAL, Mode.TRAVEL]).default(Mode.NORMAL),
  location: LocationPayloadSchema.optional().nullable(),
  userLocation: CoordinateSchema.optional().nullable(),
  selectedLocation: z
    .union([CoordinateSchema, z.object({ coords: CoordinateSchema })])
    .optional()
    .nullable(),
  now: z.string().datetime({ offset: true }).optional().nullable()
});

export const RecommendationRequestSchema = z.preprocess((value) => {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value.prompt === 'string' &&
    value.query === undefined
  ) {
    return { ...value, query: value.prompt };
  }
  return value;
}, RecommendationRequestBaseSchema);

export const AnswersRequestSchema = z.object({
  answers: z.record(z.any())
});

export const FeedbackRequestSchema = z.object({
  action: z.enum(['like', 'dislike']),
  candidateId: z.string().min(1)
});

export const NormalizedRouteSchema = z.object({
  durationMinutes: z.number().int().nonnegative(),
  distanceMeters: z.number().int().nonnegative(),
  path: z.array(CoordinateSchema)
});

export const NormalizedCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  address: z.string(),
  location: CoordinateSchema,
  placeUrl: z.string().url().nullable().optional(),

  priceLevel: z.null().default(null),
  openingHours: z.null().default(null),
  rating: z.null().default(null),
  reviewCount: z.null().default(null),
  reviewSummary: z.null().default(null),

  transportMode: z.enum([TransportMode.WALK, TransportMode.DRIVE]),
  oneWayRouteMinutes: z.number().int().nonnegative(),
  totalExpectedMinutes: z.number().int().nonnegative(),
  distanceMeters: z.number().int().nonnegative(),
  confidenceBadge: z.enum(['high', 'medium', 'low']),
  reason: z.string(),
  providerAttribution: z.string(),
  openStatus: z.boolean().nullable().default(null),
  path: z.array(CoordinateSchema).optional()
});

export const OrchestratorDecisionOutputSchema = z
  .object({
    nextAgent: z.enum(['aleph', 'bet', 'gimel', 'orchestrator']),
    phase: z.enum([
      'slot_parsing',
      'missing_slot_questions',
      'candidate_search',
      'reason_generation',
      'final_response'
    ]),
    rationale: z.string().min(1)
  })
  .strict();

export const BetCandidateSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    address: z.string(),
    location: CoordinateSchema,
    placeUrl: z.string().url().nullable().optional(),
    transportMode: z.enum([TransportMode.WALK, TransportMode.DRIVE]),
    oneWayRouteMinutes: z.number().int().nonnegative(),
    totalExpectedMinutes: z.number().int().nonnegative(),
    distanceMeters: z.number().int().nonnegative(),
    confidenceBadge: z.enum(['high', 'medium', 'low']),
    providerAttribution: z.string(),
    openStatus: z.boolean().nullable().default(null),
    scoreBreakdown: z
      .object({
        total: z.number(),
        components: z.record(z.string(), z.number())
      })
      .strict()
  })
  .strict();

export const BetSearchOutputSchema = z
  .object({
    candidatePool: z.array(BetCandidateSchema).max(5)
  })
  .strict();

export const QuestionsResponseSchema = z.object({
  status: z.literal('questions'),
  sessionId: z.string(),
  missingFields: z.array(z.string()),
  questions: z.array(
    z.object({
      field: z.string(),
      label: z.string()
    })
  )
});

export const ResultsResponseSchema = z.object({
  status: z.literal('results'),
  sessionId: z.string(),
  eligibleCount: z.number().int().nonnegative(),
  results: z.array(NormalizedCandidateSchema),
  currentRecommendation: NormalizedCandidateSchema.optional(),
  candidatePool: z.array(NormalizedCandidateSchema).max(5).optional()
});

export const ErrorResponseSchema = z.object({
  status: z.literal('error'),
  code: z.enum([
    ErrorCodes.GEO_REQUIRED,
    ErrorCodes.INVALID_TOTAL_TIME,
    ErrorCodes.SCHEDULED_MEAL_UNSUPPORTED,
    ErrorCodes.NO_RESULTS,
    ErrorCodes.ROUTE_UNAVAILABLE,
    ErrorCodes.PROVIDER_QUOTA,
    ErrorCodes.PROVIDER_ERROR,
    ErrorCodes.UNSUPPORTED_BROWSER,
    ErrorCodes.SESSION_EXPIRED
  ]),
  message: z.string(),
  missingFields: z.array(z.string()).default([])
});

export const AlephParseOutputSchema = z.object({
  mode: z.enum([Mode.NORMAL, Mode.TRAVEL]).nullable().default(null),
  mealPeriod: z
    .enum([
      MealPeriod.BREAKFAST,
      MealPeriod.LUNCH,
      MealPeriod.DINNER,
      MealPeriod.LATE_NIGHT
    ])
    .nullable()
    .default(null),
  budgetPerPersonKrw: z.number().int().nonnegative().nullable().default(null),
  totalTimeMinutes: z.number().int().nullable().default(null),
  transportMode: z
    .enum([TransportMode.WALK, TransportMode.DRIVE])
    .nullable()
    .default(null),
  excludedFoods: z.array(z.string()).nullable().default(null),
  partyContext: z.string().nullable().default(null),
  vibe: z.string().nullable().default(null),
  location: CoordinateSchema.nullable().default(null),
  venuePreference: z
    .enum([
      VenuePreference.RESTAURANT,
      VenuePreference.CAFE,
      VenuePreference.BAR,
      VenuePreference.ANY
    ])
    .nullable()
    .default(null),
  jobContext: z.string().nullable().default(null),
  ageGroup: z.string().nullable().default(null)
});

export const AlephMissingSlotOutputSchema = z.object({
  missingFields: z.array(z.string()),
  questions: z.array(
    z.object({
      field: z.string(),
      label: z.string()
    })
  )
});

export const GimelInputAllowlistSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    address: z.string(),
    transportMode: z.enum([TransportMode.WALK, TransportMode.DRIVE]),
    oneWayRouteMinutes: z.number().int().nonnegative(),
    totalExpectedMinutes: z.number().int().nonnegative(),
    distanceMeters: z.number().int().nonnegative(),
    openStatus: z.boolean().nullable().default(null),
    confidenceBadge: z.enum(['high', 'medium', 'low']),
    providerAttribution: z.string()
  })
  .strict();

export const GimelReasonOutputSchema = z.object({
  reasons: z.array(
    z.object({
      id: z.string(),
      reason: z.string()
    })
  )
});

export const ReviewExtractionOutputSchema = z
  .object({
    provider: z.enum(['naver']).nullable(),
    placeUrl: z.string().url().nullable(),
    placeId: z.string().nullable(),
    rating: z.number().min(0).max(5).nullable(),
    reviewCount: z.number().int().nonnegative().nullable(),
    reviews: z.array(
      z
        .object({
          body: z.string().min(1),
          author: z.string().nullable().optional(),
          rating: z.number().min(0).max(5).nullable().optional(),
          visitedAt: z.string().nullable().optional()
        })
        .strict()
    ),
    reviewSummary: z
      .object({
        pros: z.string().nullable(),
        cons: z.string().nullable()
      })
      .strict(),
    reviewSnippets: z.array(z.string()),
    extractionMethod: z.enum(['browser', 'static-hydration', 'unavailable']),
    fetchedAt: z.string().datetime({ offset: true }),
    error: z.string().nullable()
  })
  .strict();

export const RecommendationResponseSchema = z.discriminatedUnion('status', [
  QuestionsResponseSchema,
  ResultsResponseSchema,
  ErrorResponseSchema
]);

export const LocationSearchResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  location: CoordinateSchema
});
