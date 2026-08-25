import { env } from "../core/config/env.js";

interface GeocodingResponse {
  status: string;
  addresses: Array<{ x: string; y: string }>;
}

export async function geocodeAddress(address: string) {
  if (!env.NAVER_MAP_KEY_ID || !env.NAVER_MAP_KEY_SECRET) {
    throw new Error("NAVER Maps Geocoding 인증 정보가 설정되지 않음");
  }
  const url = new URL("https://maps.apigw.ntruss.com/map-geocode/v2/geocode");
  url.searchParams.set("query", address);
  url.searchParams.set("count", "1");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-ncp-apigw-api-key-id": env.NAVER_MAP_KEY_ID,
      "x-ncp-apigw-api-key": env.NAVER_MAP_KEY_SECRET,
    },
  });
  if (!response.ok) {
    throw new Error(`Geocoding 요청 실패: ${response.status}`);
  }
  const body = (await response.json()) as GeocodingResponse;
  const result = body.addresses[0];
  if (body.status !== "OK" || !result) {
    throw new Error(`주소 좌표를 찾을 수 없음: ${address}`);
  }
  return { longitude: Number(result.x), latitude: Number(result.y) };
}
