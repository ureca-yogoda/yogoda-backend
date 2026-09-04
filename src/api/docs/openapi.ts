/**
 * @openapi
 * components:
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       required: [message]
 *       properties:
 *         message: { type: string }
 *     PersonaAnswers:
 *       type: object
 *       required: [usageType, monthlyData, contentPreference, benefitPreference, planPriority, recommendationPriority]
 *       properties:
 *         usageType: { type: string, enum: [data, benefit, saving, ai] }
 *         monthlyData: { type: string, enum: [light, normal, heavy, unlimited] }
 *         contentPreference: { type: string, enum: [video, sns, game, basic] }
 *         benefitPreference: { type: string, enum: [membership, ott, coupon, none] }
 *         planPriority: { type: string, enum: [price, balance, benefits, premium] }
 *         recommendationPriority: { type: string, enum: [cheap, data, benefit, balanced] }
 *     PersonaAnalysis:
 *       type: object
 *       required: [type, title, description, summary, scores, direction, directionDescription]
 *       properties:
 *         type: { type: string, enum: [data_heavy, content_balanced, benefit_focused, saving_focused, balanced] }
 *         title: { type: string }
 *         description: { type: string }
 *         summary: { type: string }
 *         scores:
 *           type: object
 *           properties:
 *             data: { type: integer, minimum: 0, maximum: 100 }
 *             content: { type: integer, minimum: 0, maximum: 100 }
 *             benefit: { type: integer, minimum: 0, maximum: 100 }
 *             price: { type: integer, minimum: 0, maximum: 100 }
 *         direction: { type: string }
 *         directionDescription: { type: string }
 *     Subscription:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         serviceCode: { type: string }
 *         serviceName: { type: string }
 *         category: { type: string, enum: [ott, music, shopping, delivery, other] }
 *         monthlyFee: { type: number, minimum: 0 }
 *         status: { type: string, enum: [active, canceled] }
 *         startedAt: { type: string, format: date-time }
 *         canceledAt: { type: string, format: date-time, nullable: true }
 *     UsageReport:
 *       type: object
 *       properties:
 *         source: { type: string, enum: [demo] }
 *         scenario: { type: string, enum: [baseline, usage-drop] }
 *         period: { type: string, example: 2026-09 }
 *         dataUsed: { type: number }
 *         dataLimit: { type: number, nullable: true, description: "null means unlimited data" }
 *         callMinutes: { type: number }
 *         subscriptionCount: { type: integer }
 *         monthlyFee: { type: number }
 *         history: { type: array, items: { type: object } }
 *         averageUsage: { type: number }
 *         recentAverage: { type: number }
 *         previousAverage: { type: number }
 *         changeRate: { type: number }
 *         activeOttCount: { type: integer }
 *     UsageRecommendation:
 *       type: object
 *       properties:
 *         status: { type: string, enum: [keep-current, recommend-change] }
 *         headline: { type: string }
 *         reason: { type: string }
 *         currentPlan: { type: object }
 *         recommendedPlan: { type: object, nullable: true }
 *         monthlySavings: { type: number }
 *         analysisSource: { type: string, enum: [ai, rules] }
 *         evidence: { type: object }
 *     Plan: { type: object, additionalProperties: true }
 *     Benefit: { type: object, additionalProperties: true }
 *     Store: { type: object, additionalProperties: true }
 *     Mission: { type: object, additionalProperties: true }
 *   responses:
 *     BadRequest:
 *       description: 잘못된 요청
 *       content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *     Unauthorized:
 *       description: 인증 실패
 *       content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *     NotFound:
 *       description: 리소스를 찾을 수 없음
 *       content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *     Conflict:
 *       description: 현재 상태와 요청이 충돌함
 *       content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */

/**
 * @openapi
 * /api/persona/analyze:
 *   post:
 *     summary: 설문 답변 AI 페르소나 분석
 *     tags: [Persona]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [answers]
 *             properties:
 *               answers: { $ref: '#/components/schemas/PersonaAnswers' }
 *               locale: { type: string, enum: [ko, en], default: ko }
 *     responses:
 *       200:
 *         description: AI 분석 결과
 *         content: { application/json: { schema: { $ref: '#/components/schemas/PersonaAnalysis' } } }
 *       422: { $ref: '#/components/responses/BadRequest' }
 *       503: { description: AI 분석 서비스 일시 장애 }
 */

/**
 * @openapi
 * /api/subscriptions/me:
 *   get:
 *     summary: 내 구독 서비스 목록 조회
 *     tags: [Subscriptions]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: 활성 구독 요약과 전체 목록 }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   post:
 *     summary: 내 구독 서비스 추가
 *     tags: [Subscriptions]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serviceCode, serviceName, category, monthlyFee, startedAt]
 *             properties:
 *               serviceCode: { type: string }
 *               serviceName: { type: string }
 *               category: { type: string, enum: [ott, music, shopping, delivery, other] }
 *               monthlyFee: { type: number, minimum: 0 }
 *               startedAt: { type: string, format: date-time }
 *     responses:
 *       201: { description: 구독 추가 완료 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 * /api/subscriptions/me/{subscriptionId}:
 *   patch:
 *     summary: 내 구독 서비스 변경 또는 재활성화
 *     tags: [Subscriptions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: subscriptionId, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               monthlyFee: { type: number, minimum: 0 }
 *               status: { type: string, enum: [active, canceled] }
 *               startedAt: { type: string, format: date-time }
 *     responses:
 *       200: { description: 구독 변경 완료 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: 내 구독 서비스 해지
 *     tags: [Subscriptions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: subscriptionId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: 구독 해지 완료 }
 *       404: { $ref: '#/components/responses/NotFound' }
 */

/**
 * @openapi
 * /api/usage/me:
 *   get:
 *     summary: 내 통신 사용량 리포트 조회
 *     tags: [Usage]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 사용량 리포트
 *         content: { application/json: { schema: { $ref: '#/components/schemas/UsageReport' } } }
 *       404: { $ref: '#/components/responses/NotFound' }
 * /api/usage/me/recommendation:
 *   post:
 *     summary: 사용 패턴 기반 AI 요금제 재추천
 *     tags: [Usage]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 재추천 결과
 *         content: { application/json: { schema: { $ref: '#/components/schemas/UsageRecommendation' } } }
 *       409: { $ref: '#/components/responses/Conflict' }
 * /api/usage/me/demo/{scenario}:
 *   post:
 *     summary: 사용 패턴 시연 데이터 적용
 *     description: 개발 환경에서만 제공됩니다.
 *     tags: [Usage]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: scenario, required: true, schema: { type: string, enum: [baseline, usage-drop] } }
 *     responses:
 *       200: { description: 시연 데이터 적용 완료 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */

/**
 * @openapi
 * /api/benefits:
 *   get:
 *     summary: 혜택 목록 조회
 *     tags: [Benefits]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: 혜택 목록 }
 * /api/benefits/nearby:
 *   get:
 *     summary: 주변 혜택 조회
 *     tags: [Benefits]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: lat, required: true, schema: { type: number } }
 *       - { in: query, name: lng, required: true, schema: { type: number } }
 *     responses:
 *       200: { description: 거리순 주변 혜택 목록 }
 *       400: { $ref: '#/components/responses/BadRequest' }
 * /api/benefits/saved/me:
 *   get:
 *     summary: 저장한 혜택 목록 조회
 *     tags: [Benefits]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: 저장한 혜택 목록 }
 * /api/benefits/{code}/saved:
 *   put:
 *     summary: 혜택 저장
 *     tags: [Benefits]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: code, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: 저장 완료 }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: 저장한 혜택 해제
 *     tags: [Benefits]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: code, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: 저장 해제 완료 }
 *       404: { $ref: '#/components/responses/NotFound' }
 * /api/benefits/{code}:
 *   get:
 *     summary: 혜택 상세 조회
 *     tags: [Benefits]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: code, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: 혜택 상세 }
 *       404: { $ref: '#/components/responses/NotFound' }
 */

/**
 * @openapi
 * /api/missions/me:
 *   get:
 *     summary: 내 미션 목록 조회
 *     tags: [Missions]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: 참여 상태가 포함된 미션 목록 }
 * /api/missions/{code}/join:
 *   post:
 *     summary: 미션 참여
 *     tags: [Missions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: code, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: 참여 완료 }
 *       409: { $ref: '#/components/responses/Conflict' }
 * /api/missions/{code}/claim:
 *   patch:
 *     summary: 미션 보상 받기
 *     tags: [Missions]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: code, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: 보상 지급 완료 }
 *       409: { $ref: '#/components/responses/Conflict' }
 */

/**
 * @openapi
 * /api/stores:
 *   get:
 *     summary: 매장 목록 검색
 *     tags: [Stores]
 *     parameters:
 *       - { in: query, name: keyword, schema: { type: string } }
 *       - { in: query, name: region, schema: { type: string } }
 *       - { in: query, name: service, schema: { type: string } }
 *       - { in: query, name: lat, schema: { type: number } }
 *       - { in: query, name: lng, schema: { type: number } }
 *     responses:
 *       200: { description: 검색 조건에 맞는 매장 목록 }
 * /api/stores/{code}:
 *   get:
 *     summary: 매장 상세 조회
 *     tags: [Stores]
 *     parameters:
 *       - { in: path, name: code, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: 매장 상세 }
 *       404: { $ref: '#/components/responses/NotFound' }
 */

/**
 * @openapi
 * /api/plans:
 *   get:
 *     summary: 요금제 목록 조회
 *     tags: [Plans]
 *     responses:
 *       200: { description: 활성 요금제 목록 }
 * /api/plans/me/compare:
 *   get:
 *     summary: 내 요금제와 비교할 목록 조회
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: 비교 가능한 요금제 목록 }
 * /api/plans/me/current:
 *   get:
 *     summary: 현재 이용 중인 요금제 조회
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: 현재 요금제 }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: 현재 요금제 해지
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: 해지 완료 }
 *       404: { $ref: '#/components/responses/NotFound' }
 * /api/plans/{code}/join:
 *   post:
 *     summary: 폐기된 직접 가입 API (AI 상담 가입 절차 사용)
 *     deprecated: true
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: code, required: true, schema: { type: string } }
 *     responses:
 *       410:
 *         description: SIGNUP_FLOW_REQUIRED - 서버가 검증하는 AI 채팅 가입 절차를 완료해야 합니다.
 *       401: { description: 로그인 필요 }
 * /api/plans/{code}/change:
 *   patch:
 *     summary: 폐기된 직접 가입 API (AI 상담 가입 절차 사용)
 *     deprecated: true
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: code, required: true, schema: { type: string } }
 *     responses:
 *       410:
 *         description: SIGNUP_FLOW_REQUIRED - 서버가 검증하는 AI 채팅 가입 절차를 완료해야 합니다.
 *       401: { description: 로그인 필요 }
 * /api/plans/{code}:
 *   get:
 *     summary: 요금제 상세 조회
 *     tags: [Plans]
 *     parameters:
 *       - { in: path, name: code, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: 요금제 상세 }
 *       404: { $ref: '#/components/responses/NotFound' }
 */

/**
 * @openapi
 * /api/rewards/attendance:
 *   get:
 *     summary: 출석 현황 조회
 *     tags: [Rewards]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: 월별 출석 현황 }
 * /api/rewards/attendance/check-in:
 *   post:
 *     summary: 오늘 출석 체크
 *     tags: [Rewards]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: 출석 체크 및 포인트 지급 완료 }
 *       409: { $ref: '#/components/responses/Conflict' }
 * /api/rewards/points:
 *   get:
 *     summary: 내 포인트 지갑 조회
 *     tags: [Rewards]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: 보유 포인트와 거래 요약 }
 * /api/rewards/benefit-calendar:
 *   get:
 *     summary: 월별 혜택 캘린더 조회
 *     tags: [Rewards]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: month, schema: { type: string, example: 2026-09 } }
 *     responses:
 *       200: { description: 월별 혜택 일정 }
 */

export {};
