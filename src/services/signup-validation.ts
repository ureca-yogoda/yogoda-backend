import type { SignupCollectedData, SignupStep } from "../types/chat.js";

type Identity = { name: string; birth: string; phoneNumber: string };
type Benefit = {
  code: string;
  required: boolean;
  selectionCount: number;
  options: { code: string }[];
};

export function validateIdentityInput(value: unknown): void {
  if (!value || typeof value !== "object")
    throw new Error("본인 확인 정보가 필요합니다.");
  const identity = value as Partial<Identity>;
  if (
    typeof identity.name !== "string" ||
    !identity.name.trim() ||
    typeof identity.birth !== "string" ||
    !/^\d{8}$/.test(identity.birth) ||
    typeof identity.phoneNumber !== "string" ||
    !/^01[016789]\d{7,8}$/.test(identity.phoneNumber.replace(/-/g, ""))
  ) {
    throw new Error("본인 확인 정보를 다시 입력해 주세요.");
  }
}

export function assertSignupReady(
  step: SignupStep | undefined,
  data: SignupCollectedData | undefined,
  benefits: Benefit[],
) {
  if (
    step !== "final_confirm" ||
    data?.fraudWarningAcknowledged !== true ||
    data.agreedToTerms !== true ||
    data.identityVerified !== true
  ) {
    throw new Error("가입 절차를 먼저 완료해 주세요.");
  }
  validateIdentityInput(data);
  if (
    !["계좌이체", "신용카드", "카카오페이", "네이버페이", "토스"].includes(
      data.paymentMethod ?? "",
    )
  ) {
    throw new Error("납부 방법을 선택해 주세요.");
  }
  const selected = data.selectedBenefits ?? {};
  if (typeof selected !== "object" || Array.isArray(selected))
    throw new Error("혜택 선택이 올바르지 않습니다.");
  for (const [code, values] of Object.entries(selected)) {
    const benefit = benefits.find((item) => item.code === code);
    if (
      !benefit ||
      !Array.isArray(values) ||
      values.length > benefit.selectionCount ||
      new Set(values).size !== values.length ||
      values.some(
        (value) =>
          typeof value !== "string" ||
          !benefit.options.some((option) => option.code === value),
      )
    ) {
      throw new Error("혜택 선택이 올바르지 않습니다.");
    }
  }
  for (const benefit of benefits) {
    if (
      benefit.required &&
      benefit.options.length > 0 &&
      (selected[benefit.code]?.length ?? 0) !== benefit.selectionCount
    ) {
      throw new Error("필수 혜택을 선택해 주세요.");
    }
  }
}
