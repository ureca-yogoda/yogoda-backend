import type { NextFunction, Request, Response } from "express";

import type { StoreService } from "../../models/store.model.js";
import { getStoreByCode, getStores } from "../../services/store.service.js";

const services: StoreService[] = [
  "mobile",
  "internet",
  "payment",
  "support",
  "data_transfer",
];

function getCoordinate(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : undefined;
}

export async function getStoresHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const requestedService = req.query.service;
    if (
      requestedService !== undefined &&
      (typeof requestedService !== "string" ||
        !services.includes(requestedService as StoreService))
    ) {
      res.status(400).json({ message: "지원하지 않는 매장 서비스예요." });
      return;
    }

    res.status(200).json(
      await getStores({
        keyword:
          typeof req.query.keyword === "string" ? req.query.keyword : undefined,
        region:
          typeof req.query.region === "string" ? req.query.region : undefined,
        service: requestedService as StoreService | undefined,
        latitude: getCoordinate(req.query.latitude),
        longitude: getCoordinate(req.query.longitude),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getStoreByCodeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.status(200).json(await getStoreByCode(String(req.params.code)));
  } catch (error) {
    next(error);
  }
}
