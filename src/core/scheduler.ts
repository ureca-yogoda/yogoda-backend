import cron from "node-cron";

import {
  notifyExpiringCoupons,
  notifyAttendanceReminder,
  notifyIncompleteConsultations,
} from "../services/notification.service.js";

// 매일 오전 9시(KST 기준 서버 타임존 설정을 따름)에 만료 임박 쿠폰을 스캔함
const COUPON_EXPIRING_CRON = "0 9 * * *";
// 매일 저녁 20시에 그날 출석 체크를 안 한 유저에게 리마인드함
const ATTENDANCE_REMINDER_CRON = "0 20 * * *";
// 30분마다 오래 방치된 AI 상담 세션을 스캔해 리마인드함
const CONSULTATION_INCOMPLETE_CRON = "*/30 * * * *";

/**
 * cron 등록 + 실패 시 로깅을 한 곳에서 처리하는 헬퍼.
 * 알림 배치 작업들이 늘어나도 이 패턴을 재사용해서 등록만 추가하면 됨
 */
function scheduleJob(
  cronExpression: string,
  label: string,
  job: () => Promise<unknown>,
) {
  cron.schedule(cronExpression, () => {
    job().catch((err) => {
      console.error(`${label} 스케줄러 실패:`, err);
    });
  });
}

/**
 * 서버가 뜬 뒤 한 번만 호출해서, 알림 등 시간 기반 배치 작업들을 등록합니다.
 * 서버가 여러 인스턴스로 뜨는 배포 환경에서는 각 인스턴스가 모두 cron을 등록하므로
 * 알림이 중복 시도될 수 있지만, notification.service의 dedupe_key(unique 인덱스)가
 * 실질적인 중복 생성은 막아줍니다.
 */
export function startScheduledJobs() {
  scheduleJob(
    COUPON_EXPIRING_CRON,
    "쿠폰 만료 임박 알림",
    notifyExpiringCoupons,
  );
  scheduleJob(
    ATTENDANCE_REMINDER_CRON,
    "출석 리마인드 알림",
    notifyAttendanceReminder,
  );
  scheduleJob(
    CONSULTATION_INCOMPLETE_CRON,
    "AI 상담 미완료 알림",
    notifyIncompleteConsultations,
  );
}
