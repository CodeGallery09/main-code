/**
 * Mobile and WhatsApp number rules, backed by libphonenumber-js — Google's
 * libphonenumber metadata, so the country codes and the digit lengths are the
 * library's, not a table we maintain. The `/max` build is used because it is
 * the one that carries the full per-country length and range data, and these
 * checks only ever run on the server.
 *
 * The rule: a number carries a leading "+" country code and exactly as many
 * digits as that country allows. `isValid()` is that check — "+91 9820055123"
 * passes, the same number with an eleventh digit does not. When it fails we
 * work out whether the length was the problem so the error log can say so.
 *
 * Only libphonenumber-js is imported, so this module still loads directly
 * under `node --test`.
 */

import { getCountries, getExampleNumber, parsePhoneNumberFromString } from "libphonenumber-js/max";
import examples from "libphonenumber-js/examples.mobile.json";
import type { CellCheck } from "./validation";

type CountryCode = Parameters<typeof getExampleNumber>[0];

const digits = (value: string) => value.replace(/\D/g, "");

/** How many national digits that country's mobile numbers have. */
function exampleLength(country: string | undefined): number | null {
  if (!country) return null;
  try {
    const example = getExampleNumber(country as CountryCode, examples);
    return example ? example.nationalNumber.length : null;
  } catch {
    return null;
  }
}

export function checkPhone(raw: string): CellCheck {
  const value = raw.trim();
  if (!value) return { ok: false, reason: "Number is blank" };
  if (!value.startsWith("+")) return { ok: false, reason: "No country code — the number must start with +" };

  const parsed = parsePhoneNumberFromString(value);
  if (!parsed) {
    return { ok: false, reason: `Country code +${digits(value).slice(0, 3)} is not recognised` };
  }
  if (parsed.isValid()) return { ok: true, value: parsed.number };

  const code = parsed.countryCallingCode;
  const found = parsed.nationalNumber.length;
  const expected = exampleLength(parsed.country);
  if (expected !== null && found !== expected) {
    return {
      ok: false,
      reason: `Invalid digit count for country code +${code} — needs exactly ${expected} digits, found ${found}`,
    };
  }
  if (!parsed.isPossible()) {
    return { ok: false, reason: `Invalid digit count for country code +${code} — ${found} digits` };
  }
  return { ok: false, reason: `Not a valid number for country code +${code}` };
}

/** How many country codes the library knows, for the note in the upload modal. */
export const COUNTRY_CODE_COUNT = getCountries().length;
