// PrecisionFix booking calendar (request mode): the funnel (day and time →
// details → sent → the car, optional), the pricing said before sending, and
// the owner's default hours. Cities come from the content document, so the
// owner edits them in the Content tab and the form follows. Engine:
// lib/booking.mjs, lib/booking-form.mjs, lib/booking-car.mjs.

export const BOOKING = {
  mode: 'request',
  tz: 'America/Chicago',

  // One service, no pick (koH, 2026-10-14): every request starts as a
  // mobile visit; the owner's Services list stays on the page as what he
  // does, not as a form choice. The form renders a single service as a
  // hidden field and the funnel skips the step.
  services: [{ key: 'visit', label: 'Mobile visit', label_es: 'Visita a domicilio' }],

  // Nothing about the car before the time is requested. The car (VIN or
  // year, make, and model) and what the customer noticed are asked after
  // the request is sent, in the funnel's last step, and land in their own
  // columns (lib/booking-car.mjs), not in intake.
  intake: [],

  // The mechanic drives to the car: street address + a city from Service area.
  location: {
    kind: 'at_customer',
    address: true,
    cities: (c) => ((c.area && c.area.cities) || []).map((x) => x.name).filter(Boolean),
  },

  notes: {
    label: 'Anything we should know? (optional)',
    label_es: '¿Algo que debamos saber? (opcional)',
    required: false,
    max: 1500,
    placeholder: 'Where the car is parked, a gate code, the best time to reach you',
    placeholder_es: 'Dónde está el carro, un código de acceso, la mejor hora para contactarte',
  },

  contact: ['text', 'call'],

  // The $50 deposit (decision 2026-10-14): requesting a time is free; when
  // Alex confirms, the confirmation email carries a Pay link (Stripe Checkout
  // on Alex's own Stripe account) and the time is held 24 hours for it. The
  // deposit comes off the bill. Refunded only if Alex cancels; a customer
  // cancel or a no-show keeps it. Env: PRECISIONFIX_STRIPE_SECRET_KEY +
  // PRECISIONFIX_STRIPE_WEBHOOK_SECRET. The copy below that quotes "$50"
  // (steps, FAQ, note) is the owner's and must follow this amount.
  deposit: { amount: 5000, currency: 'usd', hold_hours: 24, credited: true },

  // Said above "Request this time" with the deposit (lib/booking-pricing.mjs):
  // the deposit goes toward the first hour at this rate, the rest on arrival,
  // then the rate each hour; the gas surcharge is added. Cents.
  pricing: { hourly: 15000, surcharge: 2000, currency: 'usd' },

  // Owner notification recipients: PRECISIONFIX_BOOKING_NOTIFY env (comma
  // list) → this list → PRECISIONFIX_OWNER_EMAILS.
  notify: [],

  // Defaults for the Booking calendar section in /admin/ (the owner edits them).
  defaults: {
    hours: [
      { day: 'mon', from: '08:00', to: '18:00' },
      { day: 'tue', from: '08:00', to: '18:00' },
      { day: 'wed', from: '08:00', to: '18:00' },
      { day: 'thu', from: '08:00', to: '18:00' },
      { day: 'fri', from: '08:00', to: '18:00' },
      { day: 'sat', from: '09:00', to: '15:00' },
    ],
    windows: [
      { label: 'Morning', label_es: 'Mañana', from: '08:00', to: '11:00' },
      { label: 'Midday', label_es: 'Mediodía', from: '11:00', to: '14:00' },
      { label: 'Afternoon', label_es: 'Tarde', from: '14:00', to: '18:00' },
    ],
    lead: '4',
    horizon: '30',
    mode: 'windows',
    confirm_within: 'I confirm every request by text or call, usually within a couple of hours.',
    confirm_within_es: 'Confirmo cada solicitud por texto o llamada, normalmente en un par de horas.',
    expect: 'I will text or call before I head your way. Have the car somewhere I can open the hood and get underneath, and the keys handy. Payment is due when the job is done.',
    expect_es: 'Te escribo o te llamo antes de salir hacia ti. Deja el auto donde pueda abrir el cofre y meterme debajo, y ten las llaves a la mano. El pago se hace al terminar el trabajo.',
  },
};
