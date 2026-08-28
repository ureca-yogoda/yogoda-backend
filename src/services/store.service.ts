import { StoreModel, type StoreService } from "../models/store.model.js";
import { AppError } from "../utils/AppError.js";

export interface StoreQuery {
  keyword?: string;
  region?: string;
  service?: StoreService;
  latitude?: number;
  longitude?: number;
}

function getDistanceKm(
  latitude: number,
  longitude: number,
  coordinates: [number, number],
) {
  const earthRadiusKm = 6371;
  const toRadians = (degree: number) => (degree * Math.PI) / 180;
  const [storeLongitude, storeLatitude] = coordinates;
  const latitudeDelta = toRadians(storeLatitude - latitude);
  const longitudeDelta = toRadians(storeLongitude - longitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitude)) *
      Math.cos(toRadians(storeLatitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function serializeStore(
  store: Awaited<ReturnType<typeof StoreModel.findOne>>,
  latitude?: number,
  longitude?: number,
) {
  if (!store) return null;
  const item = store.toObject();
  const distanceKm =
    latitude !== undefined && longitude !== undefined
      ? getDistanceKm(latitude, longitude, item.location.coordinates)
      : null;

  return {
    id: item._id.toString(),
    code: item.code,
    name: item.name,
    region: item.region,
    district: item.district,
    address: item.address,
    phone: item.phone,
    hours: {
      weekday: item.weekday_hours,
      saturday: item.saturday_hours,
      sunday: item.sunday_hours,
    },
    services: item.services,
    coordinates: {
      latitude: item.location.coordinates[1],
      longitude: item.location.coordinates[0],
    },
    isDirect: item.is_direct,
    distanceKm: distanceKm === null ? null : Number(distanceKm.toFixed(1)),
  };
}

export async function getStores(query: StoreQuery) {
  const filter = {
    is_active: true,
    is_direct: true,
    ...(query.region && { region: query.region }),
    ...(query.service && { services: query.service }),
    ...(query.keyword && {
      $or: [
        { name: { $regex: query.keyword, $options: "i" } },
        { address: { $regex: query.keyword, $options: "i" } },
      ],
    }),
  };
  const stores = await StoreModel.find(filter).sort({ region: 1, name: 1 });
  const items = stores
    .map((store) => serializeStore(store, query.latitude, query.longitude))
    .filter((store) => store !== null);

  if (query.latitude !== undefined && query.longitude !== undefined) {
    items.sort(
      (first, second) =>
        (first.distanceKm ?? Number.MAX_VALUE) -
        (second.distanceKm ?? Number.MAX_VALUE),
    );
  }

  return {
    stores: items,
    regions: await StoreModel.distinct("region", {
      is_active: true,
      is_direct: true,
    }),
  };
}

export async function getStoreByCode(code: string) {
  const store = await StoreModel.findOne({ code, is_active: true });
  const serialized = serializeStore(store);
  if (!serialized) throw new AppError(404, "매장을 찾을 수 없어요.");
  return serialized;
}
