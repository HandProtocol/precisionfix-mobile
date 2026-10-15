// The pricing a customer reads right above "Request this time" (koH,
// 2026-10-14, the same lines koordi's funnel says): the deposit that holds
// the time and goes toward the first hour, the gas surcharge, the hourly
// rate. config.booking.deposit gives the deposit; config.booking.pricing
// gives the hourly rate and the surcharge (cents). Pure: no I/O.

const WORDS = Object.freeze({
  en: {
    title: 'Pricing',
    depositToward: (deposit, hourly, rest) => `A ${deposit} deposit holds your time and goes toward the first hour (${hourly}): ${rest} more when we arrive, then ${hourly} each hour after.`,
    deposit: (deposit) => `A ${deposit} deposit holds your time and comes off the bill.`,
    surcharge: (amount) => `A ${amount} gas surcharge is added.`,
    hourly: (hourly) => `Work is ${hourly} per hour.`,
  },
  es: {
    title: 'Precios',
    depositToward: (deposit, hourly, rest) => `Un depósito de ${deposit} reserva su hora y cuenta para la primera hora (${hourly}): ${rest} más cuando llegamos, luego ${hourly} cada hora después.`,
    deposit: (deposit) => `Un depósito de ${deposit} reserva su hora y se descuenta de la cuenta.`,
    surcharge: (amount) => `Se añade un recargo de ${amount} por gasolina.`,
    hourly: (hourly) => `El trabajo es ${hourly} por hora.`,
  },
});
export const pricingWords = (lang) => WORDS[lang === 'es' ? 'es' : 'en'];

// Always two decimals ("$50.00"), unlike lib/stripe.mjs fmtMoney.
export function fmtCents(cents, currency = 'usd', lang = 'en') {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(lang === 'es' ? 'es-MX' : 'en-US', { style: 'currency', currency: currency.toUpperCase(), currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  } catch (_) {
    return `${value.toFixed(2)} ${currency.toUpperCase()}`;
  }
}

// The lines in order: the deposit (toward the first hour when there is an
// hourly rate above it), the surcharge, the hourly rate when the deposit
// line did not already say it. [] when the site states no pricing.
// `deposit: false` (the site has no Stripe key yet, lib/stripe.mjs
// stripeConfigured()) leaves the deposit out: the page must not promise a
// deposit the flow never asks for.
export function pricingLines(booking, lang = 'en', { deposit: withDeposit = true } = {}) {
  if (!booking) return [];
  const w = pricingWords(lang);
  const deposit = withDeposit && booking.deposit ? booking.deposit.amount : 0;
  const currency = (booking.deposit && booking.deposit.currency) || (booking.pricing && booking.pricing.currency) || 'usd';
  const hourly = booking.pricing ? booking.pricing.hourly : 0;
  const surcharge = booking.pricing ? booking.pricing.surcharge : 0;
  const money = (cents) => fmtCents(cents, currency, lang);
  const toward = deposit && hourly && deposit < hourly;
  return [
    toward ? w.depositToward(money(deposit), money(hourly), money(hourly - deposit)) : deposit ? w.deposit(money(deposit)) : '',
    surcharge ? w.surcharge(money(surcharge)) : '',
    !toward && hourly ? w.hourly(money(hourly)) : '',
  ].filter(Boolean);
}
