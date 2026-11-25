/**
 * Bounded pagination parsing for list endpoints.
 *
 * Prisma rejects negative or fractional `take`/`skip`, and a huge `page` can
 * still produce an offset scan that keeps a connection open. Every value is
 * parsed as a positive integer, capped, and the resulting offset is bounded.
 */
const MAX_OFFSET = 1_000_000;

export type PaginationOptions = {
  defaultPageSize: number;
  maxPageSize: number;
};

export type Pagination = {
  page: number;
  pageSize: number;
  skip: number;
};

function positiveInt(raw: string | null, fallback: number, max: number): number {
  if (raw === null) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    return fallback;
  }
  return Math.min(value, max);
}

export function parsePagination(
  params: URLSearchParams,
  { defaultPageSize, maxPageSize }: PaginationOptions
): Pagination {
  const pageSize = positiveInt(params.get("pageSize"), defaultPageSize, maxPageSize);
  const maxPage = Math.max(1, Math.floor(MAX_OFFSET / pageSize) + 1);
  const page = positiveInt(params.get("page"), 1, maxPage);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

/** Bounded single limit for sweeps that do not use offset pagination. */
export function parsePositiveLimit(raw: string | null, fallback: number, max: number): number {
  return positiveInt(raw, fallback, max);
}
