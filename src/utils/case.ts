function camelKey(key: string) {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function toCamelCaseDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => toCamelCaseDeep(item)) as T;
  }
  if (
    value === null ||
    typeof value !== "object" ||
    value instanceof Date ||
    "_bsontype" in value
  ) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      camelKey(key),
      toCamelCaseDeep(item),
    ]),
  ) as T;
}
